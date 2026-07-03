/**
 * Companion Client WebSocket Gateway.
 *
 * Accepts authenticated WebSocket connections from the local companion.
 * Requires a shared token (COMPANION_WS_TOKEN env var) on first message.
 */

import { WebSocketServer, WebSocket as WsSocket } from 'ws';
import { Server as HttpServer } from 'http';
import logger from '../../utils/logger';
import { feishuService } from '../feishu';
import prisma from '../../config/database';
import { env } from '../../config/env';
import { encryptJson } from '../../utils/wsCrypto';

interface CompanionSocket extends WsSocket {
  companionId?: string;
  storeIds?: string[];
  isAlive?: boolean;
}

const companions = new Map<string, CompanionSocket>();

// Pending stats round-trips: server sends fetch_store_stats with a requestId,
// companion replies store_stats with the same id. Each entry self-rejects on
// timeout so a dead/slow companion can't leak a hanging Promise.
interface PendingRequest {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  companionId?: string;
  onProgress?: (fetched: number, total: number) => void;
}
const pendingStats = new Map<string, PendingRequest>();
let statsReqSeq = 0;

// Same round-trip mechanism for full-catalog product sync (fetch_all_goods →
// all_goods). Kept as its own map so a slow goods pull and a stats request don't
// collide on ids; both are drained on companion disconnect.
const pendingGoods = new Map<string, PendingRequest>();
let goodsReqSeq = 0;

/**
 * Resolve which companion should receive a command for `storeId`.
 * Prefers a companion that has explicitly registered this store. Falls back to
 * the sole connected companion when no exact match exists — this is safe
 * because the ambiguity the "no broadcast" rule guards against only arises with
 * MULTIPLE companions. With exactly one, there is no wrong target. This also
 * breaks the first-connect chicken-and-egg: a freshly spawned companion
 * registers with an empty storeId list (it doesn't know its store until the
 * first start_store), so the very first command would otherwise never route.
 */
function resolveCompanion(storeId: string): CompanionSocket | null {
  const open: CompanionSocket[] = [];
  for (const [, ws] of companions) {
    if (ws.readyState !== WsSocket.OPEN) continue;
    if (ws.storeIds?.includes(storeId)) return ws; // exact match wins
    open.push(ws);
  }
  if (open.length === 1) return open[0]; // sole companion — unambiguous
  return null;
}

type MessageCallback = (storeId: string, msg: {
  conversationId: string; content: string; msgType: string; msgId: string; context?: string;
  orderHint?: { hasOrder: boolean; orderSns: string[]; goodsIds?: string[]; afterSales?: { hasAfterSales: boolean; statuses: string[] } };
}) => void | Promise<void>;
let onCustomerMessage: MessageCallback | null = null;

