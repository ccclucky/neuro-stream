import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { EscrowABI } from '@neurostream/sdk';

// ── Types ────────────────────────────────────────────────────────

export type ChallengeStatus =
  | 'CREATED'
  | 'ESCROW_LOCKED'
  | 'PROVIDER_CALLED'
  | 'RESULT_STORED'
  | 'CLAIMED'
  | 'COMPLETED'
  | 'FAILED'
  | 'REFUNDABLE'
  | 'REFUNDED';

export interface GatewayChallenge {
  request_id: string;
  idempotency_key: string | null;
  agent_address: string;
  service_id: string;
  provider_endpoint: string;
  gateway_address: string;
  provider_wallet: string | null;
  preimage: string;
  hash_lock: string;
  amount: string;
  deadline: number;
  status: ChallengeStatus;
  created_at: string;
  escrow_locked_at: string | null;
  provider_called_at: string | null;
  result_stored_at: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  provider_result: string | null;
  provider_http_status: number | null;
  claim_tx_hash: string | null;
  claim_attempts: number;
  last_error: string | null;
  error_count: number;
}

/** Valid forward-only state transitions */
const VALID_TRANSITIONS: Record<ChallengeStatus, ChallengeStatus[]> = {
  CREATED:         ['ESCROW_LOCKED', 'FAILED'],
  ESCROW_LOCKED:   ['PROVIDER_CALLED', 'REFUNDABLE'],
  PROVIDER_CALLED: ['RESULT_STORED', 'REFUNDABLE'],
  RESULT_STORED:   ['CLAIMED', 'REFUNDABLE'],
  CLAIMED:         ['COMPLETED', 'RESULT_STORED'], // tx revert → retry from RESULT_STORED
  COMPLETED:       [],
  FAILED:          [],
  REFUNDABLE:      ['REFUNDED'],
  REFUNDED:        [],
};

// ── Supabase helpers ─────────────────────────────────────────────

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured for Gateway');
  return { url, key };
}

async function supabaseRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { url, key } = getSupabaseConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  return res.json();
}

// ── DB Operations ────────────────────────────────────────────────

export async function createChallenge(
  challenge: Omit<GatewayChallenge, 'created_at' | 'escrow_locked_at' | 'provider_called_at' | 'result_stored_at' | 'claimed_at' | 'completed_at' | 'provider_result' | 'provider_http_status' | 'claim_tx_hash' | 'claim_attempts' | 'last_error' | 'error_count'>
): Promise<GatewayChallenge> {
  const rows = await supabaseRequest<GatewayChallenge[]>(
    'gateway_challenges',
    {
      method: 'POST',
      body: JSON.stringify(challenge),
    }
  );
  return rows[0];
}

export async function getChallenge(requestId: string): Promise<GatewayChallenge | null> {
  const rows = await supabaseRequest<GatewayChallenge[]>(
    `gateway_challenges?request_id=eq.${encodeURIComponent(requestId)}`
  );
  return rows[0] ?? null;
}

export async function getChallengeByIdempotencyKey(key: string): Promise<GatewayChallenge | null> {
  const rows = await supabaseRequest<GatewayChallenge[]>(
    `gateway_challenges?idempotency_key=eq.${encodeURIComponent(key)}`
  );
  return rows[0] ?? null;
}

/**
 * Advance state with optimistic locking (WHERE status = expectedStatus).
 * Returns updated row or null if transition was rejected.
 */
