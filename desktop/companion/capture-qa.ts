/**
 * Q&A research capturer — discover the real PDD merchant-backend APIs behind:
 *   (a) 售前/售中/售后 conversation grouping + the customer↔order linkage (uid)
 *   (b) store revenue / order count (data dashboard) + the order list
 *
 * It attaches to the REAL logged-in session by reusing the same persistent
 * profile the companion uses (browser-data/<storeId>), captures every XHR/fetch
 * response body whose URL matches a candidate pattern, and writes everything to
 * a JSON file so nothing is lost to terminal scrollback.
 *
 * Usage (from companion/ dir, after the store has logged in at least once):
 *   TEST_STORE_ID=store-xxxx npx tsx capture-qa.ts
 * Then in the opened window, click through:
 *   客服对话(开几个会话) → 订单管理/订单列表 → 数据中心/经营概况
 * Press Ctrl+C when done; the JSON report is flushed on each capture.
 */
import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const STORE_ID = process.env.TEST_STORE_ID;
if (!STORE_ID) {
  console.error('请设置 TEST_STORE_ID 环境变量,例如: TEST_STORE_ID=store-xxxx npx tsx capture-qa.ts');
  process.exit(1);
}

// URL fragments worth capturing. Grouped only for readability in the report;
// matching is a plain substring test against the request URL.
const CANDIDATE_PATTERNS: Record<string, string[]> = {
  会话_售前中后: [
    'orderCsGroupConvList', 'latest_conversations', 'plateau/chat/list',
    'conversation', 'convList', 'userinfo/realtime', 'session',
  ],
  订单: [
    'order/list', 'orderList', 'queryOrderList', 'order/query', 'orderManage',
    'mms_order', 'getOrderList', 'order/search', 'sceneOrder',
  ],
  营收_数据中心: [
    'dataCenter', 'data_center', 'mallDashboard', 'businessAnalysis', 'overview',
    'queryMallScore', 'realtime/query', 'statistics', 'mallStat', 'gmv', 'income',
    'tradeData', 'operation/report',
  ],
};

const OUT_FILE = path.join(__dirname, `qa-capture-${STORE_ID}.json`);

type Capture = {
  group: string;
  url: string;            // without query string
  fullUrl: string;
  method: string;
  status: number;
  requestBody: string;    // first 800 chars
  responseBody: string;   // first 4000 chars
  ts: string;
};

const captures: Capture[] = [];
const seenKeys = new Set<string>();

function classify(url: string): string | null {
  for (const [group, frags] of Object.entries(CANDIDATE_PATTERNS)) {
    if (frags.some((f) => url.includes(f))) return group;
  }
  return null;
}

function flush() {
  fs.writeFileSync(OUT_FILE, JSON.stringify({ storeId: STORE_ID, captures }, null, 2));
}

