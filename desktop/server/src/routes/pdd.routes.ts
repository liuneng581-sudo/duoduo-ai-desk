import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireStoreAccess } from '../middleware/storeAccess';
import { companionGateway } from '../services/companion/gateway';
import { param } from '../types/express';
import { storeService } from '../services/store.service';
import prisma from '../config/database';

const router = Router();

/**
 * GET /api/pdd/alerts
 * Pending alerts the owner should act on:
 *   - browser issues (login / captcha / connection error)
 *   - conversations the AI handed off to a human (status pending_human)
 * Both surface in the header bell so nothing is silently dropped — this is the
 * in-app signal that does NOT depend on Feishu being configured.
 */
router.get('/alerts', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const [stores, handoffs] = await Promise.all([
      prisma.store.findMany({
        where: { userId, browserState: { in: ['needs_login', 'needs_captcha', 'error'] } },
        select: { id: true, name: true, browserState: true, updatedAt: true },
      }),
      prisma.conversation.findMany({
        where: { status: 'pending_human', store: { userId } },
        select: { id: true, storeId: true, title: true, updatedAt: true, store: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    ]);

    const storeAlerts = stores.map((s) => ({
      storeId: s.id,
      storeName: s.name,
      type: s.browserState === 'needs_login' ? 'needs_login' :
            s.browserState === 'error' ? 'error' : 'needs_captcha',
      message: s.browserState === 'needs_login' ? `店铺「${s.name}」需要在浏览器中登录` :
               s.browserState === 'error' ? `店铺「${s.name}」连接异常` :
               `店铺「${s.name}」需要完成验证`,
      timestamp: (s.updatedAt as Date).toISOString(),
      acknowledged: false,
    }));

    const handoffAlerts = handoffs.map((c) => ({
      storeId: c.storeId,
      storeName: c.store?.name || '店铺',
      type: 'needs_human' as const,
      conversationId: c.id,
      message: `有客户对话需要人工处理：${c.title || '点击查看'}`,
      timestamp: (c.updatedAt as Date).toISOString(),
      acknowledged: false,
    }));

    res.json({ data: [...handoffAlerts, ...storeAlerts] });
  } catch {
    res.json({ data: [] });
  }
});

/**
 * POST /api/pdd/alerts/:storeId/ack
 */
router.post('/alerts/:storeId/ack', authMiddleware, requireStoreAccess, async (req, res) => {
  const storeId = param(req, 'storeId');
  // Reset transient alert states back to idle so the alert stays dismissed.
  // 'error' is included so a stale connection-error alert can be cleared too
  // (previously only login/captcha were reset, leaving error alerts stuck).
  // Wrapped in try/catch: Express 4 does NOT forward async-handler rejections to
  // the error middleware, so a Prisma throw (e.g. SQLITE_BUSY) would otherwise
  // hang the request until socket timeout.
  try {
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { browserState: true } });
    if (store && ['needs_login', 'needs_captcha', 'error'].includes(store.browserState)) {
      await prisma.store.update({ where: { id: storeId }, data: { browserState: 'idle' } });
    }
    res.json({ message: '已确认' });
  } catch {
    res.status(500).json({ error: '操作失败，请重试' });
  }
});

/**
 * POST /api/pdd/stores/:storeId/connect
 * Tell companion to start a browser for this store.
 */
router.post('/stores/:storeId/connect', authMiddleware, requireStoreAccess, async (req, res) => {
  const storeId = param(req, 'storeId');
  const storeName = req.body?.storeName || `Store-${storeId}`;

  // Update DB state
  await prisma.store.update({ where: { id: storeId }, data: { browserState: 'connecting' } }).catch(() => {});

  // Get decrypted credentials to pass via WebSocket
  const credentials = await storeService.getCredentials(storeId);

  // Send command to companion (credentials delivered securely via WS, not REST)
  const sent = companionGateway.sendCommand(storeId, {
    type: 'start_store',
    storeName,
    credentials: credentials || undefined,
  });

  if (sent) {
    res.json({ message: '已发送启动指令', storeId });
  } else {
    res.status(503).json({ error: 'Companion 客户端未连接，请确认应用已启动' });
  }
});

/**
 * POST /api/pdd/stores/:storeId/disconnect
 */
router.post('/stores/:storeId/disconnect', authMiddleware, requireStoreAccess, async (req, res) => {
  const storeId = param(req, 'storeId');

  companionGateway.sendCommand(storeId, { type: 'stop_store' });
  await prisma.store.update({ where: { id: storeId }, data: { browserState: 'idle' } }).catch(() => {});

  res.json({ message: '已断开', storeId });
});

/**
 * GET /api/pdd/stores/:storeId/status
 */
router.get('/stores/:storeId/status', authMiddleware, requireStoreAccess, async (req, res) => {
  const storeId = param(req, 'storeId');
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { browserState: true },
  });

  res.json({
    data: {
      state: store?.browserState || 'idle',
      uptime: 0,
      errorMessage: store?.browserState === 'error' ? '连接异常' : undefined,
    },
  });
});

export default router;
