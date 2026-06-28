"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeController = void 0;
const store_service_1 = require("../services/store.service");
const express_1 = require("../types/express");
const logger_1 = __importDefault(require("../utils/logger"));
exports.storeController = {
    async list(req, res) {
        try {
            const stores = await store_service_1.storeService.list(req.user.userId);
            res.json({ data: stores });
        }
        catch (err) {
            res.status(500).json({ error: '查询失败' });
        }
    },
    async get(req, res) {
        try {
            const storeId = (0, express_1.param)(req, 'storeId');
            const store = await store_service_1.storeService.get(storeId);
            if (!store) {
                res.status(404).json({ error: '店铺不存在' });
                return;
            }
            res.json({ data: store });
        }
        catch (err) {
            res.status(500).json({ error: '查询失败' });
        }
    },
    async create(req, res) {
        try {
            const { name, shopId, description, loginAccount, loginPassword } = req.body;
            if (!name) {
                res.status(400).json({ error: '店铺名称不能为空' });
                return;
            }
            const store = await store_service_1.storeService.create(req.user.userId, { name, shopId, description, loginAccount, loginPassword });
            res.status(201).json({ data: store });
        }
        catch (err) {
            logger_1.default.error('Store create failed', { message: err?.message });
            res.status(500).json({ error: '操作失败，请稍后重试' });
        }
    },
    async update(req, res) {
        try {
            const storeId = (0, express_1.param)(req, 'storeId');
            const { name, shopId, description, loginAccount, loginPassword, clearCredentials, aiEnabled, aiPauseOnSensitive } = req.body;
            const store = await store_service_1.storeService.update(storeId, { name, shopId, description, loginAccount, loginPassword, clearCredentials, aiEnabled, aiPauseOnSensitive });
            res.json({ data: store });
        }
        catch (err) {
            logger_1.default.error('Store update failed', { message: err?.message });
            res.status(500).json({ error: '操作失败，请稍后重试' });
        }
    },
    async remove(req, res) {
        try {
            const storeId = (0, express_1.param)(req, 'storeId');
            await store_service_1.storeService.remove(storeId);
            res.json({ message: '已删除' });
        }
        catch (err) {
            res.status(500).json({ error: '删除失败' });
        }
    },
};
//# sourceMappingURL=store.controller.js.map