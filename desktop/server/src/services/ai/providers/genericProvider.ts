/**
 * Generic OpenAI-compatible chat provider.
 *
 * Supports any API that implements the OpenAI chat completions protocol:
 * Kimi (Moonshot), DeepSeek, Qwen (Tongyi), Doubao, Minimax, GPT, Claude via proxy, etc.
 *
 * Also handles Anthropic's native Messages API (non-OpenAI-compatible).
 */

import logger from '../../../utils/logger';
import type { ChatProvider, ChatMessage, ChatOptions } from './types';

const DEFAULT_MAX_TOKENS = 1024;
// Cap every upstream LLM call. Without this a hung provider leaves the
// auto-reply pipeline's promise unresolved forever and that customer is never
// answered (and the message may be marked processed and lost).
const LLM_TIMEOUT_MS = 30000;
// Retry once on transient failures (network error / 429 / 5xx) for the
// non-streaming chat path, with a short backoff. Streaming is left alone —
// retrying mid-stream is not safe.
const LLM_RETRY_BACKOFF_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch with one retry on transient failure. Retries on a thrown network/abort
 * error, or a 429 / 5xx response. Non-transient (4xx other than 429) responses
 * are returned to the caller as-is on the first try.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, init);
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        await sleep(LLM_RETRY_BACKOFF_MS);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt === 0) {
        await sleep(LLM_RETRY_BACKOFF_MS);
        continue;
      }
    }
  }
  throw lastErr;
}

// Build the Anthropic Messages endpoint from a user-supplied apiBase.
// The Anthropic (and Anthropic-compatible, e.g. MiniMax's /anthropic) spec is
// POST /v1/messages — NOT /messages. Users typically enter the base without
// /v1 (e.g. https://api.minimaxi.com/anthropic), so previously we built
// `${base}/messages` which 404s. Append /v1/messages, but tolerate a base that
// already includes a trailing /v1 so we never produce /v1/v1/messages.
function anthropicMessagesUrl(apiBase: string): string {
  const base = apiBase.replace(/\/+$/, '');
  return /\/v1$/.test(base) ? `${base}/messages` : `${base}/v1/messages`;
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: 'chat' | 'image' | 'both';
  apiBase: string;
  apiKey: string;
  models: string[];
  defaultModel: string;
  /** "openai" for OpenAI-compatible, "anthropic" for Anthropic native */
  protocol: 'openai' | 'anthropic';
}

/**
 * Create a chat provider from a user-configured provider.
 */
export function createChatProvider(config: ProviderConfig): ChatProvider {
  return {
    name: config.defaultModel || config.name,

    async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
      const model = options?.model || config.defaultModel;
      const maxTokens = options?.maxTokens || DEFAULT_MAX_TOKENS;
      const temperature = options?.temperature ?? 0.7;

      if (config.protocol === 'anthropic') {
        return anthropicChat(config.apiKey, config.apiBase, model, messages, maxTokens, temperature);
      }
      return openaiCompatibleChat(config.apiBase, config.apiKey, model, messages, maxTokens, temperature);
    },

    async *streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
      const model = options?.model || config.defaultModel;
      const maxTokens = options?.maxTokens || DEFAULT_MAX_TOKENS;
      const temperature = options?.temperature ?? 0.7;

      if (config.protocol === 'anthropic') {
        yield* anthropicStream(config.apiKey, config.apiBase, model, messages, maxTokens, temperature);
      } else {
        yield* openaiCompatibleStream(config.apiBase, config.apiKey, model, messages, maxTokens, temperature);
      }
    },
  };
}

// ── OpenAI-compatible chat ──

async function openaiCompatibleChat(
  apiBase: string, apiKey: string, model: string,
  messages: ChatMessage[], maxTokens: number, temperature: number,
): Promise<string> {
  const url = `${apiBase.replace(/\/$/, '')}/chat/completions`;

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error(`Provider API error [${model}]`, { status: res.status, body: err.slice(0, 300) });
    throw new Error(`模型调用失败: ${res.status}`);
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || '';
}

async function* openaiCompatibleStream(
  apiBase: string, apiKey: string, model: string,
  messages: ChatMessage[], maxTokens: number, temperature: number,
): AsyncIterable<string> {
  const url = `${apiBase.replace(/\/$/, '')}/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature, stream: true,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Stream error: ${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {}
    }
  }
}

// ── Anthropic native chat ──

async function anthropicChat(
  apiKey: string, apiBase: string, model: string,
  messages: ChatMessage[], maxTokens: number, temperature: number,
): Promise<string> {
  const url = anthropicMessagesUrl(apiBase);
  const systemMsg = messages.find((m) => m.role === 'system')?.content || '';
  const chatMsgs = messages.filter((m) => m.role !== 'system');

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature,
      system: systemMsg,
      messages: chatMsgs.map((m) => ({ role: m.role, content: m.content })),
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);

  // Guard against an unexpected 200 body shape — a missing/non-array `content`
  // would otherwise throw a TypeError and surface as a silent no-reply.
  const data = await res.json() as { content?: Array<{ type: string; text?: string }> };
  return (data.content || [])
    .filter((c) => c && c.type === 'text')
    .map((c) => c.text || '')
    .join('');
}

async function* anthropicStream(
  apiKey: string, apiBase: string, model: string,
  messages: ChatMessage[], maxTokens: number, temperature: number,
): AsyncIterable<string> {
  const url = anthropicMessagesUrl(apiBase);
  const systemMsg = messages.find((m) => m.role === 'system')?.content || '';
  const chatMsgs = messages.filter((m) => m.role !== 'system');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature, stream: true,
      system: systemMsg,
      messages: chatMsgs.map((m) => ({ role: m.role, content: m.content })),
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Anthropic stream error: ${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          yield parsed.delta.text;
        }
      } catch {}
    }
  }
}
