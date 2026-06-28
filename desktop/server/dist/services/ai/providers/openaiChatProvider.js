"use strict";
/**
 * OpenAI GPT chat provider.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openaiChatProvider = void 0;
const database_1 = __importDefault(require("../../../config/database"));
const env_1 = require("../../../config/env");
const logger_1 = __importDefault(require("../../../utils/logger"));
const OPENAI_API = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o';
async function getApiKey() {
    const key = await database_1.default.apiKey.findFirst({
        where: { provider: 'openai', isActive: true },
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
    return env_1.env.OPENAI_API_KEY || '';
}
exports.openaiChatProvider = {
    name: 'openai',
    async chat(messages, options) {
        const apiKey = await getApiKey();
        const response = await fetch(OPENAI_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: options?.model || DEFAULT_MODEL,
                max_tokens: options?.maxTokens || 1024,
                temperature: options?.temperature ?? 0.7,
                messages: messages.map((m) => ({ role: m.role, content: m.content })),
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            logger_1.default.error('OpenAI API error', { status: response.status, error });
            throw new Error(`OpenAI API error: ${response.status}`);
        }
        const data = await response.json();
        return data.choices[0]?.message?.content || '';
    },
    async *streamChat(messages, options) {
        const response = await fetch(OPENAI_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env_1.env.OPENAI_API_KEY || ''}`,
            },
            body: JSON.stringify({
                model: options?.model || DEFAULT_MODEL,
                max_tokens: options?.maxTokens || 1024,
                temperature: options?.temperature ?? 0.7,
                messages: messages.map((m) => ({ role: m.role, content: m.content })),
                stream: true,
            }),
        });
        if (!response.ok) {
            throw new Error(`OpenAI stream error: ${response.status}`);
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
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content)
                        yield content;
                }
                catch {
                    // Skip
                }
            }
        }
    },
};
//# sourceMappingURL=openaiChatProvider.js.map