import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeEventTopics, encodeAbiParameters, getAddress } from 'viem';
import { createIndexer, type IndexerDeps } from '../src/indexer.js';
import { EscrowABI } from '../src/abi.js';

// --- Helpers to build mock logs ---

function makePaymentLockedLog(args: {
  requestId: `0x${string}`;
  agent: `0x${string}`;
  provider: `0x${string}`;
  amount: bigint;
  hashLock: `0x${string}`;
  deadline: bigint;
}, blockNumber: bigint = 10n) {
  const topics = encodeEventTopics({
    abi: EscrowABI,
    eventName: 'PaymentLocked',
    args: { requestId: args.requestId, agent: args.agent, provider: args.provider },
  });
  const data = encodeAbiParameters(
    [
      { type: 'uint256', name: 'amount' },
      { type: 'bytes32', name: 'hashLock' },
      { type: 'uint64', name: 'deadline' },
    ],
    [args.amount, args.hashLock, args.deadline],
  );
  return {
    address: '0x1234' as `0x${string}`,
    topics,
    data,
    blockNumber,
    transactionHash: '0xabc' as `0x${string}`,
    blockHash: '0x0' as `0x${string}`,
    logIndex: 0,
    transactionIndex: 0,
    removed: false,
  };
}

function makePaymentReleasedLog(args: {
  requestId: `0x${string}`;
  provider: `0x${string}`;
  amount: bigint;
  preimage: `0x${string}`;
}, blockNumber: bigint = 10n) {
  const topics = encodeEventTopics({
    abi: EscrowABI,
    eventName: 'PaymentReleased',
    args: { requestId: args.requestId, provider: args.provider },
  });
  const data = encodeAbiParameters(
    [
      { type: 'uint256', name: 'amount' },
      { type: 'bytes32', name: 'preimage' },
    ],
    [args.amount, args.preimage],
  );
  return {
    address: '0x1234' as `0x${string}`,
    topics,
    data,
    blockNumber,
    transactionHash: '0xdef' as `0x${string}`,
    blockHash: '0x0' as `0x${string}`,
    logIndex: 0,
    transactionIndex: 0,
    removed: false,
  };
}

function makePaymentRefundedLog(args: {
  requestId: `0x${string}`;
  agent: `0x${string}`;
  amount: bigint;
}, blockNumber: bigint = 10n) {
  const topics = encodeEventTopics({
    abi: EscrowABI,
    eventName: 'PaymentRefunded',
    args: { requestId: args.requestId, agent: args.agent },
  });
  const data = encodeAbiParameters(
    [{ type: 'uint256', name: 'amount' }],
    [args.amount],
  );
  return {
    address: '0x1234' as `0x${string}`,
    topics,
    data,
    blockNumber,
    transactionHash: '0xfed' as `0x${string}`,
    blockHash: '0x0' as `0x${string}`,
    logIndex: 0,
    transactionIndex: 0,
    removed: false,
  };
}

// --- Mock Supabase ---

function createMockSupabase() {
  const store: Record<string, Record<string, unknown>[]> = {
    indexer_state: [{ id: 1, last_processed_block: 0 }],
    payments: [],
  };

  function from(table: string) {
    const rows = store[table] ?? [];

    return {
      select: (_cols: string) => ({
        eq: (_col: string, _val: unknown) => ({
          single: () => {
            const row = rows.find((r) => (r as Record<string, unknown>)[_col] === _val);
            return Promise.resolve({ data: row ?? null, error: row ? null : { message: 'Not found' } });
          },
        }),
      }),
      upsert: (row: Record<string, unknown>, _opts?: Record<string, unknown>) => {
        const existing = rows.findIndex(
          (r) => (r as Record<string, unknown>).request_id === row.request_id,
        );
        if (existing >= 0) {
          rows[existing] = { ...rows[existing], ...row };
        } else {
          rows.push(row);
        }
        return Promise.resolve({ error: null });
      },
      update: (updates: Record<string, unknown>) => ({
        eq: (col: string, val: unknown) => {
          const idx = rows.findIndex((r) => (r as Record<string, unknown>)[col] === val);
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], ...updates };
          }
          return Promise.resolve({ error: null });
        },
      }),
    };
  }

  return { from, _store: store };
}

// --- Tests ---

const REQUEST_ID = '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`;
// Use checksummed addresses (viem validates checksums)
const AGENT = getAddress('0x000000000000000000000000000000000000000a');
const PROVIDER = getAddress('0x000000000000000000000000000000000000000b');
const HASH_LOCK = '0x0000000000000000000000000000000000000000000000000000000000000abc' as `0x${string}`;
const PREIMAGE = '0x0000000000000000000000000000000000000000000000000000000000000def' as `0x${string}`;

