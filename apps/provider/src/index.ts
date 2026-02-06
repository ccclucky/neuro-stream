import { createProviderApp } from './app';

const PORT = parseInt(process.env.PROVIDER_PORT || '3001', 10);
const ESCROW_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS as `0x${string}`;
const RPC_URL = process.env.MONAD_RPC_URL || 'http://127.0.0.1:8545';
const PROVIDER_ADDRESS = process.env.PROVIDER_WALLET_ADDRESS as `0x${string}`;
const PROVIDER_PRIVATE_KEY = process.env.PROVIDER_PRIVATE_KEY as `0x${string}`;

const missing = [
  !ESCROW_ADDRESS && 'ESCROW_CONTRACT_ADDRESS',
  !PROVIDER_ADDRESS && 'PROVIDER_WALLET_ADDRESS',
  !PROVIDER_PRIVATE_KEY && 'PROVIDER_PRIVATE_KEY',
].filter(Boolean);

if (missing.length > 0) {
  console.warn(`[provider] Skipping — missing env vars: ${missing.join(', ')}`);
  process.exit(0);
}

const app = createProviderApp({
  escrowAddress: ESCROW_ADDRESS,
  rpcUrl: RPC_URL,
  providerAddress: PROVIDER_ADDRESS,
  providerPrivateKey: PROVIDER_PRIVATE_KEY,
});

app.listen(PORT, () => {
  console.log(`Provider service running on port ${PORT}`);
  console.log(`Escrow contract: ${ESCROW_ADDRESS}`);
  console.log(`Provider address: ${PROVIDER_ADDRESS}`);
});
