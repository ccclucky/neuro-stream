// Terminal UI helpers — zero dependencies, ANSI colors only

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';

export function banner(): void {
  console.log(`
${CYAN}${BOLD}╔══════════════════════════════════════════════════════════╗
║            NeuroStream AI Agent                          ║
║     Gemini-powered  ·  On-chain payments  ·  CLI         ║
╚══════════════════════════════════════════════════════════╝${RESET}
`);
}

export function divider(): void {
  console.log(`${DIM}${'─'.repeat(58)}${RESET}`);
}

export function info(label: string, value: string): void {
  console.log(`  ${DIM}${label}:${RESET} ${value}`);
}

export function prompt(): void {
  process.stdout.write(`\n${GREEN}${BOLD}You > ${RESET}`);
}

export function agentSays(text: string): void {
  console.log(`\n${MAGENTA}${BOLD}Agent >${RESET} ${text}`);
}

export function paymentInfo(data: {
  requestId: string;
  cost: string;
  latencyMs: number;
}): void {
  console.log(
    `\n${YELLOW}  ⚡ Payment${RESET}  ${DIM}id=${data.requestId.slice(0, 10)}…  cost=${data.cost} USDC  latency=${data.latencyMs}ms${RESET}`
  );
}

export function errorMsg(msg: string): void {
  console.log(`\n${RED}${BOLD}  Error:${RESET} ${RED}${msg}${RESET}`);
}

export function helpText(): void {
  console.log(`
${BOLD}Commands:${RESET}
  ${GREEN}/help${RESET}      Show this help
  ${GREEN}/balance${RESET}   Show current wallet balance
  ${GREEN}/quit${RESET}      Exit the agent

${BOLD}Usage:${RESET}
  Type any message to send it through the NeuroStream pipeline:
  ${DIM}Your input → NeuroStream (on-chain payment) → Gemini AI → Response${RESET}
`);
}
