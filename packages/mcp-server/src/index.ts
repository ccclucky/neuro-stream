#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerDiscoveryTools } from './tools/discovery.js';
import { registerPaymentTools } from './tools/payment.js';

const server = new McpServer({
  name: 'neurostream',
  version: '0.0.1',
});

registerDiscoveryTools(server);
registerPaymentTools(server);

async function main() {
  const requiredEnvVars = ['NEUROSTREAM_API_URL', 'NEUROSTREAM_API_KEY', 'NEUROSTREAM_GATEWAY_URL'];
  const missing = requiredEnvVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please set them in your MCP client configuration or .env file.\n' +
      'Example:\n' +
      '  NEUROSTREAM_API_URL=https://your-api-url\n' +
      '  NEUROSTREAM_API_KEY=ns_live_xxxxx\n' +
      '  NEUROSTREAM_GATEWAY_URL=https://your-gateway-url'
    );
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});