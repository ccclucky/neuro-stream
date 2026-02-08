import { GoogleGenAI, Type, type FunctionDeclaration, type Part, type Chat } from '@google/genai';

const SYSTEM_INSTRUCTION = `You are NeuroStream Agent — an AI assistant that pays for on-chain data services to fulfill user requests.

You MUST follow this workflow for any user request that involves processing, analyzing, or transforming data:
1. Call discover_services (without keyword) to see all available services
2. Pick the most relevant service from the results
3. Call invoke_service with the service's endpoint and the user's input text
4. Present the result to the user in a clear, natural way

ONLY skip this workflow for pure greetings like "hi" or "hello" with no task.

When presenting results:
- If the result is JSON, extract key insights and present them clearly
- Mention this was powered by a paid on-chain NeuroStream service call
- Be concise and helpful`;

export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

// Tool declarations for Gemini function calling
const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'discover_services',
    description: 'Browse and search for available paid services on the NeuroStream platform. Returns a list of services with their endpoints, pricing, and descriptions. IMPORTANT: Call this WITHOUT any keyword first to see ALL available services. Only use keyword if you want to narrow down a large list.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        keyword: {
          type: Type.STRING,
          description: 'Optional keyword to filter results. Omit this to list ALL services. If provided, matches against service ID and schema descriptions.',
        },
        type: {
          type: Type.STRING,
          description: 'Optional service type filter (e.g. "utility", "ai", "data")',
        },
      },
    },
  },
  {
    name: 'invoke_service',
    description: 'Pay for and invoke a service via on-chain escrow payment. This costs real tokens. You must provide the serviceId and endpoint URL (both obtained from discover_services) and the text input.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        serviceId: {
          type: Type.STRING,
          description: 'The service ID to invoke (from discover_services result)',
        },
        endpoint: {
          type: Type.STRING,
          description: 'The service endpoint URL to invoke (from discover_services result)',
        },
        text: {
          type: Type.STRING,
          description: 'The text input to send to the service',
        },
      },
      required: ['serviceId', 'endpoint', 'text'],
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

  // Function calling loop — Gemini may call tools multiple times
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
