"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.productController = void 0;
const product_service_1 = require("../services/product.service");
const express_1 = require("../types/express");
const logger_1 = __importDefault(require("../utils/logger"));
exports.productController = {
    async list(req, res) {
        try {
            const storeId = (0, express_1.param)(req, 'storeId');
            const search = typeof req.query.search === 'string' ? req.query.search : undefined;
            const category = typeof req.query.category === 'string' ? req.query.category : undefined;
            const products = await product_service_1.productService.list(storeId, { search, category });
            res.json({ data: products });
        }
        catch (err) {
            res.status(500).json({ error: '查询失败' });
        }
    },
    async get(req, res) {
        try {
            const product = await product_service_1.productService.get((0, express_1.param)(req, 'storeId'), (0, express_1.param)(req, 'productId'));
            if (!product) {
                res.status(404).json({ error: '商品不存在' });
                return;
            }
            res.json({ data: product });
        }
        catch (err) {
            res.status(500).json({ error: '查询失败' });
        }
    },
    async create(req, res) {
        try {
            const storeId = (0, express_1.param)(req, 'storeId');
            const { name, price, stock, category, productUrl, description, imageUrls } = req.body;
            if (!name || typeof name !== 'string' || !name.trim()) {
                res.status(400).json({ error: '商品名不能为空' });
                return;
            }
            const numPrice = Number(price);
            if (!Number.isFinite(numPrice) || numPrice < 0) {
                res.status(400).json({ error: '价格无效，必须为非负数字' });
                return;
            }
            let numStock = 0;
            if (stock != null) {
                numStock = Number(stock);
                if (!Number.isFinite(numStock) || numStock < 0) {
                    res.status(400).json({ error: '库存无效，必须为非负数字' });
                    return;
                }
            }
            const product = await product_service_1.productService.create(storeId, {
                name: name.trim().slice(0, 200),
                price: numPrice,
                stock: Math.floor(numStock),
                category: category ? String(category).slice(0, 50) : null,
                productUrl: productUrl ? String(productUrl).slice(0, 1000) : null,
                description: description ? String(description).slice(0, 2000) : null,
                imageUrls: imageUrls ?? null,
            });
            res.status(201).json({ data: product });
        }
        catch (err) {
            res.status(500).json({ error: '创建失败' });
        }
    },
    async update(req, res) {
        try {
            const storeId = (0, express_1.param)(req, 'storeId');
            const productId = (0, express_1.param)(req, 'productId');
            const { name, price, stock, category, productUrl, description, imageUrls, status } = req.body;
            const patch = {};
            if (name !== undefined) {
                const n = String(name).trim();
                if (!n) {
                    res.status(400).json({ error: '商品名不能为空' });
                    return;
                }
                patch.name = n.slice(0, 200);
            }
            if (price !== undefined) {
                const p = Number(price);
                if (!Number.isFinite(p) || p < 0) {
                    res.status(400).json({ error: '价格无效' });
                    return;
                }
                patch.price = p;
            }
            if (stock !== undefined) {
                const s = Number(stock);
                if (!Number.isFinite(s) || s < 0) {
                    res.status(400).json({ error: '库存无效' });
                    return;
                }
                patch.stock = Math.floor(s);
            }
            if (category !== undefined)
                patch.category = category ? String(category).slice(0, 50) : null;
            if (productUrl !== undefined)
                patch.productUrl = productUrl ? String(productUrl).slice(0, 1000) : null;
            if (description !== undefined)
                patch.description = description ? String(description).slice(0, 2000) : null;
            if (imageUrls !== undefined)
                patch.imageUrls = imageUrls;
            if (status !== undefined)
                patch.status = status;
            const product = await product_service_1.productService.update(storeId, productId, patch);
            if (!product) {
                res.status(404).json({ error: '商品不存在' });
                return;
            }
            res.json({ data: product });
        }
        catch (err) {
            // P2002 = unique (storeId, externalId) collision when the link maps to an existing product
            if (err?.code === 'P2002') {
                res.status(409).json({ error: '该商品链接已存在于本店其他商品' });
                return;
            }
            res.status(500).json({ error: '更新失败' });
        }
    },
    async remove(req, res) {
        try {
            const ok = await product_service_1.productService.remove((0, express_1.param)(req, 'storeId'), (0, express_1.param)(req, 'productId'));
            if (!ok) {
                res.status(404).json({ error: '商品不存在' });
                return;
            }
            res.json({ message: '已删除' });
        }
        catch (err) {
            res.status(500).json({ error: '删除失败' });
        }
    },
    /** POST /stores/:storeId/products/import — multipart file field "file" (.xlsx) */
    async importExcel(req, res) {
        try {
            const storeId = (0, express_1.param)(req, 'storeId');
            const file = req.file;
            if (!file) {
                res.status(400).json({ error: '未收到文件,请上传 .xlsx' });
                return;
            }
            const result = await product_service_1.productService.importFromExcel(storeId, file.buffer);
            res.json({ data: result });
        }
        catch (err) {
            logger_1.default.error('Product import failed', { message: err?.message });
            res.status(500).json({ error: '导入失败，请稍后重试' });
        }
    },
    /** GET /stores/:storeId/products/template — download the .xlsx import template */
    async template(_req, res) {
        try {
            const buf = await product_service_1.productService.buildTemplate();
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="product-import-template.xlsx"');
            res.send(buf);
        }
        catch (err) {
            res.status(500).json({ error: '模板生成失败' });
        }
    },
    /** GET /stores/:storeId/products/export — download the whole catalog as .xlsx */
    async exportExcel(req, res) {
        try {
            const buf = await product_service_1.productService.exportToExcel((0, express_1.param)(req, 'storeId'));
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="products-export.xlsx"');
            res.send(buf);
        }
        catch (err) {
            res.status(500).json({ error: '导出失败' });
        }
    },
    /** POST /stores/:storeId/products/sync-from-pdd — START a background sync. */
    async syncFromPdd(req, res) {
        try {
            const task = product_service_1.productService.startSyncFromPdd((0, express_1.param)(req, 'storeId'));
            // Returns immediately; client polls /sync-status for progress.
            res.json({ data: task });
        }
        catch (err) {
            const msg = err?.message || '抓取失败';
            logger_1.default.warn('Product sync from PDD failed to start', { message: msg });
            res.status(503).json({ error: `${msg}。请确认店铺已在「店铺」页连接并登录后重试` });
        }
    },
    /** GET /stores/:storeId/products/sync-status — poll background sync progress. */
    async syncStatus(req, res) {
        try {
            const task = product_service_1.productService.getSyncStatus((0, express_1.param)(req, 'storeId'));
            res.json({ data: task });
        }
        catch (err) {
            res.status(500).json({ error: '查询同步状态失败' });
        }
    },
};
//# sourceMappingURL=product.controller.js.map