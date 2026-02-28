import express from 'express';
import cors from 'cors';
import path from 'path';
import { NeuroStream } from '@neurostream/sdk';
import { createChat, sendMessage, type ToolExecutor } from './gemini.js';
import { callService } from './neurostream.js';
import { GoogleGenAI } from '@google/genai';

export function startServer(port: number, client: NeuroStream, ai: GoogleGenAI, rpcUrl: string) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Serve static files from the public directory
  const publicPath = path.join(__dirname, '../public');
  app.use(express.static(publicPath));

  // Initialize a chat instance for the web session
  // In a real multi-user app, we'd want per-session isolation
  const chat = createChat(ai);

  // Define the tool executor
  const executeTool: ToolExecutor = async (name, args) => {
    if (name === 'call_service') {
      const keyword = args.keyword as string | undefined;
      const text = args.text as string;
      const result = await callService(client, keyword, text, rpcUrl);

      // Return both the data and the payment info so the UI can display it
      return JSON.stringify({
        payment: {
          requestId: result.requestId,
          cost: result.cost,
          latencyMs: result.latencyMs,
        },
        data: result.result,
      });
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` });
  };

  app.post('/api/chat', async (req, res) => {
    try {
      const { message } = req.body;
      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Track any tool calls made during this turn to report back to UI
      const toolCalls: { name: string; args: Record<string, unknown> }[] = [];
      const reply = await sendMessage(chat, message, executeTool, (name, args) => {
        if (name === 'call_service') {
          toolCalls.push({ name, args });
        }
      });

      res.json({ reply, toolCalls });
    } catch (error) {
      console.error('Error in /api/chat:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  });

  return new Promise<void>((resolve) => {
    app.listen(port, () => {
      console.log(`\n🌐 Web UI available at http://localhost:${port}`);
      resolve();
    });
  });
}
