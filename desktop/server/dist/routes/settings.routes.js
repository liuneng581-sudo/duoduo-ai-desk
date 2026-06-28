"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const express_2 = require("../types/express");
const systemPrompt_1 = require("../services/ai/prompts/systemPrompt");
const aiChat_service_1 = require("../services/ai/aiChat.service");
const feishu_1 = require("../services/feishu");
const genericProvider_1 = require("../services/ai/providers/genericProvider");
const database_1 = __importDefault(require("../config/database"));
const urlSafety_1 = require("../utils/urlSafety");
const crypto_1 = require("../utils/crypto");
const PROVIDER_CONFIG_KEY = 'ai_providers';
const router = (0, express_1.Router)();
// ── Helpers ──
async function getConfig(userId, key) {
    const config = await database_1.default.systemConfig.findUnique({
        where: { userId_key: { userId, key } },
        select: { value: true },
    });
    return config?.value ?? null;
}
async function setConfig(userId, key, value) {
    await database_1.default.systemConfig.upsert({
        where: { userId_key: { userId, key } },
        update: { value },
        create: { userId, key, value },
    });
}
// ── Routes ──
/**
 * GET /api/settings
 */
router.get('/', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const [apiKeys, feishuUrl, aiProvider, imgModel, imgSize, imgQuality] = await Promise.all([
        database_1.default.apiKey.findMany({
            where: { userId },
            select: { id: true, provider: true, label: true, isActive: true, createdAt: true },
        }),
        getConfig(userId, 'feishu_webhook_url'),
        getConfig(userId, 'default_ai_provider'),
        getConfig(userId, 'default_image_model'),
        getConfig(userId, 'default_image_size'),
        getConfig(userId, 'default_image_quality'),
    ]);
    res.json({
        data: {
            apiKeys,
            feishuWebhookUrl: feishuUrl || '',
            defaultAiProvider: aiProvider || 'claude',
            defaultImageModel: imgModel || 'dall-e-3',
            defaultImageSize: imgSize || '1024x1024',
            defaultImageQuality: imgQuality || 'standard',
        },
    });
});
/**
 * PUT /api/settings
 */
router.put('/', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const { feishuWebhookUrl, defaultAiProvider, defaultImageModel, defaultImageSize, defaultImageQuality, } = req.body;
    const updates = [];
    if (feishuWebhookUrl !== undefined) {
        // Empty string clears the value; non-empty must be a safe https URL.
        if (feishuWebhookUrl !== '') {
            try {
                await (0, urlSafety_1.assertSafeFetchUrl)(feishuWebhookUrl);
            }
            catch (err) {
                res.status(400).json({ error: err instanceof urlSafety_1.UnsafeUrlError ? err.message : '飞书 Webhook 地址非法' });
                return;
            }
        }
        updates.push(setConfig(userId, 'feishu_webhook_url', feishuWebhookUrl));
    }
    if (defaultAiProvider !== undefined) {
        if (!['claude', 'openai'].includes(defaultAiProvider)) {
            res.status(400).json({ error: 'provider must be claude or openai' });
            return;
        }
        updates.push(setConfig(userId, 'default_ai_provider', defaultAiProvider));
    }
    if (defaultImageModel !== undefined) {
        if (typeof defaultImageModel !== 'string' || defaultImageModel.length > 64) {
            res.status(400).json({ error: 'defaultImageModel 非法' });
            return;
        }
        updates.push(setConfig(userId, 'default_image_model', defaultImageModel));
    }
    if (defaultImageSize !== undefined) {
        if (!['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'].includes(defaultImageSize)) {
            res.status(400).json({ error: 'defaultImageSize 非法' });
            return;
        }
        updates.push(setConfig(userId, 'default_image_size', defaultImageSize));
    }
    if (defaultImageQuality !== undefined) {
        if (!['standard', 'hd'].includes(defaultImageQuality)) {
            res.status(400).json({ error: 'defaultImageQuality 非法' });
            return;
        }
        updates.push(setConfig(userId, 'default_image_quality', defaultImageQuality));
    }
    await Promise.all(updates);
    res.json({ message: '已保存' });
});
/**
 * POST /api/settings/apikeys
 */