async function main() {
  // Login state lives in the persistent profile dir. In dev it's server/browser-data;
  // in the packaged app it's PDD_USER_DATA_DIR (userData/companion/browser-data).
  // Override with PDD_USER_DATA_DIR if your profile is elsewhere.
  const baseDir = process.env.PDD_USER_DATA_DIR
    || path.join(__dirname, '..', 'server', 'browser-data');
  const profileDir = path.join(baseDir, STORE_ID!);
  if (!fs.existsSync(profileDir)) {
    console.error(`找不到登录态目录: ${profileDir}`);
    console.error('请先用 companion 正常启动并登录该店铺一次,生成登录态后再抓包。');
    console.error('或用 PDD_USER_DATA_DIR=<目录> 指定登录态所在目录。');
    process.exit(1);
  }

  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1366, height: 900 },
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const page = browser.pages()[0] || (await browser.newPage());

  // Track request bodies so we can pair them with responses (request bodies are
  // only available on the requestWillBeSent side via CDP).
  const reqBodies = new Map<string, string>();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');

  cdp.on('Network.requestWillBeSent', (params: any) => {
    const url = params.request?.url || '';
    if (classify(url)) {
      reqBodies.set(params.requestId, params.request?.postData || '');
    }
  });

  cdp.on('Network.responseReceived', async (params: any) => {
    const url = params.response?.url || '';
    const group = classify(url);
    if (!group) return;

    const bareUrl = url.split('?')[0];
    const key = bareUrl + '|' + (reqBodies.get(params.requestId)?.slice(0, 60) || '');
    if (seenKeys.has(key)) return; // dedupe identical endpoint+body
    seenKeys.add(key);

    try {
      const body = await cdp.send('Network.getResponseBody', { requestId: params.requestId });
      const text = body.body || '';
      const cap: Capture = {
        group,
        url: bareUrl,
        fullUrl: url.slice(0, 300),
        method: params.response?.requestHeaders?.[':method'] || 'POST',
        status: params.response?.status || 0,
        requestBody: (reqBodies.get(params.requestId) || '').slice(0, 800),
        responseBody: text.slice(0, 4000),
        ts: new Date().toISOString(),
      };
      captures.push(cap);
      flush();
      console.log(`\n📦 [${group}] ${bareUrl}  status=${cap.status}  resp=${text.length}B`);
      console.log('   req:', cap.requestBody.slice(0, 200) || '(none)');
      console.log('   resp:', text.slice(0, 400).replace(/\s+/g, ' '));
    } catch (e: any) {
      // Some responses (redirects, no body) can't be fetched — record the hit anyway.
      console.log(`⚠️ [${group}] ${bareUrl}: ${e.message}`);
    }
  });

  console.log('\n=== Q&A 抓包器已启动 ===');
  console.log(`登录态: ${profileDir}`);
  console.log(`报告将写入: ${OUT_FILE}`);
  console.log('\n自动导航: 首页 → 客服对话(自动捕获会话列表 + 客户 uid)');
  console.log('需要你手动点的(URL 不固定): 订单管理/订单列表、数据中心/经营概况');
  console.log('抓到的接口会实时打印 + 写入 JSON。\n');

  // Detect login state up front so we don't silently capture nothing.
  await page.goto('https://mms.pinduoduo.com/home/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  const url0 = page.url();
  if (url0.includes('login') || url0.includes('passport')) {
    console.log('🔐 当前未登录(跳到了登录页)。请在弹出的窗口里登录该店铺,登录后我会继续自动抓包。');
  } else {
    console.log('✅ 登录态有效,开始自动导航。');
  }

  // Auto-navigate to the chat backend — this reliably fires latest_conversations
  // (and friends), giving us the conversation list + customer uids without clicks.
  try {
    await page.goto('https://mms.pinduoduo.com/chat-merchant/index.html', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await page.waitForTimeout(4000);
    // Click the first conversation if present, to trigger message/order-context APIs.
    await page.evaluate(() => {
      const sel = '[class*="conversation"],[class*="chat-item"],[class*="session-item"],[class*="contact"]';
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el && el.offsetParent) el.click();
    }).catch(() => {});
    await page.waitForTimeout(3000);
    console.log(`\n已自动导航完成。当前捕获 ${captures.length} 个接口。`);
    console.log('请现在手动点开「订单列表」和「数据中心/经营概况」,我会继续捕获。\n');
  } catch (e: any) {
    console.log('自动导航到客服对话失败(可能未登录):', e.message);
  }

  // Periodic heartbeat so the background runner can see progress.
  const hb = setInterval(() => {
    console.log(`[心跳] 已捕获 ${captures.length} 个接口 (${new Date().toLocaleTimeString()})`);
  }, 30000);

  // Backstop auto-exit so the process never hangs forever when run unattended.
  const MAX_MINUTES = Number(process.env.CAPTURE_MINUTES || 15);
  const backstop = setTimeout(async () => {
    clearInterval(hb);
    console.log(`\n\n⏱ 到达 ${MAX_MINUTES} 分钟上限,自动退出。共捕获 ${captures.length} 个接口:\n  ${OUT_FILE}\n`);
    try { await browser.close(); } catch {}
    process.exit(0);
  }, MAX_MINUTES * 60 * 1000);

  // Keep alive until Ctrl+C or backstop
  process.on('SIGINT', async () => {
    clearInterval(hb);
    clearTimeout(backstop);
    console.log(`\n\n已捕获 ${captures.length} 个接口,报告已保存到:\n  ${OUT_FILE}\n`);
    try { await browser.close(); } catch {}
    process.exit(0);
  });

  // Idle until backstop/SIGINT fires.
  await new Promise(() => {});
}

main().catch((e) => { console.error('抓包器出错:', e); process.exit(1); });
