"use strict";
/**
 * 多多AI客服 Companion · 纯 HTTP 方案（已验证）
 *
 * 接收: HTTP 轮询 /plateau/chat/latest_conversations（返回 JSON，字段齐全）
 * 发送: page.evaluate + 同源 fetch /plateau/chat/send_message
 *       anti_content 留空即可（文本消息不需要签名）
 *
 * WebSocket 是二进制 Titan 协议，不解析。HTTP 轮询足以覆盖消息收发。
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const playwright_1 = require("playwright");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const COMPANION_DIR = __dirname;
// Default to 127.0.0.1 (IPv4), not "localhost": the server binds 127.0.0.1 and
// on Windows "localhost" prefers IPv6 ::1 → ECONNREFUSED. main.ts injects this
// same IPv4 URL in the packaged app; this fallback matches for standalone runs.
const SERVER_URL = process.env.SERVER_URL || 'ws://127.0.0.1:3001/ws';
const COMPANION_WS_TOKEN = process.env.COMPANION_WS_TOKEN
    || (process.env.NODE_ENV === 'production' ? '' : 'local-dev-companion-token');
const COMPANION_DATA_DIR = process.env.PDD_USER_DATA_DIR || COMPANION_DIR;
const BROWSER_DATA_DIR = path.join(COMPANION_DATA_DIR, 'browser-data');
const COOKIE_FILE = path.join(COMPANION_DATA_DIR, 'cookies.json');
// When set (packaged app), drive the in-app WebContentsView over CDP instead of
// launching our own Chromium window. The Electron main process opens this view
// and the remote-debugging port; we attach to the page it already created.
const COMPANION_CDP_URL = process.env.COMPANION_CDP_URL || '';
if (!COMPANION_WS_TOKEN) {
    throw new Error('COMPANION_WS_TOKEN is required in production');
}
// Decrypt credential payloads sent over the WS channel (AES-256-GCM, key
// derived from the shared COMPANION_WS_TOKEN — mirrors server utils/wsCrypto).
function decryptCredentials(packed) {
    const parts = packed.split(':');
    if (parts.length !== 3)
        throw new Error('invalid ws crypto format');
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const data = Buffer.from(parts[2], 'hex');
    const key = crypto.createHash('sha256').update(COMPANION_WS_TOKEN).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(dec.toString('utf-8'));
}
fs.mkdirSync(BROWSER_DATA_DIR, { recursive: true });
const MAX_PROCESSED_MSGS = 5000;
const MAX_BROWSER_RECONNECTS = 5;
let serverWs;
let reconnectDelay = 1000;
const sessions = new Map();
function getOrCreateSession(storeId, storeName) {
    let s = sessions.get(storeId);
    if (!s) {
        s = {
            storeId,
            storeName: storeName || storeId,
            cookies: [],
            processedMsgs: new Set(),
            browser: null,
            context: null,
            page: null,
            pollTimer: null,
            polling: false,
            scraping: false,
            starting: false,
            intentionalClose: false,
            lastCredentials: undefined,
            reconnectingBrowser: false,
            browserReconnectFails: 0,
        };
        sessions.set(storeId, s);
    }
    else if (storeName) {
        s.storeName = storeName;
    }
    return s;
}
function log(storeId, msg) { console.log(`[${storeId || 'companion'}] ${msg}`); }
function maskAccount(account) {
    const trimmed = account.trim();
    if (trimmed.length <= 2)
        return '***';
    if (trimmed.length <= 6)
        return `${trimmed.slice(0, 1)}***${trimmed.slice(-1)}`;
    return `${trimmed.slice(0, 3)}****${trimmed.slice(-4)}`;
}
// Mask a buyer uid for logs — show only the last 4 chars to reduce PII exposure.
function maskUid(uid) {
    const s = String(uid ?? '').trim();
    if (!s)
        return '***';
    if (s.length <= 4)
        return `***${s}`;
    return `***${s.slice(-4)}`;
}
function addProcessed(s, msgId) {
    s.processedMsgs.add(msgId);
    if (s.processedMsgs.size > MAX_PROCESSED_MSGS) {
        const toDelete = s.processedMsgs.size - MAX_PROCESSED_MSGS + 1000;
        const entries = [...s.processedMsgs];
        for (let i = 0; i < Math.min(toDelete, entries.length); i++) {
            s.processedMsgs.delete(entries[i]);
        }
    }
}
// In embedded (CDP) mode, locate the WebContentsView page that hosts THIS
// store's PDD session among all contexts/pages exposed over CDP. The main
// process tags each view with window.__DD_STORE_ID__, so we match on that for
// exact attribution (URL alone can't disambiguate multiple views on the same
// PDD origin). Falls back to domain match only when a single store is running.
async function findPddPage(browser, storeId) {
    const allPages = [];
    for (const context of browser.contexts()) {
        for (const p of context.pages())
            allPages.push(p);
    }
    // 1) Exact store match via injected tag — the only safe option with many views.
    //    Pre-filter by URL (cheap, sync) before the cross-process evaluate, and cap
    //    each evaluate at 2s so one hung view can't stall the whole lookup.
    for (const p of allPages) {
        try {
            const u = (p.url() || '');
            if (u && !u.includes('pinduoduo.com') && !u.includes('yangkeduo.com'))
                continue;
            const tag = await withTimeout(p.evaluate(() => window.__DD_STORE_ID__), 2000, 'findPddPage evaluate').catch(() => null);
            if (tag && tag === storeId)
                return p;
        }
        catch { }
    }
    // 2) If only one store is live, a PDD-domain page is unambiguous (tag may not
    //    be injected yet on a just-created view). Do NOT fall back to "any page" —
    //    that risked grabbing the wrong page (e.g. about:blank) and mis-routing.
    if (sessions.size <= 1) {
        for (const p of allPages) {
            try {
                const u = p.url() || '';
                if (u.includes('pinduoduo.com') || u.includes('yangkeduo.com'))
                    return p;
            }
            catch { }
        }
    }
    return null;
}
// Detach/close a store's browser. Embedded mode only drops the CDP connection
// (the Electron main process owns the WebContentsView lifecycle); standalone
// mode closes the context/page it launched.
async function closeBrowser(s) {
    if (s.pollTimer) {
        clearInterval(s.pollTimer);
        s.pollTimer = null;
    }
    s.page = null;
    if (COMPANION_CDP_URL) {
        if (s.browser) {
            try {
                await s.browser.close();
            }
            catch { } // closes the CDP connection only
            s.browser = null;
        }
        s.context = null;
        return;
    }
    if (s.browser) {
        try {
            await s.browser.close();
        }
        catch { }
        s.browser = null;
    }
    if (s.context) {
        try {
            await s.context.close();
        }
        catch { }
        s.context = null;
    }
}
// Re-launch a store's browser from the persisted session after an ACCIDENTAL
// close (user closed the window / page died). Throttled and capped per-store so
// a launch that immediately dies can't spin into a tight crash-relaunch loop.
function scheduleBrowserRecovery(s, reason) {
    if (s.intentionalClose)
        return;
    if (s.reconnectingBrowser)
        return;
    if (s.starting)
        return;
    if (!s.storeId)
        return;
    s.reconnectingBrowser = true;
    if (s.browserReconnectFails >= MAX_BROWSER_RECONNECTS) {
        log(s.storeId, `❌ Browser recovery gave up after ${MAX_BROWSER_RECONNECTS} attempts (${reason})`);
        notify(s.storeId, 'error', { error: '浏览器多次自动恢复失败，请手动重新连接' });
        s.reconnectingBrowser = false;
        // Don't die permanently: schedule ONE long-delayed retry (5 min) that resets
        // the budget, so a transient burst of failures eventually self-heals without
        // requiring the user to manually reconnect. Guarded against stopped stores.
        setTimeout(() => {
            if (s.intentionalClose || !sessions.has(s.storeId))
                return;
            log(s.storeId, '🔁 Long-delay recovery retry — resetting failure budget');
            s.browserReconnectFails = 0;
            scheduleBrowserRecovery(s, 'long-delay retry after giveup');
        }, 5 * 60 * 1000);
        return;
    }
    const attempt = s.browserReconnectFails + 1;
    log(s.storeId, `🔁 Browser closed unexpectedly (${reason}) — auto-recovering in 2s (attempt ${attempt}/${MAX_BROWSER_RECONNECTS})`);
    setTimeout(async () => {
        s.reconnectingBrowser = false;
        // Re-check on wake: the user may have stopped this store during the 2s
        // window (stop_store sets intentionalClose + removes it from sessions).
        // Without this, a stopped store would be resurrected and go back online.
        if (s.intentionalClose || !sessions.has(s.storeId)) {
            log(s.storeId, '↩️ Recovery aborted — store was stopped');
            return;
        }
        s.browserReconnectFails++;
        try {
            await handleStart(s.storeId, s.storeName, s.lastCredentials);
        }
        catch (e) {
            log(s.storeId, `❌ Browser recovery attempt failed: ${e?.message || e}`);
        }
    }, 2000);
}
// Move the browser window off-screen so it runs in the background (standalone
// mode only). In embedded mode the Electron main process owns view placement.
async function hideBrowserWindow(s, page) {
    if (COMPANION_CDP_URL)
        return;
    try {
        const session = await s.context.newCDPSession(page);
        const { windowId } = await session.send('Browser.getWindowForTarget');
        try {
            await session.send('Browser.setWindowBounds', {
                windowId,
                bounds: { left: -32000, top: -32000, width: 1280, height: 900 },
            });
            log(s.storeId, '🙈 Browser window moved off-screen (background mode)');
        }
        catch {
            await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
            log(s.storeId, '🙈 Browser window minimized (off-screen unsupported)');
        }
    }
    catch (e) {
        log(s.storeId, `⚠️ Could not hide browser window (continuing): ${e?.message || e}`);
    }
}
// ============================================
// Server Connection
// ============================================
function connectServer() {
    serverWs = new ws_1.default(SERVER_URL);
    serverWs.on('open', () => {
        console.log('[companion] Connected to server');
        reconnectDelay = 1000;
        serverWs.send(JSON.stringify({ type: 'auth', token: COMPANION_WS_TOKEN }));
    });
    serverWs.on('message', async (raw) => {
        let data;
        try {
            data = JSON.parse(raw.toString());
        }
        catch {
            return;
        }
        if (data.type === 'auth_ok') {
            // Register every store we're currently serving (empty on fresh start).
            sendToServer({ type: 'register', storeIds: [...sessions.keys()] });
            return;
        }
        if (data.type === 'start_store') {
            const storeId = data.storeId;
            const storeName = data.storeName;
            if (!storeId)
                return;
            // Re-register with ALL served stores (incl. this new one) so the gateway
            // can route subsequent commands/replies by exact match.
            getOrCreateSession(storeId, storeName);
            sendToServer({ type: 'register', storeIds: [...sessions.keys()] });
            // Credentials are encrypted over the WS channel; decrypt here. Fall back
            // to plaintext only for backward compat with an older server build.
            let credentials = data.credentials;
            if (!credentials && data.credentialsEnc) {
                try {
                    credentials = decryptCredentials(data.credentialsEnc);
                }
                catch (e) {
                    log(storeId, 'Failed to decrypt credentials: ' + (e?.message || e));
                }
            }
            // Never let one store's start failure escape and crash the whole
            // companion (which would take down ALL stores). handleStart has its own
            // internal handling, but a stray throw (e.g. page.goto timeout) must be
            // contained here too.
            try {
                await handleStart(storeId, storeName, credentials);
            }
            catch (e) {
                log(storeId, `❌ handleStart failed: ${e?.message || e}`);
                const s = sessions.get(storeId);
                if (s) {
                    s.starting = false;
                    notify(storeId, 'error', { error: '启动失败，请重试' });
                }
            }
            return;
        }
        if (data.type === 'stop_store') {
            // Stop ONLY this store — other stores keep running. (Single-store builds
            // used to process.exit here; with many stores that would kill them all.)
            const storeId = data.storeId;
            const s = storeId ? sessions.get(storeId) : undefined;
            if (!s)
                return;
            log(storeId, 'Stop');
            s.intentionalClose = true;
            await closeBrowser(s);
            sessions.delete(storeId);
            sendToServer({ type: 'register', storeIds: [...sessions.keys()] });
            return;
        }
        if (data.type === 'send_reply') {
            // sendCommand on the server always appends storeId to outgoing messages.
            const storeId = data.storeId;
            const s = storeId ? sessions.get(storeId) : (sessions.size === 1 ? [...sessions.values()][0] : undefined);
            if (!s) {
                console.log('[companion] send_reply for unknown store', storeId);
                return;
            }
            await sendReply(s, data.conversationId, data.content);
            return;
        }
        if (data.type === 'fetch_store_stats') {
            const storeId = data.storeId;
            const requestId = data.requestId;
            const s = storeId ? sessions.get(storeId) : (sessions.size === 1 ? [...sessions.values()][0] : undefined);
            if (!s) {
                sendToServer({ type: 'store_stats', storeId, requestId, error: '店铺未运行' });
                return;
            }
            try {
                const stats = await fetchStoreStats(s);
                sendToServer({ type: 'store_stats', storeId, requestId, stats });
            }
            catch (e) {
                sendToServer({ type: 'store_stats', storeId, requestId, error: e.message || '获取数据失败' });
            }
            return;
        }
        if (data.type === 'fetch_all_goods') {
            const storeId = data.storeId;
            const requestId = data.requestId;
            const s = storeId ? sessions.get(storeId) : (sessions.size === 1 ? [...sessions.values()][0] : undefined);
            if (!s) {
                sendToServer({ type: 'all_goods', storeId, requestId, error: '店铺未运行' });
                return;
            }
            // Pause the 5s message-poll loop while scraping: hitting PDD with both the
            // poll AND rapid goodsList paging is the main "操作过于频繁" trigger. The poll
            // loop checks s.scraping at the top of each tick and skips while true.
            s.scraping = true;
            try {
                // Report per-page progress so the server can expose 已抓 N/总 M to the UI.
                const goods = await fetchAllGoods(s, (fetched, total) => {
                    sendToServer({ type: 'goods_progress', storeId, requestId, fetched, total });
                });
                sendToServer({ type: 'all_goods', storeId, requestId, goods });
            }
            catch (e) {
                sendToServer({ type: 'all_goods', storeId, requestId, error: e.message || '抓取商品失败' });
            }
            finally {
                // 抓取过程导航到了商品管理页;抓完导航回客服页,让消息轮询继续正常工作。
                try {
                    if (s.page && !s.page.isClosed()) {
                        await s.page.goto('https://mms.pinduoduo.com/chat-merchant/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { });
                    }
                }
                catch { }
                s.scraping = false;
            }
            return;
        }
    });
    serverWs.on('close', () => {
        console.log(`[companion] Disconnected — reconnecting in ${reconnectDelay / 1000}s`);
        setTimeout(connectServer, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 60000);
    });
    serverWs.on('error', (err) => {
        console.log(`[companion] WS error: ${err.message}`);
    });
    // Heartbeat: ping every 30s AND verify the server answers. Without checking
    // pong, a half-open connection (server gone, no FIN) only recovers on slow TCP
    // timeout — the companion keeps "sending" into the void. Track pong; if a full
    // interval passes with no pong, terminate so the close handler reconnects.
    let awaitingPong = false;
    serverWs.on('pong', () => { awaitingPong = false; });
    const heartbeat = setInterval(() => {
        if (serverWs.readyState !== ws_1.default.OPEN)
            return;
        if (awaitingPong) {
            console.log('[companion] No pong from server — terminating to force reconnect');
            try {
                serverWs.terminate();
            }
            catch { }
            return;
        }
        awaitingPong = true;
        try {
            serverWs.ping();
        }
        catch { }
    }, 30000);
    serverWs.on('close', () => clearInterval(heartbeat));
}
function notify(storeId, status, extra) {
    sendToServer({ type: 'status', storeId, state: status, ...extra });
}
function sendToServer(payload) {
    if (!serverWs || serverWs.readyState !== ws_1.default.OPEN)
        return false;
    serverWs.send(JSON.stringify(payload));
    return true;
}
// ============================================
// Cookie
// ============================================
function saveCookies(s) {
    // Per-store cookie file so multiple stores don't clobber each other.
    const file = path.join(COMPANION_DATA_DIR, `cookies-${s.storeId}.json`);
    fs.writeFileSync(file, JSON.stringify({ storeId: s.storeId, cookies: s.cookies, savedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
}
// ============================================
// HTTP Send Reply（页面内同源 fetch，已验证可行）
// ============================================
// Race a promise against a timeout. page.evaluate() has NO built-in timeout and
// is not bound by the page's default timeout — if the renderer hangs, evaluate
// never settles, leaving the poll loop's s.polling mutex stuck true forever
// (the store then silently stops receiving messages). Wrapping every evaluate in
// the poll loop guarantees it always settles so polling can reset or recover.
function withTimeout(p, ms, label) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
        p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
}
// Pull live revenue + order-count stats for a store from PDD, in the logged-in
// page context (so anti_content signing and cookies are handled by PDD's own JS).
// Endpoints confirmed by capture: see companion/QA-API-FINDINGS.md.
async function fetchStoreStats(s) {
    const page = s.page;
    if (!page || page.isClosed())
        throw new Error('页面未就绪');
    return await page.evaluate(async () => {
        const post = async (url, body) => {
            const res = await fetch(url, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body), credentials: 'include',
            });
            const text = await res.text();
            let json;
            try {
                json = JSON.parse(text);
            }
            catch {
                throw new Error(`接口返回非JSON (${url.split('/').pop()}): ${text.slice(0, 80)}`);
            }
            // PDD risk-control / rate-limit (40002) and explicit failures come back as
            // success:false or error_code — surface them instead of silently zeroing.
            if (json?.success === false || (json?.error_code && json.error_code !== 0)) {
                throw new Error(json.error_msg || json.errorMsg || `接口失败 ${json.error_code || ''}`);
            }
            return json;
        };
        // Revenue overview: today GMV / order count / AUP + refund data
        const overview = await post('/sydney/api/mallScore/queryMallScoreOverView', {});
        // Order counts by status (subType 15 → unshipped/waitPay/shipped/refunding)
        const statusStat = await post('/mars/app/order/statisticWithType', { subType: 15, source: 'MMS' });
        const deal = overview?.result?.dealDataVO || {};
        const service = overview?.result?.serviceDataVO || {};
        const st = statusStat?.result || {};
        return {
            // today's confirmed deal — strings from PDD (empty when no sales)
            gmvToday: deal.cfmOrdrAmt1d ?? '',
            orderCountToday: deal.cfmOrdrCnt1d ?? '',
            avgPriceToday: deal.cfmOrdrAup1d ?? '',
            refundAmountToday: service.sucRfOrdrAmt1d ?? '',
            refundCountToday: service.sucRfOrdrCnt1d ?? '',
            // live order-status breakdown
            waitPay: st.waitPay ?? 0,
            unshipped: st.unshipped ?? 0,
            shipped: st.shipped ?? 0,
            refunding: st.refunding ?? 0,
            fetchedAt: Math.floor(Date.now() / 1000),
        };
    });
}
// Pull the store's FULL product catalog from PDD's merchant backend, in the
// logged-in page context (PDD's own JS signs anti_content for the fetch).
// Endpoint confirmed by capture (2026-06-22):
//   POST /vodka/v2/mms/query/display/mall/goodsList
//   body {page, size, out_goods_sn_gray_flag, pre_sale_type, shipment_time_type}
//   → {success, result:{total, goods_list:[{id, goods_name, sku_group_price[], quantity, cat_name, goods_desc, is_onsale}]}}
// Paginates page=1.. until we've collected `total` items (or a page comes back
// empty / risk-controlled / we hit a hard page cap). Returns compact rows the
// server maps onto Product.
async function fetchAllGoods(s, onProgress) {
    const page = s.page;
    if (!page || page.isClosed())
        throw new Error('页面未就绪');
    // 商品列表接口需要 anti-content 风控头(动态签名,页面 JS 生成,无法自造)。
    // 策略:导航到商品管理页,拦截页面「自己」发的 goodsList 请求,取它的 anti-content
    // 复用(实测:同一签名可复用翻页/改 size,但 ~11 页/1100 条后失效)。失效表现为
    // success=true 却返回空 goods / total=0 的"软限流",此时重新导航刷新签名再继续。
    // 用户要求"可以慢但必须准" → 失效就刷新签名重试当前页,绝不跳过,确保不漏。
    // 全量去重按 externalId,无论重试多少次,一个商品只存一份。
    const PAGE_SIZE = 100;
    const MAX_PAGES = 500; // 100×500=5万上限;total 提前终止
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const isRateLimited = (msg) => /频繁|风控|限流|40001|40002|too many|frequent/i.test(msg || '');
    // 刷新 anti-content:重新导航商品页,拦截页面自己发的 goodsList 请求取新签名。
    const refreshAnti = async () => {
        let anti = null;
        const onReq = (req) => {
            try {
                const u = req.url() || '';
                if (u.includes('goodsList') && !anti) {
                    const h = req.headers();
                    if (h['anti-content'])
                        anti = h['anti-content'];
                }
            }
            catch { }
        };
        page.on('request', onReq);
        try {
            await page.goto('https://mms.pinduoduo.com/goods/goods_list', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { });
            for (let i = 0; i < 24 && !anti; i++)
                await sleep(500);
        }
        finally {
            page.off('request', onReq);
        }
        return anti;
    };
    let antiContent = await refreshAnti();
    if (!antiContent) {
        throw new Error('未能获取商品列表签名(anti-content),请确认已在「店铺」页登录并打开过商品管理页');
    }
    log(s.storeId, '✓ 已获取 anti-content,开始全量抓取');
    // ── 翻页抓取(页面内 fetch,带 anti-content)──
    const fetchPage = (pageNo, size, anti) => withTimeout(page.evaluate(async ({ pageNo, size, anti }) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
            const res = await fetch('/vodka/v2/mms/query/display/mall/goodsList', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'anti-content': anti },
                body: JSON.stringify({
                    page: pageNo, size,
                    is_onsale: 1, sold_out: 0,
                    out_goods_sn_gray_flag: true, pre_sale_type: 4, shipment_time_type: 3,
                }),
                credentials: 'include',
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const text = await res.text();
            let json;
            try {
                json = JSON.parse(text);
            }
            catch {
                return { error: `接口返回非JSON: ${text.slice(0, 80)}` };
            }
            if (json?.success === false || (json?.error_code && json.error_code !== 0)) {
                return { error: json.error_msg || json.errorMsg || `接口受限 ${json.error_code || ''}` };
            }
            const list = json?.result?.goods_list || [];
            const goods = list.map((g) => {
                // 价格单位是「分」,统一 ÷100 转元。优先团购价 sku_group_price[0],回退 market_price。
                const rawGroup = Array.isArray(g.sku_group_price) && g.sku_group_price.length > 0
                    ? Number(g.sku_group_price[0]) : null;
                const rawFen = (rawGroup != null && Number.isFinite(rawGroup)) ? rawGroup
                    : (Number.isFinite(Number(g.market_price)) ? Number(g.market_price) : 0);
                const price = Math.round((rawFen / 100) * 100) / 100;
                // SKU(规格名/价格/库存)汇总进描述。实测 sku.spec 是字符串(如"黑色 XL"),价格是分。
                let skuText = '';
                if (Array.isArray(g.sku_list) && g.sku_list.length > 0) {
                    const lines = g.sku_list.slice(0, 60).map((sk) => {
                        const spec = typeof sk.spec === 'string' ? sk.spec
                            : (Array.isArray(sk.spec) ? sk.spec.map((x) => x?.value ?? '').filter(Boolean).join('/') : '');
                        const pFen = sk.groupPrice ?? sk.normalPrice;
                        const priceStr = (pFen != null && Number.isFinite(Number(pFen))) ? `¥${Math.round(Number(pFen)) / 100}` : '';
                        const qty = Number.isFinite(Number(sk.skuQuantity)) ? `库存${Math.max(0, Math.floor(Number(sk.skuQuantity)))}` : '';
                        return `${(spec || '默认').trim()} ${priceStr} ${qty}`.trim();
                    }).filter(Boolean);
                    if (lines.length > 0)
                        skuText = '规格:' + lines.join(';');
                }
                const baseDesc = g.goods_desc ? String(g.goods_desc) : '';
                const fullDesc = [baseDesc, skuText].filter(Boolean).join(' | ').slice(0, 2000);
                return {
                    externalId: g.id != null ? String(g.id) : null,
                    name: String(g.goods_name || '').slice(0, 200),
                    price,
                    stock: Number.isFinite(Number(g.quantity)) ? Math.max(0, Math.floor(Number(g.quantity))) : 0,
                    category: g.cat_name ? String(g.cat_name).slice(0, 50) : null,
                    description: fullDesc || null,
                    isOnsale: g.is_onsale !== false,
                };
            });
            return { total: json?.result?.total ?? 0, goods };
        }
        catch (e) {
            clearTimeout(timeout);
            return { error: e?.name === 'AbortError' ? '请求超时' : (e?.message || '请求失败') };
        }
    }, { pageNo, size, anti }), 25000, 'goodsList evaluate');
    // 按 externalId 去重累加。一个商品(goods_id)无论被抓几次,只存一份 → 永不重复。
    const byId = new Map();
    let total = Infinity;
    for (let pageNo = 1; pageNo <= MAX_PAGES && byId.size < total; pageNo++) {
        let pageResult = null;
        let ok = false;
        // 每页最多 5 轮:硬限流/空页(软限流=签名失效)→ 先短退避试一次,仍不行就刷新签名。
        for (let attempt = 1; attempt <= 5; attempt++) {
            pageResult = await fetchPage(pageNo, PAGE_SIZE, antiContent);
            const hardRL = pageResult.error && isRateLimited(pageResult.error);
            // 软限流:success 但还没抓完却返回空 goods / total=0 → 多半是签名失效。
            const softLimited = !pageResult.error
                && ((pageResult.goods || []).length === 0 || !pageResult.total)
                && total !== Infinity && byId.size < total;
            if (hardRL || softLimited) {
                if (attempt === 1) {
                    await sleep(2500); // 先短等一次(可能只是瞬时限流)
                    continue;
                }
                // 仍不行:刷新 anti-content 签名再试这一页
                log(s.storeId, `🔄 第${pageNo}页签名疑似失效,刷新签名重试 (${attempt}/5)`);
                const fresh = await refreshAnti();
                if (fresh)
                    antiContent = fresh;
                await sleep(1000);
                continue;
            }
            if (pageResult.error)
                break; // 非限流的硬错误:不重试
            ok = true;
            break;
        }
        if (!ok) {
            // 重试用尽仍失败:有数据就返回已抓部分,一条没有才抛错。
            log(s.storeId, `⚠️ 第${pageNo}页最终失败: ${pageResult?.error || '签名刷新后仍空'}`);
            if (byId.size === 0) {
                throw new Error(pageResult?.error && isRateLimited(pageResult.error)
                    ? '拼多多限流较严,请稍等 1-2 分钟后重试'
                    : (pageResult?.error || '抓取失败,请重试'));
            }
            break;
        }
        if (pageResult.total > 0 && total === Infinity)
            total = pageResult.total; // total 只锁第一次有效值
        const goods = pageResult.goods || [];
        for (const g of goods) {
            if (g.externalId)
                byId.set(g.externalId, g);
        }
        log(s.storeId, `📦 第${pageNo}页 +${goods.length} (累计 ${byId.size}/${total})`);
        if (onProgress) {
            try {
                onProgress(byId.size, total);
            }
            catch { }
        }
        if (byId.size < total)
            await sleep(1200); // 页间节流
    }
    return [...byId.values()];
}
async function sendReply(s, uid, content) {
    const page = s.page;
    if (!page || page.isClosed()) {
        log(s.storeId, '❌ No active page for send');
        return false;
    }
    // Defense-in-depth: never send model reasoning or Markdown symbols to a
    // customer, even if an upstream path failed to strip them. The server also
    // sanitizes at generation. Keep the text, drop <think> and formatting markup.
    content = content
        .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
        .replace(/<think(?:ing)?>[\s\S]*$/i, '')
        .replace(/<\/think(?:ing)?>/gi, '')
        .replace(/(\*\*\*|\*\*|\*|___|__|~~)(.+?)\1/g, '$2')
        .replace(/^\s{0,3}#{1,6}\s*/gm, '')
        .replace(/^\s{0,3}>+\s?/gm, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[*`]/g, '')
        .trim();
    if (!content) {
        log(s.storeId, '⚠️ Reply empty after sanitizing, not sending');
        return false;
    }
    try {
        const result = await page.evaluate(async ({ uid, content }) => {
            const ts = Math.floor(Date.now() / 1000);
            const body = {
                data: {
                    cmd: 'send_message', anti_content: '',
                    request_id: Date.now().toString() + Math.random().toString(36).slice(2, 5),
                    message: {
                        to: { role: 'user', uid },
                        from: { role: 'mall_cs' },
                        ts, content,
                        msg_id: null, type: 0, is_aut: 1, manual_reply: 0,
                        status: 'read', is_read: 1, hash: '',
                    },
                    random: Math.random().toString(36).slice(2),
                },
                client: 'WEB', anti_content: '',
            };
            const res = await fetch('/plateau/chat/send_message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                credentials: 'include',
            });
            return { status: res.status, body: await res.text() };
        }, { uid, content });
        if (result.status === 200) {
            const json = JSON.parse(result.body);
            if (json?.success && json.result?.result === 'ok') {
                log(s.storeId, `📤 Reply sent to ${maskUid(uid)}: "${content.slice(0, 20)}"`);
                return true;
            }
        }
        log(s.storeId, `⚠️ Send failed: ${result.body.slice(0, 150)}`);
        // Surface PDD risk-control/rate-limit on the send path too, so a store that
        // can't deliver replies doesn't just silently fail while showing online.
        try {
            const j = JSON.parse(result.body);
            if (j?.error_code === 40002 || j?.success === false) {
                notify(s.storeId, 'error', { error: `回复发送受限: ${j.error_msg || j.errorMsg || j.error_code || ''}` });
            }
        }
        catch { }
        return false;
    }
    catch (e) {
        log(s.storeId, `❌ Send error: ${e.message}`);
        return false;
    }
}
// ============================================
// Main: attach/launch browser, poll for messages (per store)
// ============================================
async function handleStart(storeId, storeName, credentials) {
    const s = getOrCreateSession(storeId, storeName);
    // Per-store mutex: prevent double start_store from launching two browsers.
    if (s.starting) {
        log(storeId, '⚠️ Already starting, ignoring duplicate');
        return;
    }
    s.starting = true;
    // A fresh start (or recovery) means any pending close was handled.
    s.intentionalClose = false;
    if (credentials)
        s.lastCredentials = credentials;
    // Re-attaching this store: drop any stale browser/timer for it (but NOT other
    // stores — that single-store "close previous" behavior is gone).
    if (s.page || s.browser) {
        await closeBrowser(s);
    }
    log(storeId, `Starting: ${storeName}${credentials ? ` (auto-login: ${maskAccount(credentials.account)})` : ''}`);
    if (s.pollTimer) {
        clearInterval(s.pollTimer);
        s.pollTimer = null;
    }
    const userDataDir = path.join(BROWSER_DATA_DIR, `store-${storeId}`);
    let browser;
    let page = null;
    if (COMPANION_CDP_URL) {
        // ── Embedded mode: attach to this store's WebContentsView over CDP ──
        try {
            browser = await playwright_1.chromium.connectOverCDP(COMPANION_CDP_URL);
            s.browser = browser;
            s.context = browser.contexts()[0] || null;
            // The renderer creates the view and navigates it to PDD across an IPC hop,
            // which may lag this start_store. Poll for this store's page up to ~10s.
            for (let i = 0; i < 10 && !page; i++) {
                page = await findPddPage(browser, storeId);
                if (page)
                    break;
                await new Promise((r) => setTimeout(r, 1000));
            }
            if (!page) {
                log(storeId, '❌ No PDD page found over CDP — is the store view created?');
                notify(storeId, 'error', { error: '浏览器视图未就绪，请重试连接' });
                s.starting = false;
                return;
            }
            s.page = page;
        }
        catch (e) {
            log(storeId, `❌ CDP connect failed: ${e?.message || e}`);
            notify(storeId, 'error', { error: '浏览器连接失败' });
            s.starting = false;
            return;
        }
    }
    else {
        // ── Standalone mode: launch our own Chromium (dev / no embedded view) ──
        try {
            s.context = await playwright_1.chromium.launchPersistentContext(userDataDir, {
                headless: false,
                viewport: { width: 1280, height: 900 },
                args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
            });
            browser = s.context;
            s.browser = browser;
        }
        catch {
            log(storeId, '❌ Browser launch failed');
            notify(storeId, 'error', { error: '浏览器启动失败' });
            s.starting = false;
            return;
        }
        const pages = browser.pages();
        page = pages[0] || await browser.newPage();
        s.page = page;
    }
    if (!page) {
        s.starting = false;
        return;
    }
    s.starting = false;
    // Recover this store if its browser/page closes unexpectedly.
    browser.on('close', () => {
        log(storeId, 'Browser closed');
        s.page = null;
        s.browser = null;
        s.context = null;
        if (s.intentionalClose) {
            notify(storeId, 'idle');
        }
        else {
            scheduleBrowserRecovery(s, 'window closed');
        }
    });
    // Anti-detection (standalone; embedded views are pre-injected by main).
    if (!COMPANION_CDP_URL) {
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });
    }
    // Navigate to home
    await page.goto('https://mms.pinduoduo.com/home/', {
        waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await page.waitForTimeout(2000);
    // Login check
    let url = page.url();
    if (url.includes('login') || url.includes('passport')) {
        log(storeId, '🔐 Login required');
        let autoLoginAttempted = false;
        if (credentials && credentials.account && credentials.password) {
            autoLoginAttempted = true;
            log(storeId, `🔑 Auto-login with account: ${maskAccount(credentials.account)}`);
            const creds = credentials;
            try {
                const loginResult = await page.evaluate(async (cred) => {
                    // Switch to account/password tab (PDD login page has tabs)
                    const tabs = document.querySelectorAll('[class*="tab"], [class*="login-type"], [class*="login-mode"] span, [class*="login-mode"] div');
                    for (const tab of tabs) {
                        const text = tab.innerText || '';
                        if (text.includes('账号') || text.includes('密码')) {
                            tab.click();
                            await new Promise(r => setTimeout(r, 500));
                            break;
                        }
                    }
                    // Find and fill account input
                    const inputs = document.querySelectorAll('input');
                    let accountInput = null;
                    let passwordInput = null;
                    for (const input of inputs) {
                        const placeholder = input.placeholder || '';
                        const type = input.type;
                        if (placeholder.includes('手机') || placeholder.includes('账号') || placeholder.includes('用户名') || type === 'text' || type === 'tel') {
                            if (!accountInput)
                                accountInput = input;
                        }
                        if (type === 'password' || placeholder.includes('密码')) {
                            passwordInput = input;
                        }
                    }
                    // If no placeholder match, use first text + password pair
                    if (!accountInput) {
                        for (const input of inputs) {
                            if (input.type === 'text' || input.type === 'tel') {
                                accountInput = input;
                                break;
                            }
                        }
                    }
                    if (!accountInput || !passwordInput) {
                        return { success: false, error: 'inputs_not_found', inputCount: inputs.length };
                    }
                    // Fill via native setter
                    const textSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                    if (textSetter) {
                        textSetter.call(accountInput, cred.account);
                        textSetter.call(passwordInput, cred.password);
                    }
                    else {
                        accountInput.value = cred.account;
                        passwordInput.value = cred.password;
                    }
                    accountInput.dispatchEvent(new Event('input', { bubbles: true }));
                    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                    // Find and click login button
                    const buttons = document.querySelectorAll('button');
                    for (const btn of buttons) {
                        const btnText = btn.textContent || '';
                        if ((btnText.includes('登录') || btnText.includes('登 录')) && btn.offsetParent !== null) {
                            btn.click();
                            return { success: true, buttonText: btnText };
                        }
                    }
                    return { success: false, error: 'no_login_button', buttonCount: buttons.length };
                }, creds);
                log(storeId, `🔑 Auto-login result: ${JSON.stringify(loginResult)}`);
                if (loginResult.success) {
                    log(storeId, '✅ Auto-login submitted, waiting for redirect...');
                    const loginStart = Date.now();
                    while (Date.now() - loginStart < 30000) {
                        await new Promise(r => setTimeout(r, 2000));
                        try {
                            if (page.isClosed())
                                break;
                            const u = page.url();
                            if (!u.includes('login') && !u.includes('passport') && u.includes('mms')) {
                                log(storeId, '✅ Auto-login successful');
                                break;
                            }
                            const pageText = await page.evaluate(() => document.body.innerText).catch(() => '');
                            if (pageText.includes('密码错误') || pageText.includes('账号不存在') || pageText.includes('账号或密码')) {
                                log(storeId, `❌ Login rejected: ${pageText.slice(0, 100)}`);
                                notify(storeId, 'error', { error: '登录失败：账号或密码错误' });
                                break;
                            }
                            if (pageText.includes('验证') || pageText.includes('滑块') || pageText.includes('拼图')) {
                                log(storeId, '⚠️ Captcha detected!');
                                notify(storeId, 'needs_captcha');
                                break;
                            }
                        }
                        catch {
                            break;
                        }
                    }
                }
                else {
                    log(storeId, `⚠️ Auto-login failed: ${loginResult.error}`);
                }
            }
            catch (e) {
                log(storeId, `❌ Auto-login crashed: ${e.message}`);
            }
        }
        // Notify server that login is needed (only after auto-login failed or captcha)
        if (!autoLoginAttempted || !credentials) {
            notify(storeId, 'needs_login');
        }
        log(storeId, autoLoginAttempted ? '⏳ Waiting for login/captcha resolution...' : '⏳ Waiting for manual login...');
        const start = Date.now();
        let loggedIn = false;
        while (Date.now() - start < 300000) {
            await new Promise(r => setTimeout(r, 3000));
            try {
                if (page.isClosed()) {
                    log(storeId, 'Page closed during login');
                    if (!s.intentionalClose)
                        scheduleBrowserRecovery(s, 'page closed during login');
                    return;
                }
                const u = page.url();
                if (!u.includes('login') && !u.includes('passport') && u.includes('mms')) {
                    loggedIn = true;
                    break;
                }
                if (Math.floor((Date.now() - start) / 10000) % 3 === 0) {
                    const hasCaptcha = await page.evaluate(() => {
                        const text = document.body.innerText;
                        return text.includes('验证') || text.includes('滑块') || text.includes('拼图');
                    }).catch(() => false);
                    if (hasCaptcha) {
                        notify(storeId, 'needs_captcha');
                        log(storeId, '⚠️ Captcha detected — manual intervention needed');
                    }
                }
            }
            catch {
                break;
            }
        }
        if (!loggedIn) {
            log(storeId, '❌ Login timeout — still on login page');
            notify(storeId, 'error', { error: '登录超时，请检查账号密码或手动登录' });
            return;
        }
    }
    // Extract cookies. Read from the page's BrowserContext, which has .cookies()
    // in BOTH modes — over CDP `browser` is a Browser (no .cookies()), only the
    // context has it; the standalone persistent context also exposes it. (Using
    // browser.cookies() crashed the companion in embedded mode.)
    try {
        const ctx = page.context();
        s.cookies = await ctx.cookies();
        saveCookies(s);
        log(storeId, `✅ ${s.cookies.length} cookies saved`);
    }
    catch (e) {
        log(storeId, `⚠️ Cookie save skipped: ${e?.message || e}`);
    }
    // Navigate to chat page
    await page.goto('https://mms.pinduoduo.com/chat-merchant/index.html', {
        waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await page.waitForTimeout(3000);
    log(storeId, `Chat page: ${page.url()} | ${await page.title()}`);
    await hideBrowserWindow(s, page);
    // The store may have been stopped during login/navigation (stop_store removes
    // it from sessions + sets intentionalClose). If so, don't go online or attach
    // a poll loop — that would be an orphan timer on a deleted session.
    if (s.intentionalClose || !sessions.has(storeId)) {
        log(storeId, '↩️ Start aborted — store was stopped during init');
        await closeBrowser(s);
        return;
    }
    notify(storeId, 'online');
    log(storeId, '✅ Online');
    s.browserReconnectFails = 0; // reached online — reset the recovery budget
    // ── HTTP Poll Loop (per store) ──
    let iteration = 0;
    s.pollTimer = setInterval(async () => {
        if (s.polling)
            return;
        if (s.scraping)
            return; // 全量抓商品期间暂停消息轮询,避免和翻页一起触发 PDD 风控
        s.polling = true;
        iteration++;
        try {
            if (page.isClosed()) {
                log(storeId, 'Page closed');
                if (s.pollTimer) {
                    clearInterval(s.pollTimer);
                    s.pollTimer = null;
                }
                s.polling = false;
                if (!s.intentionalClose)
                    scheduleBrowserRecovery(s, 'page closed');
                return;
            }
            const rawResult = await withTimeout(page.evaluate(async () => {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 25000);
                try {
                    const res = await fetch('/plateau/chat/latest_conversations', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ data: { offset: 0, size: 50 }, client: 1, anti_content: '' }),
                        credentials: 'include',
                        signal: controller.signal,
                    });
                    clearTimeout(timeout);
                    return { status: res.status, text: await res.text() };
                }
                catch (e) {
                    clearTimeout(timeout);
                    return { status: 0, text: '', error: e.name === 'AbortError' ? 'timeout' : e.message };
                }
            }), 35000, 'latest_conversations evaluate');
            if (iteration <= 2) {
                log(storeId, `Poll #${iteration} status=${rawResult.status} len=${rawResult.text.length}`);
            }
            let convs = [];
            try {
                const d = JSON.parse(rawResult.text);
                if (d?.success && d.result?.conversations) {
                    convs = d.result.conversations;
                }
                else if (Array.isArray(d?.result?.data)) {
                    convs = d.result.data;
                }
                else if (d?.error_code === 40002 || d?.success === false) {
                    // PDD risk-control / rate-limit. Don't treat as "0 conversations"
                    // (which silently hides that we're being throttled) — surface it and
                    // let the next tick back off naturally (5s interval already paced).
                    log(storeId, `⚠️ PDD 风控/限流: ${d.error_msg || d.errorMsg || d.error_code || 'unknown'}`);
                    notify(storeId, 'error', { error: `PDD 接口受限: ${d.error_msg || d.error_code || ''}` });
                }
            }
            catch { }
            if (iteration % 12 === 1 || convs.length > 0) {
                log(storeId, `Poll #${iteration}: ${convs.length} convs`);
            }
            for (const conv of convs) {
                const isUser = conv.from?.role === 'user';
                if (!isUser)
                    continue;
                const uid = conv.from?.uid;
                const msgId = conv.msg_id || conv.client_msg_id;
                const content = conv.content || '';
                if (!msgId || s.processedMsgs.has(msgId) || !content)
                    continue;
                const nick = conv.user_info?.nickname || maskUid(uid);
                log(storeId, `📩 [${nick}] "${content.slice(0, 20)}"`);
                // Fetch this customer's recent messages: builds AI context AND detects
                // which products/orders this customer is about. Two signals link the
                // conversation to the knowledge base + orders:
                //   1. goods_id in product links the customer pastes / order cards
                //   2. order_sn in order-card messages
                // Both are matched server-side: goods_id → Product.externalId (KB),
                // order_sn → order status. Request shape per QA-API-FINDINGS.md.
                let context = '';
                let orderHint = { hasOrder: false, orderSns: [], goodsIds: [] };
                try {
                    const result = await withTimeout(page.evaluate(async (uid) => {
                        // Inner fetches get their own abort so a slow/hung PDD endpoint
                        // (rate-limit, 风控 holding the connection) can't leave evaluate
                        // pending forever — mirrors latest_conversations' 25s abort.
                        const signalAfter = (ms) => {
                            const c = new AbortController();
                            setTimeout(() => c.abort(), ms);
                            return c.signal;
                        };
                        const res = await fetch('/plateau/chat/list', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                data: {
                                    cmd: 'list',
                                    request_id: Date.now(),
                                    list: { with: { role: 'user', id: uid }, start_msg_id: null, start_index: 0, size: 20 },
                                    notUpdateUnreplyTs: true,
                                    anti_content: '',
                                },
                            }),
                            credentials: 'include',
                            signal: signalAfter(15000),
                        });
                        const d = await res.json();
                        const msgs = d?.result?.messages || [];
                        const text = msgs
                            .filter((m) => m.type === 0)
                            .slice(-10)
                            .map((m) => `${m.from?.role === 'user' ? '客户' : '客服'}: ${m.content}`)
                            .join('\n');
                        // Scan each message (whole object) for order numbers and goods ids.
                        // order_sn looks like 260621-561197913602010; goods_id is a long int
                        // that appears in pasted product links and order cards.
                        const sns = new Set();
                        const gids = new Set();
                        for (const m of msgs) {
                            const blob = JSON.stringify(m);
                            (blob.match(/\b\d{6}-\d{12,}\b/g) || []).forEach((s) => sns.add(s));
                            (blob.match(/goods_id[=":\s]+(\d{6,})/g) || []).forEach((g) => {
                                const id = g.match(/(\d{6,})/);
                                if (id)
                                    gids.add(id[1]);
                            });
                            if (m.order_sn)
                                sns.add(String(m.order_sn));
                        }
                        // After-sales status for this customer's orders. Same page context →
                        // PDD signs anti_content for us. Returns orderSn2AfterSalesListMap:
                        // present + non-empty = there's an active/closed refund/return on it.
                        const afterSales = { hasAfterSales: false, statuses: [] };
                        if (sns.size > 0) {
                            try {
                                const asRes = await fetch('/mercury/chat/afterSales/queryList', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ orderSns: [...sns], anti_content: '' }),
                                    credentials: 'include',
                                    signal: signalAfter(15000),
                                });
                                const asJson = await asRes.json();
                                const map = asJson?.result?.orderSn2AfterSalesListMap || {};
                                for (const sn of Object.keys(map)) {
                                    const list = map[sn] || [];
                                    if (Array.isArray(list) && list.length > 0) {
                                        afterSales.hasAfterSales = true;
                                        for (const item of list) {
                                            // Real PDD fields (verified by capture): afterSalesTitle is the
                                            // full description ("未发货退款，退款成功"), afterSalesStatusSimpleTitle
                                            // is the short status ("售后已完结"). Prefer the full title.
                                            const s = item.afterSalesTitle || item.afterSalesStatusSimpleTitle
                                                || item.subTitleTip || item.afterSalesStatusDesc;
                                            if (s)
                                                afterSales.statuses.push(String(s));
                                        }
                                    }
                                }
                            }
                            catch { }
                        }
                        return { text, orderSns: [...sns], goodsIds: [...gids], afterSales };
                    }, uid), 25000, 'chat/list+afterSales evaluate');
                    context = result.text;
                    orderHint = {
                        hasOrder: result.orderSns.length > 0,
                        orderSns: result.orderSns,
                        goodsIds: result.goodsIds,
                        afterSales: result.afterSales,
                    };
                }
                catch (e) {
                    // Timeout or fetch failure: proceed with empty context/orderHint so the
                    // message still reaches the AI — never let this block the poll loop.
                    log(storeId, `orderHint fetch skipped: ${e?.message || e}`);
                }
                const sent = sendToServer({
                    type: 'customer_message', storeId,
                    conversationId: uid, content, context,
                    msgType: 'text', msgId,
                    orderHint,
                });
                if (sent) {
                    addProcessed(s, msgId);
                }
            }
        }
        catch (e) {
            log(storeId, `Poll error (iter ${iteration}): ${e.message}`);
            // An evaluate timeout means the renderer likely hung — a reset of s.polling
            // alone won't help (next tick re-hangs). Recover the browser instead.
            if (/evaluate timeout/.test(e?.message || '') && !s.intentionalClose) {
                if (s.pollTimer) {
                    clearInterval(s.pollTimer);
                    s.pollTimer = null;
                }
                scheduleBrowserRecovery(s, 'evaluate timeout (renderer hung)');
            }
        }
        finally {
            s.polling = false;
        }
    }, 5000);
}
// ============================================
// Startup
// ============================================
console.log('🏪 多多AI客服 Companion · HTTP Mode (multi-store)');
console.log(`   Server: ${SERVER_URL}`);
// Process-level backstop: a stray async error in one store's automation must
// NOT crash the whole companion (which serves all stores). Log and keep running
// — main.ts would otherwise restart us and every store would need re-init.
process.on('unhandledRejection', (reason) => {
    console.log(`[companion] Unhandled rejection: ${reason?.message || reason}`);
});
process.on('uncaughtException', (err) => {
    console.log(`[companion] Uncaught exception: ${err?.message || err}`);
});
// Clean up every store's browser when the app terminates this process. main.ts
// kills the companion with .kill() (SIGTERM) on app quit; without these handlers
// any standalone-launched Chromium would be orphaned.
let shuttingDown = false;
async function gracefulExit(signal) {
    if (shuttingDown)
        return;
    shuttingDown = true;
    console.log(`[companion] Received ${signal}, closing all stores…`);
    for (const s of sessions.values()) {
        s.intentionalClose = true;
        try {
            await closeBrowser(s);
        }
        catch { }
    }
    process.exit(0);
}
process.on('SIGTERM', () => { gracefulExit('SIGTERM'); });
process.on('SIGINT', () => { gracefulExit('SIGINT'); });
connectServer();
