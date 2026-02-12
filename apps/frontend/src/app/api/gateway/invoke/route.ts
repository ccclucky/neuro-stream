import { NextRequest, NextResponse } from 'next/server';
import { parseUnits } from 'viem';
import {
  validateApiKey,
  lookupService,
  generatePreimage,
  computeHashLock,
  generateRequestId,
  getGatewayAddress,
  createChallenge,
  getChallenge,
  getChallengeByIdempotencyKey,
  advanceState,
  verifyEscrowLocked,
  callProvider,
  processClaimAndComplete,
  startRecoveryTask,
} from '@/lib/gateway/state-machine';

// Start recovery task on module load (hackathon: setInterval)
startRecoveryTask();

const DEADLINE_SECONDS = 3600; // 1 hour

export async function POST(req: NextRequest) {
  try {
    // ① Validate API Key
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing x-api-key header' }, { status: 401 });
    }

    const keyInfo = await validateApiKey(apiKey);
    if (!keyInfo) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const body = await req.json();
    const { serviceId, params, requestId, idempotencyKey } = body as {
      serviceId?: string;
      params?: Record<string, unknown>;
      requestId?: string;
      idempotencyKey?: string;
    };

    if (!serviceId) {
      return NextResponse.json({ error: 'Missing serviceId' }, { status: 400 });
    }

    // ── CASE 1: No requestId → Create challenge (402) ──────────

    if (!requestId) {
      // Idempotency: if same key already used, return existing challenge
      if (idempotencyKey) {
        const existing = await getChallengeByIdempotencyKey(idempotencyKey);
        if (existing) {
          return NextResponse.json(
            {
              requestId: existing.request_id,
              hashLock: existing.hash_lock,
              amount: existing.amount,
              recipient: existing.gateway_address,
              deadline: existing.deadline,
              status: existing.status,
            },
            { status: 402 }
          );
        }
      }

      // ② Query service info
      const service = await lookupService(serviceId);
      if (!service) {
        return NextResponse.json({ error: `Service not found: ${serviceId}` }, { status: 404 });
      }

      // ③ Generate preimage / hashLock
      const preimage = generatePreimage();
      const hashLock = computeHashLock(preimage);
      const reqId = generateRequestId();
      const deadline = Math.floor(Date.now() / 1000) + DEADLINE_SECONDS;
      const decimals = parseInt(process.env.PAYMENT_TOKEN_DECIMALS || '6', 10);
      const amount = parseUnits(service.pricingAmount, decimals).toString();
      const gatewayAddress = getGatewayAddress();

      // ④ Write DB: status=CREATED
      await createChallenge({
        request_id: reqId,
        idempotency_key: idempotencyKey ?? null,
        agent_address: keyInfo.walletAddress,
        service_id: serviceId,
        provider_endpoint: service.endpoint,
        gateway_address: gatewayAddress,
        preimage,
        hash_lock: hashLock,
        amount,
        deadline,
        status: 'CREATED',
      });

      // Return 402 challenge
      return NextResponse.json(
        {
          requestId: reqId,
          hashLock,
          amount,
          recipient: gatewayAddress,
          deadline,
        },
        { status: 402 }
      );
    }

    // ── CASE 2: Has requestId → Process payment flow ───────────

    // Find challenge
    const challenge = await getChallenge(requestId);
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    // If already completed, return result immediately
    if (challenge.status === 'COMPLETED') {
      return NextResponse.json({
        requestId: challenge.request_id,
        result: challenge.provider_result,
        status: 'COMPLETED',
      });
    }

    // If in a failed/refundable terminal state, return error
    if (['FAILED', 'REFUNDABLE', 'REFUNDED'].includes(challenge.status)) {
      return NextResponse.json(
        { error: `Challenge is ${challenge.status}`, requestId, status: challenge.status },
        { status: 409 }
      );
    }

    // ⑤ Verify on-chain escrow is locked
    if (challenge.status === 'CREATED') {
      const isLocked = await verifyEscrowLocked(requestId as `0x${string}`);
      if (!isLocked) {
        return NextResponse.json(
          { error: 'Escrow not yet locked on-chain', requestId },
          { status: 402 }
        );
      }

      const locked = await advanceState(requestId, 'CREATED', 'ESCROW_LOCKED');
      if (!locked) {
        return NextResponse.json({ error: 'State transition failed' }, { status: 500 });
      }
    }

    // ⑥ Write DB: status=PROVIDER_CALLED
    const currentChallenge = await getChallenge(requestId);
    if (!currentChallenge) {
      return NextResponse.json({ error: 'Challenge disappeared' }, { status: 500 });
    }

    if (currentChallenge.status === 'ESCROW_LOCKED') {
      const providerCalled = await advanceState(requestId, 'ESCROW_LOCKED', 'PROVIDER_CALLED');
      if (!providerCalled) {
        return NextResponse.json({ error: 'State transition to PROVIDER_CALLED failed' }, { status: 500 });
      }
    }

    // ⑦ Forward request to Provider
    if (['PROVIDER_CALLED', 'ESCROW_LOCKED'].includes(currentChallenge.status) || currentChallenge.status === 'ESCROW_LOCKED') {
      const callParams = params || {};
      const { result, httpStatus } = await callProvider(currentChallenge.provider_endpoint, callParams);

      if (httpStatus < 200 || httpStatus >= 300) {
        await advanceState(requestId, 'PROVIDER_CALLED', 'REFUNDABLE', {
          last_error: `Provider returned HTTP ${httpStatus}`,
          provider_http_status: httpStatus,
        });
        return NextResponse.json(
          { error: 'Provider call failed', httpStatus, requestId },
          { status: 502 }
        );
      }

      // ⑧ Write DB: status=RESULT_STORED + provider_result
      const stored = await advanceState(requestId, 'PROVIDER_CALLED', 'RESULT_STORED', {
        provider_result: result,
        provider_http_status: httpStatus,
      });

      if (!stored) {
        return NextResponse.json({ error: 'Failed to store result' }, { status: 500 });
      }

      // ⑨ + ⑩ Claim and complete
      const completed = await processClaimAndComplete(stored);

      if (completed && completed.status === 'COMPLETED') {
        return NextResponse.json({
          requestId: completed.request_id,
          result: completed.provider_result,
          status: 'COMPLETED',
        });
      }

      // Claim might have succeeded but we couldn't confirm yet
      // Return the result anyway with processing status
      const latest = await getChallenge(requestId);
      if (latest && ['CLAIMED', 'COMPLETED'].includes(latest.status)) {
        return NextResponse.json({
          requestId: latest.request_id,
          result: latest.provider_result,
          status: latest.status,
        });
      }

      // Claim failed but result is stored — recovery will retry
      return NextResponse.json(
        {
          requestId,
          status: latest?.status || 'RESULT_STORED',
          message: 'Result stored, claim in progress. Poll status endpoint.',
        },
        { status: 202 }
      );
    }

    // If result already stored (from recovery), try claim
    if (currentChallenge.status === 'RESULT_STORED') {
      const completed = await processClaimAndComplete(currentChallenge);
      if (completed && completed.status === 'COMPLETED') {
        return NextResponse.json({
          requestId: completed.request_id,
          result: completed.provider_result,
          status: 'COMPLETED',
        });
      }
    }

    // Default: return current status
    const latest = await getChallenge(requestId);
    return NextResponse.json({
      requestId,
      status: latest?.status,
      result: latest?.provider_result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[gateway:invoke]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
