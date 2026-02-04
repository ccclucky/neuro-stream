import 'dotenv/config';
import { createProviderApp } from './app';

const PORT = parseInt(process.env.PROVIDER_PORT || '3001', 10);
const ESCROW_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS as `0x${string}`;
const RPC_URL = process.env.RPC_URL || process.env.MONAD_RPC_URL || 'http://127.0.0.1:8545';
const PROVIDER_ADDRESS = process.env.PROVIDER_WALLET_ADDRESS as `0x${string}`;
const PROVIDER_PRIVATE_KEY = process.env.PROVIDER_PRIVATE_KEY as `0x${string}`;

if (!ESCROW_ADDRESS) {
  console.error('ESCROW_CONTRACT_ADDRESS is required');
  process.exit(1);
}

if (!PROVIDER_ADDRESS) {
  console.error('PROVIDER_WALLET_ADDRESS is required');
  process.exit(1);
}

if (!PROVIDER_PRIVATE_KEY) {
  console.error('PROVIDER_PRIVATE_KEY is required');
  process.exit(1);
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
