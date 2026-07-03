import { Request, Response } from 'express';
import { qaService } from '../services/qa.service';
import { param } from '../types/express';
import logger from '../utils/logger';

export const qaController = {
  async list(req: Request, res: Response) {
    try {
      const storeId = param(req, 'storeId');
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const entries = await qaService.list(storeId, { search, category });
      res.json({ data: entries });
    } catch (err: any) {
      res.status(500).json({ error: '查询失败' });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const storeId = param(req, 'storeId');
      const { question, answer, keywords, category, enabled } = req.body;
      if (!question || typeof question !== 'string' || !question.trim()) {
        res.status(400).json({ error: '问题不能为空' });
        return;
      }
      if (!answer || typeof answer !== 'string' || !answer.trim()) {
        res.status(400).json({ error: '答案不能为空' });
        return;
      }
      const entry = await qaService.create(storeId, {
        question: question.trim().slice(0, 500),
        answer: answer.trim().slice(0, 2000),
        keywords: keywords ? String(keywords).slice(0, 200) : null,
        category: category ? String(category).slice(0, 50) : null,
        enabled: enabled === undefined ? true : Boolean(enabled),
      });
      res.status(201).json({ data: entry });
    } catch (err: any) {
      res.status(500).json({ error: '创建失败' });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const storeId = param(req, 'storeId');
      const id = param(req, 'qaId');
      const { question, answer, keywords, category, enabled } = req.body;
      const patch: any = {};
      if (question !== undefined) {
        const q = String(question).trim();
        if (!q) { res.status(400).json({ error: '问题不能为空' }); return; }
        patch.question = q.slice(0, 500);
      }
      if (answer !== undefined) {
        const a = String(answer).trim();
        if (!a) { res.status(400).json({ error: '答案不能为空' }); return; }
        patch.answer = a.slice(0, 2000);
      }
      if (keywords !== undefined) patch.keywords = keywords ? String(keywords).slice(0, 200) : null;
      if (category !== undefined) patch.category = category ? String(category).slice(0, 50) : null;
      if (enabled !== undefined) patch.enabled = Boolean(enabled);
      const entry = await qaService.update(storeId, id, patch);
      if (!entry) {
        res.status(404).json({ error: '问答不存在' });
        return;
      }
      res.json({ data: entry });
    } catch (err: any) {
      res.status(500).json({ error: '更新失败' });
    }
  },

  async remove(req: Request, res: Response) {
    try {
      const ok = await qaService.remove(param(req, 'storeId'), param(req, 'qaId'));
      if (!ok) {
        res.status(404).json({ error: '问答不存在' });
        return;
      }
      res.json({ message: '已删除' });
    } catch (err: any) {
      res.status(500).json({ error: '删除失败' });
    }
  },

  /** POST /stores/:storeId/qa/import — multipart file field "file" (.xlsx) */
  async importExcel(req: Request, res: Response) {
    try {
      const storeId = param(req, 'storeId');
      const file = (req as any).file as { buffer: Buffer } | undefined;
      if (!file) {
        res.status(400).json({ error: '未收到文件,请上传 .xlsx' });
        return;
      }
      const result = await qaService.importFromExcel(storeId, file.buffer);
      res.json({ data: result });
    } catch (err: any) {
      logger.error('Q&A import failed', { message: err?.message });
      res.status(500).json({ error: '导入失败，请稍后重试' });
    }
  },

  /** GET /stores/:storeId/qa/template — download the .xlsx import template */
  async template(_req: Request, res: Response) {
    try {
      const buf = await qaService.buildTemplate();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="qa-import-template.xlsx"');
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ error: '模板生成失败' });
    }
  },

  /** GET /stores/:storeId/qa/export — download all Q&A as .xlsx */
  async exportExcel(req: Request, res: Response) {
    try {
      const buf = await qaService.exportToExcel(param(req, 'storeId'));
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="qa-export.xlsx"');
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ error: '导出失败' });
    }
  },
};
