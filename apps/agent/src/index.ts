import 'dotenv/config';
import * as readline from 'node:readline';
import { formatEther } from 'viem';
import { createPublicClient, http } from 'viem';
import { hardhat } from 'viem/chains';
import { NeuroStream } from '@neurostream/sdk';
import { createGeminiClient, createChat, sendMessage, type ToolExecutor } from './gemini.js';
import { discoverServices, invokeService } from './neurostream.js';
import { banner, divider, info, prompt, agentSays, paymentInfo, errorMsg, helpText } from './ui.js';

// ── Environment validation ───────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NEUROSTREAM_API_KEY = process.env.NEUROSTREAM_API_KEY;
const PRIVATE_KEY = process.env.NEUROSTREAM_PRIVATE_KEY as `0x${string}` | undefined;
const ESCROW_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS as `0x${string}` | undefined;
const RPC_URL = process.env.MONAD_RPC_URL || 'http://127.0.0.1:8545';

const missing = [
  !GEMINI_API_KEY && 'GEMINI_API_KEY',
  !NEUROSTREAM_API_KEY && 'NEUROSTREAM_API_KEY',
  !PRIVATE_KEY && 'NEUROSTREAM_PRIVATE_KEY',
  !ESCROW_ADDRESS && 'ESCROW_CONTRACT_ADDRESS',
].filter(Boolean);

if (missing.length > 0) {
  console.error(`[agent] Missing required env vars: ${missing.join(', ')}`);
  console.error('[agent] Copy .env.example to .env and fill in your values.');
  process.exit(1);
}

// ── Initialization ───────────────────────────────────────
const client = new NeuroStream({
  apiKey: NEUROSTREAM_API_KEY!,
  privateKey: PRIVATE_KEY!,
  rpcUrl: RPC_URL,
  escrowAddress: ESCROW_ADDRESS!,
  chainId: 31337,
});

const ai = createGeminiClient(GEMINI_API_KEY!);
const chat = createChat(ai);

const publicClient = createPublicClient({
  chain: hardhat,
  transport: http(RPC_URL),
});

// ── Tool executor: bridges Gemini function calls → NeuroStream SDK ──
const executeTool: ToolExecutor = async (name, args) => {
  if (name === 'discover_services') {
    return discoverServices(
      client,
      args.keyword as string | undefined,
      args.type as string | undefined,
    );
  }

  if (name === 'invoke_service') {
    const serviceId = args.serviceId as string;
    const endpoint = args.endpoint as string;
    const text = args.text as string;
    const result = await invokeService(client, endpoint, text, RPC_URL, serviceId);

    paymentInfo({
      requestId: result.requestId,
      cost: result.cost,
      latencyMs: result.latencyMs,
    });

    return result.result;
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` });
};

// ── Commands ─────────────────────────────────────────────
async function handleBalance(): Promise<void> {
  const balance = await publicClient.getBalance({ address: client.address });
  info('Wallet', client.address);
  info('Balance', `${formatEther(balance)} ETH`);
}

async function handleUserInput(input: string): Promise<void> {
  divider();

  const reply = await sendMessage(chat, input, executeTool, (name, args) => {
    if (name === 'discover_services') {
      console.log(`  Discovering services (keyword: ${args.keyword ?? 'all'})...`);
    } else if (name === 'invoke_service') {
      console.log(`  Calling NeuroStream (on-chain escrow payment)...`);
    }
  });

  agentSays(reply);
}

// ── REPL ─────────────────────────────────────────────────
async function main(): Promise<void> {
  banner();
  info('Escrow', ESCROW_ADDRESS!);
  info('Agent', client.address);
  info('API Key', `${NEUROSTREAM_API_KEY!.slice(0, 16)}...`);
  await handleBalance();
  helpText();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      prompt();
      return;
    }

    try {
      if (input === '/quit' || input === '/exit') {
        console.log('\nGoodbye!');
        rl.close();
        process.exit(0);
      }

      if (input === '/help') {
        helpText();
        prompt();
        return;
      }

      if (input === '/balance') {
        await handleBalance();
        prompt();
        return;
      }

      await handleUserInput(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errorMsg(message);
    }

    prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[agent] Fatal error:', err.message || err);
  process.exit(1);
});
