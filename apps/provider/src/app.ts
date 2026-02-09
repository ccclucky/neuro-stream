import express from 'express';
import { invokeRouter } from './routes/invoke';

export function createProviderApp(): express.Express {
  const app = express();

  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Main invoke route — simple HTTP API, no escrow/wallet needed
  app.use('/invoke', invokeRouter());

  return app;
}
