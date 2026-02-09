import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, getChallenge } from '@/lib/gateway/state-machine';

export async function GET(req: NextRequest) {
  try {
    // Validate API Key
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing x-api-key header' }, { status: 401 });
    }

    const keyInfo = await validateApiKey(apiKey);
    if (!keyInfo) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const requestId = req.nextUrl.searchParams.get('requestId');
    if (!requestId) {
      return NextResponse.json({ error: 'Missing requestId query parameter' }, { status: 400 });
    }

    const challenge = await getChallenge(requestId);
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    // Build response based on status
    switch (challenge.status) {
      case 'CREATED':
        return NextResponse.json({
          status: challenge.status,
          requestId: challenge.request_id,
          hashLock: challenge.hash_lock,
          amount: challenge.amount,
          recipient: challenge.gateway_address,
          deadline: challenge.deadline,
        });

      case 'COMPLETED':
        return NextResponse.json({
          status: challenge.status,
          requestId: challenge.request_id,
          result: challenge.provider_result,
        });

      case 'FAILED':
        return NextResponse.json({
          status: challenge.status,
          requestId: challenge.request_id,
          error: challenge.last_error,
        });

      case 'REFUNDABLE':
        return NextResponse.json({
          status: challenge.status,
          requestId: challenge.request_id,
          deadline: challenge.deadline,
          error: challenge.last_error,
        });

      case 'REFUNDED':
        return NextResponse.json({
          status: challenge.status,
          requestId: challenge.request_id,
        });

      default:
        // ESCROW_LOCKED, PROVIDER_CALLED, RESULT_STORED, CLAIMED
        return NextResponse.json({
          status: challenge.status,
          requestId: challenge.request_id,
        });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[gateway:status]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
