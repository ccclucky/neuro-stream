import 'dotenv/config';
import { createProviderApp } from './app';

const PORT = parseInt(process.env.PROVIDER_PORT || '3001', 10);

const app = createProviderApp();

app.listen(PORT, () => {
  console.log(`Provider service running on port ${PORT}`);
  console.log('Simple HTTP API — no wallet/escrow needed');
});
