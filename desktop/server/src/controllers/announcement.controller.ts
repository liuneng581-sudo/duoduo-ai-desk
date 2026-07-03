import { Request, Response } from 'express';
import { announcementService } from '../services/announcement.service';
import { param } from '../types/express';

export const announcementController = {
  /** GET /announcements — list active announcements (client-facing). */
  async listActive(_req: Request, res: Response) {
    try {
      const items = await announcementService.listActive();
      res.json({ data: items });
    } catch {
      res.status(500).json({ error: '查询公告失败' });
    }
  },

  /** GET /announcements/all — list all announcements (admin). */
  async listAll(_req: Request, res: Response) {
    try {
      const items = await announcementService.listAll();
      res.json({ data: items });
    } catch {
      res.status(500).json({ error: '查询公告失败' });
    }
  },

  /** POST /announcements — create a new announcement. */
  async create(req: Request, res: Response) {
    try {
      const { title, content, level, active } = req.body;
      if (!title || typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ error: '标题不能为空' });
        return;
      }
      if (!content || typeof content !== 'string' || !content.trim()) {
        res.status(400).json({ error: '内容不能为空' });
        return;
      }
      if (level && !['info', 'warning'].includes(level)) {
        res.status(400).json({ error: 'level 必须是 info 或 warning' });
        return;
      }
      const item = await announcementService.create({
        title: title.trim().slice(0, 200),
        content: content.trim().slice(0, 5000),
        level: level || 'info',
        active: active !== undefined ? Boolean(active) : true,
      });
      res.status(201).json({ data: item });
    } catch {
      res.status(500).json({ error: '创建公告失败' });
    }
  },

  /** PUT /announcements/:id — update an announcement. */
  async update(req: Request, res: Response) {
    try {
      const id = param(req, 'id');
      const { title, content, level, active } = req.body;
      const patch: Record<string, any> = {};
      if (title !== undefined) {
        const t = String(title).trim();
        if (!t) { res.status(400).json({ error: '标题不能为空' }); return; }
        patch.title = t.slice(0, 200);
      }
      if (content !== undefined) {
        const c = String(content).trim();
        if (!c) { res.status(400).json({ error: '内容不能为空' }); return; }
        patch.content = c.slice(0, 5000);
      }
      if (level !== undefined) {
        if (!['info', 'warning'].includes(level)) {
          res.status(400).json({ error: 'level 必须是 info 或 warning' });
          return;
        }
        patch.level = level;
      }
      if (active !== undefined) patch.active = Boolean(active);
      const item = await announcementService.update(id, patch);
      if (!item) {
        res.status(404).json({ error: '公告不存在' });
        return;
      }
      res.json({ data: item });
    } catch {
      res.status(500).json({ error: '更新公告失败' });
    }
  },

  /** DELETE /announcements/:id — delete an announcement. */
  async remove(req: Request, res: Response) {
    try {
      const id = param(req, 'id');
      const ok = await announcementService.remove(id);
      if (!ok) {
        res.status(404).json({ error: '公告不存在' });
        return;
      }
      res.json({ message: '已删除' });
    } catch {
      res.status(500).json({ error: '删除公告失败' });
    }
  },
};
