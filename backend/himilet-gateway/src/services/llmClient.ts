import type { LlmProfile } from '../types/domain.js';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: Array<{
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
}

export class LlmClient {
  async completeWithTools(
    profile: LlmProfile,
    apiKey: string,
    messages: LlmMessage[],
    tools: ToolDefinition[],
    signal?: AbortSignal,
  ): Promise<{ content: string; toolCalls: ToolCall[] }> {
    const response = await fetch(this.buildUrl(profile.base_url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: profile.model,
        messages,
        tools,
        tool_choice: 'auto',
        stream: false,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const message = payload.choices?.[0]?.message;
    const content = message?.content ?? '';
    const toolCalls: ToolCall[] = (message?.tool_calls ?? [])
      .map((t) => {
        const id = t.id;
        const name = t.function?.name;
        if (!id || !name) {
          return null;
        }

        return {
          id,
          name,
          arguments: t.function?.arguments ?? '{}',
        };
      })
      .filter((x): x is ToolCall => x !== null);

    return { content, toolCalls };
  }

  async streamText(
    profile: LlmProfile,
    apiKey: string,
    messages: LlmMessage[],
    signal: AbortSignal,
    onDelta: (deltaText: string) => void,
  ): Promise<void> {
    const response = await fetch(this.buildUrl(profile.base_url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: profile.model,
        messages,
        stream: true,
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`LLM stream failed: ${response.status} ${response.statusText}`);
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const lineRaw of lines) {
        const line = lineRaw.trim();
        if (!line.startsWith('data:')) {
          continue;
        }

        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          return;
        }

        try {
          const payload = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = payload.choices?.[0]?.delta?.content;
          if (delta) {
            onDelta(delta);
          }
        } catch {
          // Ignore malformed chunks from provider.
        }
      }
    }
  }

  private buildUrl(baseUrl: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  }
}
