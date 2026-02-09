import { Router } from 'express';
import { processStringLength } from '../services/string-length';

export function invokeRouter(): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const { text } = req.body as { text?: string };

    if (!text) {
      return res.status(400).json({ error: 'Missing text parameter' });
    }

    const result = processStringLength({ text });
    return res.json({ result });
  });

  return router;
}
