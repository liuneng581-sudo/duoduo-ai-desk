import { Request, Response } from 'express';
import { productService } from '../services/product.service';
import { param } from '../types/express';
import logger from '../utils/logger';

export const productController = {
  async list(req: Request, res: Response) {
    try {
      const storeId = param(req, 'storeId');
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const products = await productService.list(storeId, { search, category });
      res.json({ data: products });
    } catch (err: any) {
      res.status(500).json({ error: '查询失败' });
    }
  },

  async get(req: Request, res: Response) {
    try {
      const product = await productService.get(param(req, 'storeId'), param(req, 'productId'));
      if (!product) {
        res.status(404).json({ error: '商品不存在' });
        return;
      }
      res.json({ data: product });
    } catch (err: any) {
      res.status(500).json({ error: '查询失败' });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const storeId = param(req, 'storeId');
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
      const product = await productService.create(storeId, {
        name: name.trim().slice(0, 200),
        price: numPrice,
        stock: Math.floor(numStock),
        category: category ? String(category).slice(0, 50) : null,
        productUrl: productUrl ? String(productUrl).slice(0, 1000) : null,
        description: description ? String(description).slice(0, 2000) : null,
        imageUrls: imageUrls ?? null,
      });
      res.status(201).json({ data: product });
    } catch (err: any) {
      res.status(500).json({ error: '创建失败' });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const storeId = param(req, 'storeId');
      const productId = param(req, 'productId');
      const { name, price, stock, category, productUrl, description, imageUrls, status } = req.body;
      const patch: any = {};
      if (name !== undefined) {
        const n = String(name).trim();
        if (!n) { res.status(400).json({ error: '商品名不能为空' }); return; }
        patch.name = n.slice(0, 200);
      }
      if (price !== undefined) {
        const p = Number(price);
        if (!Number.isFinite(p) || p < 0) { res.status(400).json({ error: '价格无效' }); return; }
        patch.price = p;
      }
      if (stock !== undefined) {
        const s = Number(stock);
        if (!Number.isFinite(s) || s < 0) { res.status(400).json({ error: '库存无效' }); return; }
        patch.stock = Math.floor(s);
      }
      if (category !== undefined) patch.category = category ? String(category).slice(0, 50) : null;
      if (productUrl !== undefined) patch.productUrl = productUrl ? String(productUrl).slice(0, 1000) : null;
      if (description !== undefined) patch.description = description ? String(description).slice(0, 2000) : null;
      if (imageUrls !== undefined) patch.imageUrls = imageUrls;
      if (status !== undefined) patch.status = status;
      const product = await productService.update(storeId, productId, patch);
      if (!product) {
        res.status(404).json({ error: '商品不存在' });
        return;
      }
      res.json({ data: product });
    } catch (err: any) {
      // P2002 = unique (storeId, externalId) collision when the link maps to an existing product
      if (err?.code === 'P2002') {
        res.status(409).json({ error: '该商品链接已存在于本店其他商品' });
        return;
      }
      res.status(500).json({ error: '更新失败' });
    }
  },

  async remove(req: Request, res: Response) {
    try {
      const ok = await productService.remove(param(req, 'storeId'), param(req, 'productId'));
      if (!ok) {
        res.status(404).json({ error: '商品不存在' });
        return;
      }
      res.json({ message: '已删除' });
    } catch (err: any) {
      res.status(500).json({ error: '删除失败' });
    }
  },

  /** POST /stores/:storeId/products/import — multipart file field "file" (.xlsx) */
  async importExcel(req: Request, res: Response) {
    try {
      const storeId = param(req, 'storeId');
      const file = (req as any).file as { buffer: Buffer } | undefined;
      if (!file) {
        res.status(400).json({ error: '未收到文件,请上传 .xlsx' });
        return;
      }
      const result = await productService.importFromExcel(storeId, file.buffer);
      res.json({ data: result });
    } catch (err: any) {
      logger.error('Product import failed', { message: err?.message });
      res.status(500).json({ error: '导入失败，请稍后重试' });
    }
  },

  /** GET /stores/:storeId/products/template — download the .xlsx import template */
  async template(_req: Request, res: Response) {
    try {
      const buf = await productService.buildTemplate();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="product-import-template.xlsx"');
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ error: '模板生成失败' });
    }
  },

  /** GET /stores/:storeId/products/export — download the whole catalog as .xlsx */
  async exportExcel(req: Request, res: Response) {
    try {
      const buf = await productService.exportToExcel(param(req, 'storeId'));
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="products-export.xlsx"');
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ error: '导出失败' });
    }
  },

  /** POST /stores/:storeId/products/sync-from-pdd — START a background sync. */
  async syncFromPdd(req: Request, res: Response) {
    try {
      const task = productService.startSyncFromPdd(param(req, 'storeId'));
      // Returns immediately; client polls /sync-status for progress.
      res.json({ data: task });
    } catch (err: any) {
      const msg = err?.message || '抓取失败';
      logger.warn('Product sync from PDD failed to start', { message: msg });
      res.status(503).json({ error: `${msg}。请确认店铺已在「店铺」页连接并登录后重试` });
    }
  },

  /** GET /stores/:storeId/products/sync-status — poll background sync progress. */
  async syncStatus(req: Request, res: Response) {
    try {
      const task = productService.getSyncStatus(param(req, 'storeId'));
      res.json({ data: task });
    } catch (err: any) {
      res.status(500).json({ error: '查询同步状态失败' });
    }
  },
};
