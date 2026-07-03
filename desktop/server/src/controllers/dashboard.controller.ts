import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboard.service';
import { companionGateway } from '../services/companion/gateway';
import { param } from '../types/express';

export const dashboardController = {
  async getOverview(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const data = await dashboardService.getOverview(userId);
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: '查询失败' });
    }
  },

  async getStoreSummary(req: Request, res: Response) {
    try {
      const storeId = param(req, 'storeId');
      const data = await dashboardService.getStoreSummary(storeId);
      if (!data) {
        res.status(404).json({ error: '店铺不存在' });
        return;
      }
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: '查询失败' });
    }
  },

  /** Live revenue/order stats pulled from PDD on demand (manual refresh). */
  async getStoreRevenue(req: Request, res: Response) {
    try {
      const storeId = param(req, 'storeId');
      const stats = await companionGateway.requestStats(storeId);
      res.json({ data: stats });
    } catch (err: any) {
      // companion offline / store not running / PDD timeout — surface as 503 so
      // the page can show "请先启动店铺" rather than a generic error.
      res.status(503).json({ error: err.message || '获取门店数据失败' });
    }
  },
};
