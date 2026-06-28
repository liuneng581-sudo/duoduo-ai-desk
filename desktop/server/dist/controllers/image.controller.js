"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.imageController = void 0;
const image_service_1 = require("../services/image.service");
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../utils/logger"));
exports.imageController = {
    /** POST /api/images/generate */
    async generate(req, res) {
        try {
            const { mode, prompt, sourceImageUrl, storeId, productId, model, size, quality, n } = req.body;
            if (!mode || !['text2img', 'img2img'].includes(mode)) {
                res.status(400).json({ error: 'mode 必须为 text2img 或 img2img' });
                return;
            }
            if (!prompt || typeof prompt !== 'string') {
                res.status(400).json({ error: 'prompt 不能为空' });
                return;
            }
            if (prompt.length > 4000) {
                res.status(400).json({ error: 'prompt 过长（最多 4000 字符）' });
                return;
            }
            if (mode === 'img2img' && !sourceImageUrl) {
                res.status(400).json({ error: '图生图模式需要提供 sourceImageUrl' });
                return;
            }
            // sourceImageUrl may be a data: URI (local upload, base64) or an http(s) URL.
            // Cap base64 payloads ~8MB decoded (~10.7MB base64) to stay under the body limit.
            if (typeof sourceImageUrl === 'string' && sourceImageUrl.length > 11_000_000) {
                res.status(413).json({ error: '上传的图片过大，请压缩到 8MB 以内' });
                return;
            }
            // Server-side bounds on generation params.
            let safeN;
            if (n !== undefined && n !== null) {
                const parsed = Number(n);
                if (!Number.isFinite(parsed)) {
                    res.status(400).json({ error: 'n 必须为数字' });
                    return;
                }
                safeN = Math.min(4, Math.max(1, Math.floor(parsed)));
            }
            const ALLOWED_SIZES = ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'];
            if (size !== undefined && size !== null && !ALLOWED_SIZES.includes(size)) {
                res.status(400).json({ error: `size 无效，允许值：${ALLOWED_SIZES.join(', ')}` });
                return;
            }
            const ALLOWED_QUALITIES = ['standard', 'hd'];
            if (quality !== undefined && quality !== null && !ALLOWED_QUALITIES.includes(quality)) {
                res.status(400).json({ error: `quality 无效，允许值：${ALLOWED_QUALITIES.join(', ')}` });
                return;
            }
            if (model !== undefined && model !== null && (typeof model !== 'string' || model.length > 100)) {
                res.status(400).json({ error: 'model 无效' });
                return;
            }
            // IDOR guard: verify storeId (and productId, if given) belong to the caller.
            // storeId arrives in the body (not :storeId param), so requireStoreAccess
            // cannot be used here — check ownership explicitly.
            if (storeId) {
                const store = await database_1.default.store.findUnique({
                    where: { id: storeId },
                    select: { userId: true },
                });
                if (!store || store.userId !== req.user.userId) {
                    res.status(403).json({ error: '无权访问此店铺' });
                    return;
                }
            }
            if (productId) {
                const product = await database_1.default.product.findUnique({
                    where: { id: productId },
                    select: { store: { select: { userId: true } } },
                });
                if (!product || product.store.userId !== req.user.userId) {
                    res.status(403).json({ error: '无权访问此商品' });
                    return;
                }
            }
            const result = await image_service_1.imageService.generate({
                userId: req.user.userId,
                storeId,
                productId,
                mode,
                prompt,
                sourceImageUrl,
                model: model || undefined,
                size: size || undefined,
                quality: quality || undefined,
                n: safeN,
            });
            res.status(201).json({ data: result });
        }
        catch (err) {
            logger_1.default.error('Image generate failed', { message: err?.message });
            // Surface actionable errors (no provider configured / upstream rejected) so
            // the user knows what to fix, instead of an opaque 500.
            const msg = err?.message || '';
            if (/未配置|provider|api.?key/i.test(msg)) {
                res.status(400).json({ error: msg || '未配置图片生成 Provider，请在系统设置中添加' });
                return;
            }
            res.status(500).json({ error: msg || '图片生成失败，请稍后重试' });
        }
    },
    /** GET /api/images/history */
    async history(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const pageSize = parseInt(req.query.pageSize) || 20;
            const result = await image_service_1.imageService.getHistory(req.user.userId, page, pageSize);
            res.json({ data: result.data, total: result.total, page: result.page, pageSize: result.pageSize });
        }
        catch (err) {
            logger_1.default.error('Image history failed', { message: err?.message });
            res.status(500).json({ error: '查询失败，请稍后重试' });
        }
    },
    /** DELETE /api/images/:id */
    async remove(req, res) {
        try {
            const ok = await image_service_1.imageService.delete(req.user.userId, req.params.id);
            if (!ok) {
                res.status(404).json({ error: '记录不存在' });
                return;
            }
            res.json({ message: '已删除' });
        }
        catch (err) {
            logger_1.default.error('Image delete failed', { message: err?.message });
            res.status(500).json({ error: '删除失败，请稍后重试' });
        }
    },
};
//# sourceMappingURL=image.controller.js.map