import { GoogleGenAI, Type, type FunctionDeclaration, type Part, type Chat } from '@google/genai';

const SYSTEM_INSTRUCTION = `You are NeuroStream Agent — an AI assistant that pays for on-chain data services to fulfill user requests.

You have ONE tool: call_service. When a user asks you to process, analyze, or transform data:
1. Call call_service with a keyword matching the type of service needed, and the user's input text
2. The platform will auto-discover the best service, handle payment via escrow, and return the result
3. Present the result to the user clearly

ONLY skip calling the tool for pure greetings like "hi" or "hello" with no task.

When presenting results:
- If the result is JSON, extract key insights and present them clearly
- Mention this was powered by a paid on-chain NeuroStream service call
- Be concise and helpful`;

export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'call_service',
    description: 'Discover, pay for, and invoke an on-chain NeuroStream service in one step. The platform handles service discovery, escrow payment, and result retrieval automatically.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        keyword: {
          type: Type.STRING,
          description: 'Keyword to find the right service (e.g. "string", "text", "translate"). Leave empty to search all services.',
        },
        text: {
          type: Type.STRING,
          description: 'The text input to send to the service',
        },
      },
      required: ['text'],
    },
  },
];

const tools = [{ functionDeclarations }];

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

export function createChat(ai: GoogleGenAI): Chat {
  return ai.chats.create({
    model: 'gemini-2.0-flash',
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.7,
      maxOutputTokens: 1024,
      tools,
    },
  });
}

const MAX_TOOL_ROUNDS = 5;

export async function sendMessage(
  chat: Chat,
  userInput: string,
  executeTool: ToolExecutor,
  onToolCall?: (name: string, args: Record<string, unknown>) => void,
): Promise<string> {
  let response = await chat.sendMessage({ message: userInput });

  let rounds = 0;
  while (response.functionCalls && response.functionCalls.length > 0 && rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const functionResponseParts: Part[] = [];

    for (const call of response.functionCalls) {
      const name = call.name ?? 'unknown';
      const args = (call.args ?? {}) as Record<string, unknown>;

      onToolCall?.(name, args);

      let result: string;
      try {
        result = await executeTool(name, args);
      } catch (err) {
        result = JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
      }

      functionResponseParts.push({
        functionResponse: {
          id: call.id,
          name,
          response: { result },
        },
      });
    }

    response = await chat.sendMessage({ message: functionResponseParts });
  }

  return response.text ?? '(No response generated)';
}