export async function advanceState(
  requestId: string,
  fromStatus: ChallengeStatus,
  toStatus: ChallengeStatus,
  patch: Partial<GatewayChallenge> = {}
): Promise<GatewayChallenge | null> {
  // Validate transition
  if (!VALID_TRANSITIONS[fromStatus]?.includes(toStatus)) {
    console.error(`[gateway] Invalid transition: ${fromStatus} → ${toStatus}`);
    return null;
  }

  // Timestamp column for the new status
  const tsCol = statusToTimestampColumn(toStatus);

  const body: Record<string, unknown> = {
    status: toStatus,
    ...patch,
  };
  if (tsCol) body[tsCol] = new Date().toISOString();

  const rows = await supabaseRequest<GatewayChallenge[]>(
    `gateway_challenges?request_id=eq.${encodeURIComponent(requestId)}&status=eq.${fromStatus}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    }
  );
  return rows[0] ?? null;
}

function statusToTimestampColumn(status: ChallengeStatus): string | null {
  switch (status) {
    case 'ESCROW_LOCKED':   return 'escrow_locked_at';
    case 'PROVIDER_CALLED': return 'provider_called_at';
    case 'RESULT_STORED':   return 'result_stored_at';
    case 'CLAIMED':         return 'claimed_at';
    case 'COMPLETED':       return 'completed_at';
    default: return null;
  }
}

// ── API Key validation ───────────────────────────────────────────

async function sha256(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function validateApiKey(apiKey: string): Promise<{ walletAddress: string } | null> {
  if (!apiKey.startsWith('ns_live_')) return null;

  const keyHash = await sha256(apiKey);
  const rows = await supabaseRequest<{ wallet_address: string; is_active: boolean }[]>(
    `api_keys?key_hash=eq.${keyHash}&is_active=eq.true&select=wallet_address,is_active`
  );

  if (rows.length === 0) return null;
  return { walletAddress: rows[0].wallet_address };
}

// ── Blockchain helpers ───────────────────────────────────────────

const createChain = (chainId: number, rpcUrl: string): Chain => ({
  id: chainId,
  name: 'Custom Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});

function getGatewayClients() {
  const rpcUrl = process.env.MONAD_RPC_URL || 'http://127.0.0.1:8545';
  const privateKey = process.env.GATEWAY_PRIVATE_KEY as `0x${string}` | undefined;
  const escrowAddress = process.env.ESCROW_CONTRACT_ADDRESS as `0x${string}` | undefined;

  if (!privateKey) throw new Error('GATEWAY_PRIVATE_KEY is required');
  if (!escrowAddress) throw new Error('ESCROW_CONTRACT_ADDRESS is required');

  const chainId = parseInt(process.env.CHAIN_ID || '31337', 10);
  const chain = createChain(chainId, rpcUrl);
  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  return { publicClient, walletClient, account, escrowAddress, chain };
}

/**
 * Verify that the escrow is locked on-chain for the given requestId.
 * If expectedProvider is given, also verify the on-chain provider matches.
 * Returns true if status == Locked(1) and provider matches (when checked).
 */
export async function verifyEscrowLocked(
  requestId: `0x${string}`,
  expectedProvider?: string,
): Promise<boolean> {
  const { publicClient, escrowAddress } = getGatewayClients();
  try {
    const payment = await publicClient.readContract({
      address: escrowAddress,
      abi: EscrowABI,
      functionName: 'getPayment',
      args: [requestId],
    });
    if (payment.status !== 1) return false; // Not Locked
    if (expectedProvider && payment.provider.toLowerCase() !== expectedProvider.toLowerCase()) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Claim payment on-chain by revealing the preimage.
 */
export async function claimPayment(
  requestId: `0x${string}`,
  preimage: `0x${string}`
): Promise<`0x${string}`> {
  const { walletClient, escrowAddress, chain, account } = getGatewayClients();
  const hash = await walletClient.writeContract({
    address: escrowAddress,
    abi: EscrowABI,
    functionName: 'claim',
    args: [requestId, preimage],
    chain,
    account,
  });
  return hash;
}

/**
 * Wait for transaction receipt.
 */
export async function waitForTx(hash: `0x${string}`) {
  const { publicClient } = getGatewayClients();
  return publicClient.waitForTransactionReceipt({ hash });
}

// ── Service lookup ───────────────────────────────────────────────

export interface ServiceInfo {
  serviceId: string;
  endpoint: string;
  pricingAmount: string;
  recipient: string;
}

export async function lookupService(serviceId: string): Promise<ServiceInfo | null> {
  const rows = await supabaseRequest<Record<string, unknown>[]>(
    `services?service_id=eq.${encodeURIComponent(serviceId)}&select=service_id,endpoint,pricing_amount,recipient`
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    serviceId: row.service_id as string,
    endpoint: row.endpoint as string,
    pricingAmount: (row.pricing_amount as string) || '0.001',
    recipient: row.recipient as string,
  };
}

// ── Crypto helpers ───────────────────────────────────────────────

export function generatePreimage(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function computeHashLock(preimage: `0x${string}`): `0x${string}` {
  return keccak256(preimage);
}

export function generateRequestId(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function getGatewayAddress(): `0x${string}` {
  const pk = process.env.GATEWAY_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) throw new Error('GATEWAY_PRIVATE_KEY is required');
  return privateKeyToAccount(pk).address;
}

// ── Provider call ────────────────────────────────────────────────

export async function callProvider(
  endpoint: string,
  params: Record<string, unknown>,
  timeoutMs = 30000
): Promise<{ result: string; httpStatus: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    const body = await res.text();
    return { result: body, httpStatus: res.status };
  } finally {
    clearTimeout(timer);
  }
}

// ── Recovery task ────────────────────────────────────────────────

export async function getStuckChallenges(): Promise<GatewayChallenge[]> {
  return supabaseRequest<GatewayChallenge[]>(
    `gateway_challenges?status=not.in.(COMPLETED,REFUNDED,FAILED)&order=created_at.asc`
  );
}

let recoveryInterval: ReturnType<typeof setInterval> | null = null;

export function startRecoveryTask(intervalMs = 30000): void {
  if (recoveryInterval) return;

  recoveryInterval = setInterval(async () => {
    try {
      const stuck = await getStuckChallenges();
      const now = Math.floor(Date.now() / 1000);

      for (const c of stuck) {
        // Deadline passed → REFUNDABLE (for any non-terminal state)
        if (c.deadline < now && !['COMPLETED', 'FAILED', 'REFUNDED', 'REFUNDABLE'].includes(c.status)) {
          await advanceState(c.request_id, c.status as ChallengeStatus, 'REFUNDABLE', {
            last_error: 'Deadline passed during recovery',
          });
          continue;
        }

        switch (c.status) {
          case 'CREATED': {
            // 15 min with no escrow lock → FAILED
            const createdAt = new Date(c.created_at).getTime();
            if (Date.now() - createdAt > 15 * 60 * 1000) {
              await advanceState(c.request_id, 'CREATED', 'FAILED', {
                last_error: 'Escrow not locked within 15 minutes',
              });
            }
            break;
          }
          case 'ESCROW_LOCKED': {
            // Resume from Phase 3: call Provider
            await processFromEscrowLocked(c);
            break;
          }
          case 'PROVIDER_CALLED': {
            // Retry if < 3 attempts
            const calledAt = new Date(c.provider_called_at!).getTime();
            if (Date.now() - calledAt > 2 * 60 * 1000 && c.claim_attempts < 3) {
              await processFromEscrowLocked(c);
            } else if (c.claim_attempts >= 3) {
              await advanceState(c.request_id, 'PROVIDER_CALLED', 'REFUNDABLE', {
                last_error: 'Provider retry limit exceeded',
              });
            }
            break;
          }
          case 'RESULT_STORED': {
            // Retry claim
            await processClaimAndComplete(c);
            break;
          }
          case 'CLAIMED': {
            // Check tx status
            if (c.claim_tx_hash) {
              await processCheckClaimTx(c);
            }
            break;
          }
        }
      }
    } catch (err) {
      console.error('[gateway:recovery]', err);
    }
  }, intervalMs);
}

export function stopRecoveryTask(): void {
  if (recoveryInterval) {
    clearInterval(recoveryInterval);
    recoveryInterval = null;
  }
}

// ── Phase processors (used by both API route and recovery) ───────

export async function processFromEscrowLocked(challenge: GatewayChallenge): Promise<GatewayChallenge | null> {
  // Phase 3a: Mark PROVIDER_CALLED
  const updated = await advanceState(
    challenge.request_id,
    challenge.status as ChallengeStatus,
    'PROVIDER_CALLED'
  );
  if (!updated) return null;

  // Phase 3b: Call provider
  try {
    // Parse the original params from the challenge — we store them in provider_result temporarily
    // Actually, we forward the original params. For simplicity, we pass { text: ... } from the original request
    // The Gateway stores the params in the invoke request. For recovery, we re-call with minimal payload.
    const { result, httpStatus } = await callProvider(
      challenge.provider_endpoint,
      { text: 'recovery-call' } // Recovery can only do best-effort
    );

    if (httpStatus >= 200 && httpStatus < 300) {
      // Phase 4: Store result
      const stored = await advanceState(challenge.request_id, 'PROVIDER_CALLED', 'RESULT_STORED', {
        provider_result: result,
        provider_http_status: httpStatus,
      });
      if (stored) {
        // Phase 5: Claim
        return processClaimAndComplete(stored);
      }
    } else {
      await advanceState(challenge.request_id, 'PROVIDER_CALLED', 'REFUNDABLE', {
        last_error: `Provider returned HTTP ${httpStatus}`,
        provider_http_status: httpStatus,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabaseRequest(
      `gateway_challenges?request_id=eq.${encodeURIComponent(challenge.request_id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          last_error: msg,
          error_count: challenge.error_count + 1,
        }),
      }
    );
  }
  return null;
}

