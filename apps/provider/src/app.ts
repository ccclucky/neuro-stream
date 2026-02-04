import express from 'express';
import { invokeRouter, type ProviderConfig } from './routes/invoke';

export function createProviderApp(config: ProviderConfig): express.Express {
  const app = express();

  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Main invoke route
  app.use('/invoke', invokeRouter(config));

  return app;
}