describe('createIndexer', () => {
  let mockViem: { getLogs: ReturnType<typeof vi.fn>; getBlockNumber: ReturnType<typeof vi.fn> };
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let deps: IndexerDeps;

  beforeEach(() => {
    mockViem = {
      getLogs: vi.fn().mockResolvedValue([]),
      getBlockNumber: vi.fn().mockResolvedValue(0n),
    };
    mockSupabase = createMockSupabase();
    deps = {
      viemClient: mockViem as unknown as IndexerDeps['viemClient'],
      supabase: mockSupabase as unknown as IndexerDeps['supabase'],
      escrowAddress: '0x1234' as `0x${string}`,
      pollIntervalMs: 1000,
    };
  });

  it('returns 0 when no new blocks', async () => {
    mockViem.getBlockNumber.mockResolvedValue(0n);
    const indexer = createIndexer(deps);
    const count = await indexer.poll();
    expect(count).toBe(0);
  });

  it('processes PaymentLocked event and inserts into payments', async () => {
    mockViem.getBlockNumber.mockResolvedValue(10n);
    mockViem.getLogs.mockResolvedValue([
      makePaymentLockedLog({
        requestId: REQUEST_ID,
        agent: AGENT,
        provider: PROVIDER,
        amount: 1000n,
        hashLock: HASH_LOCK,
        deadline: 9999n,
      }),
    ]);

    const indexer = createIndexer(deps);
    const count = await indexer.poll();

    expect(count).toBe(1);
    expect(mockSupabase._store.payments).toHaveLength(1);
    expect(mockSupabase._store.payments[0]).toMatchObject({
      request_id: REQUEST_ID,
      agent: AGENT.toLowerCase(),
      provider: PROVIDER.toLowerCase(),
      amount: '1000',
      status: 'Locked',
      preimage: null,
    });
  });

  it('processes PaymentReleased event and updates status + preimage', async () => {
    // Seed a Locked payment first
    mockSupabase._store.payments.push({
      request_id: REQUEST_ID,
      agent: AGENT.toLowerCase(),
      provider: PROVIDER.toLowerCase(),
      amount: '1000',
      hash_lock: HASH_LOCK,
      deadline: 9999,
      status: 'Locked',
      preimage: null,
      tx_hash: '0xabc',
      block_number: 5,
    });

    mockViem.getBlockNumber.mockResolvedValue(15n);
    mockViem.getLogs.mockResolvedValue([
      makePaymentReleasedLog({
        requestId: REQUEST_ID,
        provider: PROVIDER,
        amount: 1000n,
        preimage: PREIMAGE,
      }, 15n),
    ]);

    const indexer = createIndexer(deps);
    const count = await indexer.poll();

    expect(count).toBe(1);
    expect(mockSupabase._store.payments[0]).toMatchObject({
      status: 'Released',
      preimage: PREIMAGE,
    });
  });

  it('processes PaymentRefunded event and updates status', async () => {
    // Seed a Locked payment first
    mockSupabase._store.payments.push({
      request_id: REQUEST_ID,
      agent: AGENT.toLowerCase(),
      provider: PROVIDER.toLowerCase(),
      amount: '1000',
      hash_lock: HASH_LOCK,
      deadline: 9999,
      status: 'Locked',
      preimage: null,
      tx_hash: '0xabc',
      block_number: 5,
    });

    mockViem.getBlockNumber.mockResolvedValue(20n);
    mockViem.getLogs.mockResolvedValue([
      makePaymentRefundedLog({
        requestId: REQUEST_ID,
        agent: AGENT,
        amount: 1000n,
      }, 20n),
    ]);

    const indexer = createIndexer(deps);
    const count = await indexer.poll();

    expect(count).toBe(1);
    expect(mockSupabase._store.payments[0]).toMatchObject({
      status: 'Refunded',
    });
  });

  it('updates cursor after successful poll', async () => {
    mockViem.getBlockNumber.mockResolvedValue(42n);
    mockViem.getLogs.mockResolvedValue([]);

    const indexer = createIndexer(deps);
    await indexer.poll();

    expect(mockSupabase._store.indexer_state[0]).toMatchObject({
      last_processed_block: 42,
    });
  });

  it('processes multiple events in a single poll', async () => {
    const REQUEST_ID_2 = '0x0000000000000000000000000000000000000000000000000000000000000002' as `0x${string}`;

    mockViem.getBlockNumber.mockResolvedValue(10n);
    mockViem.getLogs.mockResolvedValue([
      makePaymentLockedLog({
        requestId: REQUEST_ID,
        agent: AGENT,
        provider: PROVIDER,
        amount: 1000n,
        hashLock: HASH_LOCK,
        deadline: 9999n,
      }),
      makePaymentLockedLog({
        requestId: REQUEST_ID_2,
        agent: AGENT,
        provider: PROVIDER,
        amount: 2000n,
        hashLock: HASH_LOCK,
        deadline: 9999n,
      }),
    ]);

    const indexer = createIndexer(deps);
    const count = await indexer.poll();

    expect(count).toBe(2);
    expect(mockSupabase._store.payments).toHaveLength(2);
  });

  it('start/stop controls the polling interval', async () => {
    mockViem.getBlockNumber.mockResolvedValue(0n);

    const indexer = createIndexer(deps);
    indexer.start();

    // Wait a tick for the immediate poll() promise to execute
    await new Promise((r) => setTimeout(r, 10));

    expect(mockViem.getBlockNumber).toHaveBeenCalledTimes(1);

    indexer.stop();
  });
});
