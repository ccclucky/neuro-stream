import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const NEUROSTREAM_API_URL = process.env.NEUROSTREAM_API_URL || '';
const NEUROSTREAM_API_KEY = process.env.NEUROSTREAM_API_KEY || '';

type ServiceRow = Record<string, unknown>;

async function fetchServices(params: Record<string, string>): Promise<ServiceRow[]> {
  const url = new URL(`${NEUROSTREAM_API_URL}/services`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'x-api-key': NEUROSTREAM_API_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Discovery failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ServiceRow[];
}

function formatService(row: ServiceRow) {
  return {
    serviceId: row.service_id as string,
    pricing: `${row.pricing_amount} ${row.pricing_asset} per ${row.pricing_model === 'per_call' ? 'call' : row.pricing_model}`,
    input: row.schema_input as string,
    output: row.schema_output as string,
    qualityScore: row.quality_score ?? 'N/A',
    successRate: row.success_rate ?? 'N/A',
  };
}

export function registerDiscoveryTools(server: McpServer): void {
  server.registerTool(
    'discover_services',
    {
      description:
        'Discover available AI services on NeuroStream. Returns a list of services with pricing, ' +
        'input/output types, and quality scores. This tool is FREE — it does not cost anything to browse services. ' +
        'Use this to find services before calling pay_and_invoke.',
      inputSchema: z.object({
        keyword: z.string().optional().describe('Fuzzy search keyword (matches serviceId and input/output types)'),
        type: z.string().optional().describe('Filter by service type'),
        minQualityScore: z.number().optional().describe('Minimum quality score threshold (0-1)'),
      }),
    },
    async ({ keyword, type, minQualityScore }) => {
      try {
        const params: Record<string, string> = {};
        if (type) params.type = type;
        if (minQualityScore) params.minQualityScore = String(minQualityScore);

        let rows = await fetchServices(params);

        if (keyword) {
          const kw = keyword.toLowerCase();
          rows = rows.filter(
            (r) =>
              (r.service_id as string ?? '').toLowerCase().includes(kw) ||
              (r.schema_input as string ?? '').toLowerCase().includes(kw) ||
              (r.schema_output as string ?? '').toLowerCase().includes(kw)
          );
        }

        if (rows.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No services found matching your criteria. Try broader keywords or lower minQualityScore.',
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(rows.map(formatService), null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error discovering services: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}