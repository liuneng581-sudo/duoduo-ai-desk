"use strict";
/**
 * Generic OpenAI-compatible chat provider.
 *
 * Supports any API that implements the OpenAI chat completions protocol:
 * Kimi (Moonshot), DeepSeek, Qwen (Tongyi), Doubao, Minimax, GPT, Claude via proxy, etc.
 *
 * Also handles Anthropic's native Messages API (non-OpenAI-compatible).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChatProvider = createChatProvider;
const logger_1 = __importDefault(require("../../../utils/logger"));
const DEFAULT_MAX_TOKENS = 1024;
// Cap every upstream LLM call. Without this a hung provider leaves the
// auto-reply pipeline's promise unresolved forever and that customer is never
// answered (and the message may be marked processed and lost).
const LLM_TIMEOUT_MS = 30000;
// Retry once on transient failures (network error / 429 / 5xx) for the
// non-streaming chat path, with a short backoff. Streaming is left alone —
// retrying mid-stream is not safe.
const LLM_RETRY_BACKOFF_MS = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * fetch with one retry on transient failure. Retries on a thrown network/abort
 * error, or a 429 / 5xx response. Non-transient (4xx other than 429) responses
 * are returned to the caller as-is on the first try.
 */
async function fetchWithRetry(url, init) {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch(url, init);
            if ((res.status === 429 || res.status >= 500) && attempt === 0) {
                await sleep(LLM_RETRY_BACKOFF_MS);
                continue;
            }
            return res;
        }
        catch (err) {
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
function anthropicMessagesUrl(apiBase) {
    const base = apiBase.replace(/\/+$/, '');
    return /\/v1$/.test(base) ? `${base}/messages` : `${base}/v1/messages`;
}
/**
 * Create a chat provider from a user-configured provider.
 */
function createChatProvider(config) {
    return {
        name: config.defaultModel || config.name,
        async chat(messages, options) {
            const model = options?.model || config.defaultModel;
            const maxTokens = options?.maxTokens || DEFAULT_MAX_TOKENS;
            const temperature = options?.temperature ?? 0.7;
            if (config.protocol === 'anthropic') {
                return anthropicChat(config.apiKey, config.apiBase, model, messages, maxTokens, temperature);
            }
            return openaiCompatibleChat(config.apiBase, config.apiKey, model, messages, maxTokens, temperature);
        },
        async *streamChat(messages, options) {
            const model = options?.model || config.defaultModel;
            const maxTokens = options?.maxTokens || DEFAULT_MAX_TOKENS;
            const temperature = options?.temperature ?? 0.7;
            if (config.protocol === 'anthropic') {
                yield* anthropicStream(config.apiKey, config.apiBase, model, messages, maxTokens, temperature);
            }
            else {
                yield* openaiCompatibleStream(config.apiBase, config.apiKey, model, messages, maxTokens, temperature);
            }
        },
    };
}
// ── OpenAI-compatible chat ──
async function openaiCompatibleChat(apiBase, apiKey, model, messages, maxTokens, temperature) {
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
        logger_1.default.error(`Provider API error [${model}]`, { status: res.status, body: err.slice(0, 300) });
        throw new Error(`模型调用失败: ${res.status}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
}
async function* openaiCompatibleStream(apiBase, apiKey, model, messages, maxTokens, temperature) {
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
    if (!res.ok)
        throw new Error(`Stream error: ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader)
        throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.startsWith('data: '))
                continue;
            const data = line.slice(6);
            if (data === '[DONE]')
                return;
            try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content)
                    yield content;
            }
            catch { }
        }
    }
}
// ── Anthropic native chat ──
async function anthropicChat(apiKey, apiBase, model, messages, maxTokens, temperature) {
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
    if (!res.ok)
        throw new Error(`Anthropic error: ${res.status}`);
    // Guard against an unexpected 200 body shape — a missing/non-array `content`
    // would otherwise throw a TypeError and surface as a silent no-reply.
    const data = await res.json();
    return (data.content || [])
        .filter((c) => c && c.type === 'text')
        .map((c) => c.text || '')
        .join('');
}
async function* anthropicStream(apiKey, apiBase, model, messages, maxTokens, temperature) {
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
    if (!res.ok)
        throw new Error(`Anthropic stream error: ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader)
        throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.startsWith('data: '))
                continue;
            const data = line.slice(6);
            if (data === '[DONE]')
                return;
            try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                    yield parsed.delta.text;
                }
            }
            catch { }
        }
    }
}
//# sourceMappingURL=genericProvider.js.map