export async function processClaimAndComplete(challenge: GatewayChallenge): Promise<GatewayChallenge | null> {
  try {
    const claimAttempts = challenge.claim_attempts + 1;

    // Claim on-chain
    const txHash = await claimPayment(
      challenge.request_id as `0x${string}`,
      challenge.preimage as `0x${string}`
    );

    // Mark CLAIMED
    const claimed = await advanceState(challenge.request_id, 'RESULT_STORED', 'CLAIMED', {
      claim_tx_hash: txHash,
      claim_attempts: claimAttempts,
    });

    if (!claimed) {
      // Maybe already CLAIMED from a prior attempt — check
      const existing = await getChallenge(challenge.request_id);
      if (existing?.status === 'CLAIMED' || existing?.status === 'COMPLETED') {
        return existing;
      }
      return null;
    }

    // Wait for tx confirmation
    await waitForTx(txHash);

    // Mark COMPLETED
    return advanceState(challenge.request_id, 'CLAIMED', 'COMPLETED');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // If "PaymentNotLocked" → already claimed, treat as success
    if (msg.includes('PaymentNotLocked')) {
      const completed = await advanceState(challenge.request_id, 'RESULT_STORED', 'CLAIMED', {
        claim_attempts: challenge.claim_attempts + 1,
      });
      if (completed) {
        return advanceState(challenge.request_id, 'CLAIMED', 'COMPLETED');
      }
      // Might already be completed
      return getChallenge(challenge.request_id);
    }

    // Record error
    await supabaseRequest(
      `gateway_challenges?request_id=eq.${encodeURIComponent(challenge.request_id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          last_error: msg,
          error_count: challenge.error_count + 1,
          claim_attempts: challenge.claim_attempts + 1,
        }),
      }
    );
    return null;
  }
}

async function processCheckClaimTx(challenge: GatewayChallenge): Promise<void> {
  try {
    const { publicClient } = getGatewayClients();
    const receipt = await publicClient.getTransactionReceipt({
      hash: challenge.claim_tx_hash as `0x${string}`,
    });
    if (receipt.status === 'success') {
      await advanceState(challenge.request_id, 'CLAIMED', 'COMPLETED');
    } else {
      // Tx reverted — go back to RESULT_STORED for retry
      await advanceState(challenge.request_id, 'CLAIMED', 'RESULT_STORED', {
        last_error: 'Claim transaction reverted',
      });
    }
  } catch {
    // Tx not yet mined — wait
  }
}