router.post('/apikeys', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const { provider, label, key } = req.body;
    if (!provider || !label || !key) {
        res.status(400).json({ error: '缺少 provider / label / key' });
        return;
    }
    if (typeof provider !== 'string' || provider.length > 32 ||
        typeof label !== 'string' || label.length > 64 ||
        typeof key !== 'string' || key.length > 256) {
        res.status(400).json({ error: 'provider / label / key 字段非法' });
        return;
    }
    const { encrypt } = require('../utils/crypto');
    const keyEncrypted = encrypt(key);
    const apiKey = await database_1.default.apiKey.create({
        data: { userId, provider, label, keyHash: keyEncrypted },
        select: { id: true, provider: true, label: true, isActive: true, createdAt: true },
    });
    res.status(201).json({ data: apiKey });
});
/**
 * DELETE /api/settings/apikeys/:keyId
 */
router.delete('/apikeys/:keyId', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const keyId = (0, express_2.param)(req, 'keyId');
    const key = await database_1.default.apiKey.findUnique({ where: { id: keyId } });
    if (!key || key.userId !== userId) {
        res.status(404).json({ error: '未找到' });
        return;
    }
    await database_1.default.apiKey.delete({ where: { id: keyId } });
    res.json({ message: '已删除' });
});
/**
 * GET /api/settings/agent-config?storeId=xxx
 * Get agent behavior config. If storeId provided, returns store-specific config.
 */
router.get('/agent-config', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const storeId = req.query.storeId;
    const key = storeId ? `agent_config_${storeId}` : 'agent_config_default';
    const config = await getConfig(userId, key);
    res.json({ data: { config: config || '', storeId: storeId || null } });
});
/**
 * PUT /api/settings/agent-config
 * Save agent behavior config. Body: { storeId?, config }
 */
router.put('/agent-config', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const { storeId, config } = req.body;
    if (typeof config !== 'string') {
        res.status(400).json({ error: 'config 不能为空' });
        return;
    }
    // Validate store ownership if storeId provided
    if (storeId) {
        const store = await database_1.default.store.findUnique({
            where: { id: storeId },
            select: { userId: true },
        });
        if (!store || store.userId !== userId) {
            res.status(403).json({ error: '无权配置此店铺' });
            return;
        }
    }
    const key = storeId ? `agent_config_${storeId}` : 'agent_config_default';
    await setConfig(userId, key, config);
    // Clear cache so next AI message uses new config
    (0, systemPrompt_1.clearAgentConfigCache)(storeId);
    res.json({ message: '已保存', storeId: storeId || null });
});
// ── Provider Config ──
// Provider apiKeys are encrypted at rest (AES-256-GCM, same as the ApiKey
// table). load/save transparently decrypt/encrypt so all callers work with
// plaintext in memory. Legacy plaintext rows decrypt to themselves and get
// encrypted on the next save (see crypto.ts isEncrypted/decryptIfNeeded).
function loadProviders(userId) {
    return getConfig(userId, PROVIDER_CONFIG_KEY).then((raw) => {
        if (!raw)
            return [];
        try {
            const providers = JSON.parse(raw);
            return providers.map((p) => ({ ...p, apiKey: (0, crypto_1.decryptIfNeeded)(p.apiKey) }));
        }
        catch {
            return [];
        }
    });
}
async function saveProviders(userId, providers) {
    const toStore = providers.map((p) => ({ ...p, apiKey: (0, crypto_1.encryptIfNeeded)(p.apiKey || '') }));
    await setConfig(userId, PROVIDER_CONFIG_KEY, JSON.stringify(toStore));
    (0, aiChat_service_1.clearProviderCache)(userId);
}
/**
 * GET /api/settings/providers
 */
router.get('/providers', auth_1.authMiddleware, async (req, res) => {
    const providers = await loadProviders(req.user.userId);
    // Strip apiKey from response (mask it)
    const masked = providers.map((p) => ({ ...p, apiKey: p.apiKey ? '●●●●' + p.apiKey.slice(-4) : '' }));
    res.json({ data: masked });
});
/**
 * PUT /api/settings/providers
 * Body: { providers: ProviderConfig[] }
 * Each provider: { id, name, type, apiBase, apiKey, models, defaultModel, protocol }
 */
