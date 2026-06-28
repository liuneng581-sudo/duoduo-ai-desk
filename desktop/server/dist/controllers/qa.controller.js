"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.qaController = void 0;
const qa_service_1 = require("../services/qa.service");
const express_1 = require("../types/express");
const logger_1 = __importDefault(require("../utils/logger"));
exports.qaController = {
    async list(req, res) {
        try {
            const storeId = (0, express_1.param)(req, 'storeId');
            const search = typeof req.query.search === 'string' ? req.query.search : undefined;
            const category = typeof req.query.category === 'string' ? req.query.category : undefined;
            const entries = await qa_service_1.qaService.list(storeId, { search, category });
            res.json({ data: entries });
        }
        catch (err) {
            res.status(500).json({ error: '查询失败' });
        }
    },
    async create(req, res) {
        try {
            const storeId = (0, express_1.param)(req, 'storeId');
            const { question, answer, keywords, category, enabled } = req.body;
            if (!question || typeof question !== 'string' || !question.trim()) {
                res.status(400).json({ error: '问题不能为空' });
                return;
            }
            if (!answer || typeof answer !== 'string' || !answer.trim()) {
                res.status(400).json({ error: '答案不能为空' });
                return;
            }
            const entry = await qa_service_1.qaService.create(storeId, {
                question: question.trim().slice(0, 500),
                answer: answer.trim().slice(0, 2000),
                keywords: keywords ? String(keywords).slice(0, 200) : null,
                category: category ? String(category).slice(0, 50) : null,
                enabled: enabled === undefined ? true : Boolean(enabled),
            });
            res.status(201).json({ data: entry });
        }
        catch (err) {
            res.status(500).json({ error: '创建失败' });
        }
    },
    async update(req, res) {
        try {
            const storeId = (0, express_1.param)(req, 'storeId');
            const id = (0, express_1.param)(req, 'qaId');
            const { question, answer, keywords, category, enabled } = req.body;
            const patch = {};
            if (question !== undefined) {
                const q = String(question).trim();
                if (!q) {
                    res.status(400).json({ error: '问题不能为空' });
                    return;
                }
                patch.question = q.slice(0, 500);
            }
            if (answer !== undefined) {
                const a = String(answer).trim();
                if (!a) {
                    res.status(400).json({ error: '答案不能为空' });
                    return;
                }
                patch.answer = a.slice(0, 2000);
            }
            if (keywords !== undefined)
                patch.keywords = keywords ? String(keywords).slice(0, 200) : null;
            if (category !== undefined)
                patch.category = category ? String(category).slice(0, 50) : null;
            if (enabled !== undefined)
                patch.enabled = Boolean(enabled);
            const entry = await qa_service_1.qaService.update(storeId, id, patch);
            if (!entry) {
                res.status(404).json({ error: '问答不存在' });
                return;
            }
            res.json({ data: entry });
        }
        catch (err) {
            res.status(500).json({ error: '更新失败' });
        }
    },
    async remove(req, res) {
        try {
            const ok = await qa_service_1.qaService.remove((0, express_1.param)(req, 'storeId'), (0, express_1.param)(req, 'qaId'));
            if (!ok) {
                res.status(404).json({ error: '问答不存在' });
                return;
            }
            res.json({ message: '已删除' });
        }
        catch (err) {
            res.status(500).json({ error: '删除失败' });
        }
    },
    /** POST /stores/:storeId/qa/import — multipart file field "file" (.xlsx) */
    async importExcel(req, res) {
        try {
            const storeId = (0, express_1.param)(req, 'storeId');
            const file = req.file;
            if (!file) {
                res.status(400).json({ error: '未收到文件,请上传 .xlsx' });
                return;
            }
            const result = await qa_service_1.qaService.importFromExcel(storeId, file.buffer);
            res.json({ data: result });
        }
        catch (err) {
            logger_1.default.error('Q&A import failed', { message: err?.message });
            res.status(500).json({ error: '导入失败，请稍后重试' });
        }
    },
    /** GET /stores/:storeId/qa/template — download the .xlsx import template */
    async template(_req, res) {
        try {
            const buf = await qa_service_1.qaService.buildTemplate();
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="qa-import-template.xlsx"');
            res.send(buf);
        }
        catch (err) {
            res.status(500).json({ error: '模板生成失败' });
        }
    },
    /** GET /stores/:storeId/qa/export — download all Q&A as .xlsx */
    async exportExcel(req, res) {
        try {
            const buf = await qa_service_1.qaService.exportToExcel((0, express_1.param)(req, 'storeId'));
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="qa-export.xlsx"');
            res.send(buf);
        }
        catch (err) {
            res.status(500).json({ error: '导出失败' });
        }
    },
};
//# sourceMappingURL=qa.controller.js.map