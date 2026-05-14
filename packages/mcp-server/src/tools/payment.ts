import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const NEUROSTREAM_API_URL = process.env.NEUROSTREAM_API_URL || '';
const NEUROSTREAM_API_KEY = process.env.NEUROSTREAM_API_KEY || '';
const NEUROSTREAM_GATEWAY_URL = process.env.NEUROSTREAM_GATEWAY_URL || '';

export function registerPaymentTools(server: McpServer): void {
  server.registerTool(
    'pay_and_invoke',
    {
      description:
        'Paid invocation of an AI service on NeuroStream with escrow delivery guarantee. ' +
        'This tool locks USDC in an HTLC escrow on Monad blockchain, calls the service, ' +
        'and returns the result. Your money is guaranteed: if the service fails to deliver, ' +
        'you get an automatic refund after the deadline. ' +
        'IMPORTANT: This tool costs real USDC tokens. Only call when you actually need the service result. ' +
        'Use discover_services first to find available services and their pricing.',
      inputSchema: z.object({
        serviceId: z.string().describe('The service ID to invoke (e.g. "text-analysis-v1")'),
        params: z.record(z.unknown()).describe('Input parameters for the service'),
        timeout: z.number().optional().default(60000).describe('Timeout in milliseconds (default 60000)'),
      }),
    },
    async ({ serviceId, params, timeout }) => {
      const startTime = Date.now();
      const totalTimeout = timeout || 60000;

      try {
        // Step 1: Get payment challenge from Gateway
        const challengeRes = await fetch(`${NEUROSTREAM_GATEWAY_URL}/api/gateway/invoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': NEUROSTREAM_API_KEY,
          },
          body: JSON.stringify({ serviceId, params }),
        });

        if (challengeRes.status !== 402) {
          const body = await challengeRes.text();
          if (challengeRes.status === 404) {
            return {
              content: [{ type: 'text', text: `Service "${serviceId}" not found. Use discover_services to find valid service IDs.` }],
              isError: true,
            };
          }
          return {
            content: [{ type: 'text', text: `Unexpected response from Gateway: ${challengeRes.status} - ${body}` }],
            isError: true,
          };
        }

        const challenge = await challengeRes.json() as {
          requestId: string;
          hashLock: string;
          amount: string;
          recipient: string;
          deadline: number;
        };

        // Step 2: Submit payment proof to Gateway (Gateway handles escrow claim internally)
        const resultRes = await fetch(`${NEUROSTREAM_GATEWAY_URL}/api/gateway/invoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': NEUROSTREAM_API_KEY,
          },
          body: JSON.stringify({ serviceId, params, requestId: challenge.requestId }),
          signal: AbortSignal.timeout(totalTimeout),
        }).catch(async (err) => {
          if (err.name === 'TimeoutError' || err.name === 'AbortError') {
            return null;
          }
          throw err;
        });

        if (resultRes && resultRes.ok) {
          const data = await resultRes.json() as { result?: string; status?: string; requestId?: string };
          if (data.result) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    serviceId,
                    requestId: challenge.requestId,
                    result: data.result,
                    amountPaid: challenge.amount,
                    status: data.status || 'COMPLETED',
                  }, null, 2),
                },
              ],
            };
          }
        }

        // Step 3: If direct result not available, poll status with remaining time
        const remainingTime = totalTimeout - (Date.now() - startTime);
        const pollResult = await pollStatus(challenge.requestId, Math.max(remainingTime, 5000));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                serviceId,
                requestId: challenge.requestId,
                result: pollResult.result,
                amountPaid: challenge.amount,
                status: pollResult.status,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error invoking service: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'check_status',
    {
      description:
        'Check the status of a previous pay_and_invoke request. Use this when a previous invocation ' +
        'returned a processing status instead of a final result. Returns the current state and result ' +
        'if available. This tool is FREE — it does not cost anything.',
      inputSchema: z.object({
        requestId: z.string().describe('The requestId from a previous pay_and_invoke call'),
      }),
    },
    async ({ requestId }) => {
      try {
        const res = await fetch(
          `${NEUROSTREAM_GATEWAY_URL}/api/gateway/status?requestId=${encodeURIComponent(requestId)}`,
          {
            headers: { 'x-api-key': NEUROSTREAM_API_KEY },
          }
        );

        if (!res.ok) {
          return {
            content: [{ type: 'text', text: `Status check failed: ${res.status} ${res.statusText}` }],
            isError: true,
          };
        }

        const data = await res.json() as {
          status?: string;
          result?: string;
          error?: string;
          requestId?: string;
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error checking status: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

async function pollStatus(
  requestId: string,
  timeoutMs: number
): Promise<{ result: string; status: string }> {
  const deadline = Date.now() + timeoutMs;
  const pollInterval = 2000;

  while (Date.now() < deadline) {
    const res = await fetch(
      `${NEUROSTREAM_GATEWAY_URL}/api/gateway/status?requestId=${encodeURIComponent(requestId)}`,
      {
        headers: { 'x-api-key': NEUROSTREAM_API_KEY },
      }
    );

    if (!res.ok) {
      throw new Error(`Gateway status check failed: ${res.status}`);
    }

    const data = await res.json() as { status?: string; result?: string; error?: string };

    if (data.status === 'COMPLETED' && data.result) {
      return { result: data.result, status: data.status };
    }

    if (['FAILED', 'REFUNDABLE', 'REFUNDED'].includes(data.status!)) {
      return {
        result: data.error || `Request ended with status: ${data.status}`,
        status: data.status!,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return { result: 'Polling timeout - use check_status to continue monitoring', status: 'TIMEOUT' };
}