router.put('/providers', auth_1.authMiddleware, async (req, res) => {
    const { providers } = req.body;
    if (!Array.isArray(providers)) {
        res.status(400).json({ error: 'providers must be an array' });
        return;
    }
    const userId = req.user.userId;
    // When apiKey is masked (●●●●...), preserve the existing key
    const existing = await loadProviders(userId);
    const merged = providers.map((p) => {
        if (p.apiKey && p.apiKey.startsWith('●●●●')) {
            const old = existing.find((e) => e.id === p.id);
            if (old)
                return { ...p, apiKey: old.apiKey };
        }
        return p;
    });
    // Validate each provider's apiBase (protocol only — local AI like Ollama is allowed).
    for (const p of merged) {
        if (p.apiBase) {
            try {
                (0, urlSafety_1.assertHttpUrl)(p.apiBase);
            }
            catch (err) {
                res.status(400).json({ error: `Provider ${p.name || p.id} 的 apiBase 非法: ${err instanceof urlSafety_1.UnsafeUrlError ? err.message : ''}` });
                return;
            }
        }
    }
    await saveProviders(userId, merged);
    res.json({ message: '已保存', count: merged.length });
});
/**
 * POST /api/settings/providers/test
 * Body: { provider: ProviderConfig }
 */
router.post('/providers/test', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const provider = req.body.provider;
    if (!provider || !provider.id || !provider.name || !provider.type || !provider.apiBase ||
        !provider.apiKey || !provider.defaultModel || !provider.protocol) {
        res.status(400).json({ error: 'Provider 配置不完整' });
        return;
    }
    const existing = await loadProviders(userId);
    const resolvedProvider = { ...provider };
    if (resolvedProvider.apiKey.startsWith('●●●●')) {
        const old = existing.find((p) => p.id === resolvedProvider.id);
        if (!old?.apiKey) {
            res.status(400).json({ error: 'API Key 不完整，请重新输入' });
            return;
        }
        resolvedProvider.apiKey = old.apiKey;
    }
    try {
        // Validate apiBase protocol before the server fetches it.
        try {
            (0, urlSafety_1.assertHttpUrl)(resolvedProvider.apiBase);
        }
        catch (err) {
            res.status(400).json({ error: `apiBase 非法: ${err instanceof urlSafety_1.UnsafeUrlError ? err.message : ''}` });
            return;
        }
        if (resolvedProvider.type === 'chat' || resolvedProvider.type === 'both') {
            const chatProvider = (0, genericProvider_1.createChatProvider)(resolvedProvider);
            const reply = await chatProvider.chat([{ role: 'user', content: '请只回复 OK' }], { maxTokens: 16, temperature: 0 });
            res.json({ message: '连接成功', data: { mode: 'chat', sample: reply.slice(0, 80) } });
            return;
        }
        const url = `${resolvedProvider.apiBase.replace(/\/$/, '')}/models`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${resolvedProvider.apiKey}` },
        });
        if (!response.ok) {
            // Do not echo remote body — avoids SSRF data-exfiltration channel.
            res.status(400).json({ error: `连接失败: ${response.status}` });
            return;
        }
        res.json({ message: '连接成功', data: { mode: 'models' } });
    }
    catch (err) {
        res.status(400).json({ error: err.message || '连接失败' });
    }
});
/**
 * DELETE /api/settings/providers/:providerId
 */
router.delete('/providers/:providerId', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const providerId = (0, express_2.param)(req, 'providerId');
    const providers = await loadProviders(userId);
    const filtered = providers.filter((p) => p.id !== providerId);
    if (filtered.length === providers.length) {
        res.status(404).json({ error: '未找到' });
        return;
    }
    await saveProviders(userId, filtered);
    res.json({ message: '已删除' });
});
/**
 * POST /api/settings/test-feishu
 * Send a test notification through the server (validates server-side delivery).
 */
router.post('/test-feishu', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const webhookUrl = await getConfig(userId, 'feishu_webhook_url');
    if (!webhookUrl) {
        res.status(400).json({ error: '未配置飞书 Webhook 地址' });
        return;
    }
    const ok = await feishu_1.feishuService.sendText(webhookUrl, '✅ 多多AI客服 通知测试成功！');
    if (ok) {
        res.json({ message: '测试消息已发送' });
    }
    else {
        res.status(500).json({ error: '发送失败，请检查 Webhook 地址' });
    }
});
exports.default = router;
//# sourceMappingURL=settings.routes.js.map