export const companionGateway = {
  onMessage(cb: MessageCallback): void {
    onCustomerMessage = cb;
  },

  attach(server: HttpServer): void {
    const wss = new WebSocketServer({
      server,
      path: '/ws',
      // Reject browser-originated cross-site WS connections. The companion
      // (Node ws client) sends no Origin header and authenticates via token;
      // browsers always send Origin, so we only need to vet those.
      verifyClient: (info: { origin?: string }) => {
        const origin = info.origin;
        if (!origin) return true; // companion (non-browser) client
        const allowed = /^https?:\/\/localhost(:\d+)?$/.test(origin) || origin === env.CLIENT_URL;
        if (!allowed) {
          logger.warn(`WS connection rejected: disallowed origin ${origin}`);
          return false;
        }
        return true;
      },
    });

    wss.on('connection', (ws: CompanionSocket) => {
      logger.info('Companion client connected');
      let authed = false;
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });

      ws.on('message', (raw) => {
        let data: { type: string; storeId?: string; token?: string; [key: string]: unknown };
        try { data = JSON.parse(raw.toString()); } catch { return; }

        // Require auth token before any other message
        if (!authed && data.type !== 'auth') {
          logger.warn('Rejected unauthenticated WS message');
          ws.close();
          return;
        }

        switch (data.type) {
          case 'auth': {
            const expected = env.COMPANION_WS_TOKEN;
            if (data.token === expected) {
              authed = true;
              ws.send(JSON.stringify({ type: 'auth_ok' }));
              logger.info('Companion authenticated');
            } else {
              logger.warn('Companion auth rejected');
              ws.close();
            }
            break;
          }

          case 'register': {
            // Idempotent on a socket: a companion re-registers (e.g. on
            // start_store) to update its served storeIds. Reuse the existing
            // companionId so we never leak orphaned map entries for one socket.
            if (!ws.companionId) ws.companionId = `companion-${Date.now()}`;
            ws.storeIds = data.storeIds as string[] || [];
            // Evict any OTHER (older) socket that claims a store this one now
            // serves — a reconnect after a half-open drop registers fresh, and
            // the dead socket must not keep receiving routed commands.
            for (const [id, other] of companions) {
              if (other === ws) continue;
              const overlap = (other.storeIds || []).some((s) => ws.storeIds!.includes(s));
              if (overlap) {
                logger.info(`Evicting stale companion ${id} (store overlap with ${ws.companionId})`);
                companions.delete(id);
                try { other.terminate(); } catch {}
              }
            }
            companions.set(ws.companionId, ws);
            logger.info(`Companion registered: ${ws.companionId}, stores: ${ws.storeIds.join(', ') || 'none'}`);
            ws.send(JSON.stringify({ type: 'registered', companionId: ws.companionId }));
            break;
          }

          case 'customer_message': {
            if (onCustomerMessage && data.storeId) {
              const storeId = data.storeId as string;
              const msg = {
                conversationId: data.conversationId as string || '',
                content: data.content as string || '',
                msgType: data.msgType as string || 'text',
                msgId: data.msgId as string || '',
                context: data.context as string || undefined,
                orderHint: data.orderHint as { hasOrder: boolean; orderSns: string[]; goodsIds?: string[]; afterSales?: { hasAfterSales: boolean; statuses: string[] } } | undefined,
              };
              if (!msg.conversationId || !msg.content) {
                logger.warn('Dropping malformed customer_message');
                break;
              }
              const result = onCustomerMessage(storeId, msg);
              if (result && typeof (result as any).catch === 'function') {
                (result as Promise<void>).catch((err: any) => {
                  logger.error(`customer_message handler error: ${err.message}`);
                });
              }
            }
            break;
          }

          case 'status': {
            logger.info(`Companion status: store=${data.storeId} state=${data.state}`);
            if (data.storeId && data.state) {
              const storeId = data.storeId as string;
              const state = data.state as string;
              prisma.store.update({
                where: { id: storeId },
                data: { browserState: state },
              }).catch((e: any) => logger.error('Failed to update browser state', { storeId, error: e.message }));

              if (state === 'needs_login' || state === 'needs_captcha' || state === 'error') {
                notifyFeishu(storeId, state as 'needs_login' | 'needs_captcha' | 'error').catch(() => {});
              }
            }
            break;
          }

          case 'login_required': {
            logger.warn(`Companion: store ${data.storeId} needs login`);
            if (data.storeId) {
              notifyFeishu(data.storeId as string, 'needs_login').catch(() => {});
            }
            break;
          }

          case 'store_stats': {
            // Response to a fetch_store_stats request — resolve the waiter.
            const reqId = data.requestId as string;
            const pending = reqId ? pendingStats.get(reqId) : undefined;
            if (pending) {
              clearTimeout(pending.timer);
              pendingStats.delete(reqId);
              if (data.error) pending.reject(new Error(String(data.error)));
              else pending.resolve(data.stats ?? null);
            }
            break;
          }

          case 'goods_progress': {
            // Per-page progress for an in-flight fetch_all_goods. Forward to the
            // waiter's progress callback so the server-side task can expose N/M.
            const reqId = data.requestId as string;
            const pending = reqId ? pendingGoods.get(reqId) : undefined;
            if (pending && pending.onProgress) {
              try { pending.onProgress(Number(data.fetched) || 0, Number(data.total) || 0); } catch {}
            }
            break;
          }

          case 'all_goods': {
            // Response to a fetch_all_goods request — resolve with the goods array.
            const reqId = data.requestId as string;
            const pending = reqId ? pendingGoods.get(reqId) : undefined;
            if (pending) {
              clearTimeout(pending.timer);
              pendingGoods.delete(reqId);
              if (data.error) pending.reject(new Error(String(data.error)));
              else pending.resolve(Array.isArray(data.goods) ? data.goods : []);
            }
            break;
          }
        }
      });

      ws.on('close', () => {
        if (ws.companionId) {
          companions.delete(ws.companionId);
          // Fail fast any in-flight stats requests bound to this companion, so the
          // dashboard gets an immediate "offline" instead of waiting 20s to time out.
          companionGateway.rejectPendingForCompanion(ws.companionId);
        }
        logger.info(`Companion disconnected: ${ws.companionId || 'unknown'}`);
        // The companion's browser(s) died with it. Reset any stores it served
        // from active states back to a non-live state so the client/dashboard
        // don't keep showing them "online" forever. Only touch live states —
        // leave needs_login/needs_captcha alerts intact for the user to act on.
        const served = ws.storeIds || [];
        if (served.length > 0) {
          prisma.store.updateMany({
            where: { id: { in: served }, browserState: { in: ['connecting', 'online'] } },
            data: { browserState: 'error' },
          }).then((r) => {
            if (r.count > 0) logger.info(`Reset ${r.count} store(s) to error after companion disconnect`);
          }).catch((e: any) => logger.error('Failed to reset store states on disconnect', { error: e.message }));
        }
      });

      ws.on('error', (err) => {
        logger.error('Companion WS error', { error: err.message });
      });

      ws.send(JSON.stringify({ type: 'welcome', message: '已连接到多多AI客服' }));
    });

    // Heartbeat: a companion that vanished without a clean close (laptop sleep,
    // OOM kill, network half-open) leaves an OPEN socket that silently swallows
    // routed commands — the "假在线" failure. Ping every 30s; a socket that
    // missed the previous pong is terminated, which fires 'close' → store reset.
    const heartbeat = setInterval(() => {
      for (const [, ws] of companions) {
        if (ws.isAlive === false) { try { ws.terminate(); } catch {} continue; }
        ws.isAlive = false;
        try { ws.ping(); } catch {}
      }
    }, 30000);
    wss.on('close', () => clearInterval(heartbeat));

    logger.info('Companion WebSocket gateway ready on /ws');
  },

  sendCommand(storeId: string, command: { type: string; [key: string]: unknown }): boolean {
    // Route to the companion serving this store (exact match), or the sole
    // connected companion as a safe fallback — see resolveCompanion.
    // Encrypt credential payloads so they're not plaintext on the WS channel.
    let outgoing: { type: string; [key: string]: unknown } = command;
    if (command.credentials) {
      const { credentials, ...rest } = command;
      outgoing = { ...rest, credentialsEnc: encryptJson(credentials) };
    }
    const ws = resolveCompanion(storeId);
    if (ws) {
      ws.send(JSON.stringify({ ...outgoing, storeId }));
      return true;
    }
    logger.warn(`No companion available for store ${storeId}`);
    return false;
  },

  sendReply(storeId: string, conversationId: string, content: string): boolean {
    const ws = resolveCompanion(storeId);
    if (ws) {
      ws.send(JSON.stringify({ type: 'send_reply', storeId, conversationId, content }));
      return true;
    }
    logger.warn(`No companion for send_reply to store ${storeId}`);
    return false;
  },

  /**
   * Ask the companion to pull live revenue/order stats for a store from PDD and
   * return them. Round-trips over the WS with a requestId; rejects on timeout so
   * the HTTP handler never hangs when the companion is down or PDD is slow.
   */
  requestStats(storeId: string, timeoutMs = 20000): Promise<any> {
    const ws = resolveCompanion(storeId);
    if (!ws) return Promise.reject(new Error('companion 未连接,无法获取门店数据'));
    const requestId = `stats-${Date.now()}-${++statsReqSeq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingStats.delete(requestId);
        reject(new Error('获取门店数据超时'));
      }, timeoutMs);
      pendingStats.set(requestId, { resolve, reject, timer, companionId: ws.companionId });
      try {
        ws.send(JSON.stringify({ type: 'fetch_store_stats', storeId, requestId }));
      } catch (err: any) {
        // Socket died between resolve and send — clean up immediately instead of
        // leaving a dangling timer/entry for the full timeout window.
        clearTimeout(timer);
        pendingStats.delete(requestId);
        reject(new Error('companion 连接已断开'));
      }
    });
  },

  /**
   * Ask the companion to pull the store's FULL product catalog from PDD and
   * return it. Full sync can be slow (many pages), so the timeout is generous.
   * Rejects on timeout / disconnect so the HTTP handler never hangs.
   */
  /**
   * Ask the companion to pull the store's FULL product catalog from PDD.
   * Full sync of thousands of goods is slow, so instead of one fixed deadline we
   * use an IDLE timeout that resets on every progress message: as long as pages
   * keep arriving the request stays alive; only a genuinely stalled scrape (no
   * progress for `idleMs`) is rejected. onProgress streams 已抓 N/总 M.
   */
  requestAllGoods(
    storeId: string,
    onProgress?: (fetched: number, total: number) => void,
    idleMs = 60000,
  ): Promise<any[]> {
    const ws = resolveCompanion(storeId);
    if (!ws) return Promise.reject(new Error('companion 未连接,无法抓取商品'));
    const requestId = `goods-${Date.now()}-${++goodsReqSeq}`;
    return new Promise((resolve, reject) => {
      const arm = () => setTimeout(() => {
        pendingGoods.delete(requestId);
        reject(new Error('抓取商品超时(长时间无进度)'));
      }, idleMs);
      let timer = arm();
      const entry: PendingRequest = {
        resolve, reject, timer, companionId: ws.companionId,
        onProgress: (fetched, total) => {
          // Reset the idle timer on each page, then bubble progress up.
          clearTimeout(entry.timer);
          entry.timer = arm();
          if (onProgress) onProgress(fetched, total);
        },
      };
      pendingGoods.set(requestId, entry);
      try {
        ws.send(JSON.stringify({ type: 'fetch_all_goods', storeId, requestId }));
      } catch (err: any) {
        clearTimeout(entry.timer);
        pendingGoods.delete(requestId);
        reject(new Error('companion 连接已断开'));
      }
    });
  },

  /** Reject every in-flight stats/goods request bound to a companion that just dropped. */
  rejectPendingForCompanion(companionId: string): void {
    for (const [id, p] of pendingStats) {
      if (p.companionId === companionId) {
        clearTimeout(p.timer);
        pendingStats.delete(id);
        p.reject(new Error('companion 连接已断开'));
      }
    }
    for (const [id, p] of pendingGoods) {
      if (p.companionId === companionId) {
        clearTimeout(p.timer);
        pendingGoods.delete(id);
        p.reject(new Error('companion 连接已断开'));
      }
    }
  },
};

const feishuCooldowns = new Map<string, number>();
setInterval(() => {
  const cutoff = Date.now() - 300000;
  for (const [key, ts] of feishuCooldowns) { if (ts < cutoff) feishuCooldowns.delete(key); }
}, 300000);

async function notifyFeishu(storeId: string, event: 'needs_login' | 'needs_captcha' | 'error') {
  const cooldownKey = `${storeId}:${event}`;
  const lastSent = feishuCooldowns.get(cooldownKey) || 0;
  if (Date.now() - lastSent < 30000) return;
  feishuCooldowns.set(cooldownKey, Date.now());

  try {
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true, userId: true } });
    if (!store) return;
    const rows = await prisma.$queryRawUnsafe(
      'SELECT `value` FROM SystemConfig WHERE userId = ? AND `key` = ? LIMIT 1',
      store.userId, 'feishu_webhook_url',
    ) as Array<{ value: string }>;
    if (rows.length === 0 || !rows[0].value) return;
    const webhookUrl = rows[0].value;

    if (event === 'needs_login') {
      await feishuService.notifyLoginRequired(webhookUrl, store.name, '');
    } else if (event === 'needs_captcha') {
      await feishuService.notifyCaptchaRequired(webhookUrl, store.name, '');
    } else {
      await feishuService.notifyError(webhookUrl, store.name, '浏览器连接异常');
    }
  } catch (e: any) {
    logger.error('Feishu notification failed', { storeId, event, error: e.message });
  }
}
