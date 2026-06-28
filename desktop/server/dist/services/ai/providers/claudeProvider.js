"use strict";
/**
 * Claude (Anthropic) chat provider.
 *
 * Uses the Anthropic Messages API via direct HTTP fetch
 * (avoids SDK dependency for simplicity).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.claudeProvider = void 0;
const database_1 = __importDefault(require("../../../config/database"));
const env_1 = require("../../../config/env");
const logger_1 = __importDefault(require("../../../utils/logger"));
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
async function getApiKey() {
    // Try DB first
    const key = await database_1.default.apiKey.findFirst({
        where: { provider: 'anthropic', isActive: true },
        select: { keyHash: true },
    });
    if (key) {
        try {
            const { decrypt } = require('../../../utils/crypto');
            return decrypt(key.keyHash);
        }
        catch {
            return Buffer.from(key.keyHash, 'base64').toString('utf-8');
        }
    }
    // Fallback to env
    return env_1.env.ANTHROPIC_API_KEY || '';
}
exports.claudeProvider = {
    name: 'claude',
    async chat(messages, options) {
        const apiKey = await getApiKey();
        const systemMsg = messages.find((m) => m.role === 'system')?.content || '';
        const chatMessages = messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role, content: m.content }));
        const response = await fetch(ANTHROPIC_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: options?.model || DEFAULT_MODEL,
                max_tokens: options?.maxTokens || 1024,
                temperature: options?.temperature ?? 0.7,
                system: systemMsg,
                messages: chatMessages,
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            logger_1.default.error('Claude API error', { status: response.status, error });
            throw new Error(`Claude API error: ${response.status}`);
        }
        const data = await response.json();
        return data.content
            .filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join('');
    },
    async *streamChat(messages, options) {
        const systemMsg = messages.find((m) => m.role === 'system')?.content || '';
        const chatMessages = messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role, content: m.content }));
        const response = await fetch(ANTHROPIC_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': env_1.env.ANTHROPIC_API_KEY || '',
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: options?.model || DEFAULT_MODEL,
                max_tokens: options?.maxTokens || 1024,
                temperature: options?.temperature ?? 0.7,
                system: systemMsg,
                messages: chatMessages,
                stream: true,
            }),
        });
        if (!response.ok) {
            throw new Error(`Claude stream error: ${response.status}`);
        }
        const reader = response.body?.getReader();
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
                catch {
                    // Skip unparseable chunks
                }
            }
        }
    },
};
//# sourceMappingURL=claudeProvider.js.map