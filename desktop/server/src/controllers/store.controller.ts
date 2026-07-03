import { Request, Response } from 'express';
import { storeService } from '../services/store.service';
import { param } from '../types/express';
import logger from '../utils/logger';

export const storeController = {
  async list(req: Request, res: Response) {
    try {
      const stores = await storeService.list(req.user!.userId);
      res.json({ data: stores });
    } catch (err: any) {
      res.status(500).json({ error: '查询失败' });
    }
  },

  async get(req: Request, res: Response) {
    try {
      const storeId = param(req, 'storeId');
      const store = await storeService.get(storeId);
      if (!store) {
        res.status(404).json({ error: '店铺不存在' });
        return;
      }
      res.json({ data: store });
    } catch (err: any) {
      res.status(500).json({ error: '查询失败' });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const { name, shopId, description, loginAccount, loginPassword } = req.body;
      if (!name) {
        res.status(400).json({ error: '店铺名称不能为空' });
        return;
      }
      const store = await storeService.create(req.user!.userId, { name, shopId, description, loginAccount, loginPassword });
      res.status(201).json({ data: store });
    } catch (err: any) {
      logger.error('Store create failed', { message: err?.message });
      res.status(500).json({ error: '操作失败，请稍后重试' });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const storeId = param(req, 'storeId');
      const { name, shopId, description, loginAccount, loginPassword, clearCredentials, aiEnabled, aiPauseOnSensitive } = req.body;
      const store = await storeService.update(storeId, { name, shopId, description, loginAccount, loginPassword, clearCredentials, aiEnabled, aiPauseOnSensitive });
      res.json({ data: store });
    } catch (err: any) {
      logger.error('Store update failed', { message: err?.message });
      res.status(500).json({ error: '操作失败，请稍后重试' });
    }
  },

  async remove(req: Request, res: Response) {
    try {
      const storeId = param(req, 'storeId');
      await storeService.remove(storeId);
      res.json({ message: '已删除' });
    } catch (err: any) {
      res.status(500).json({ error: '删除失败' });
    }
  },
};
