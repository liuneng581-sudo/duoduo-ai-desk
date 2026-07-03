/**
 * 商品列表抓包器 — discover the real PDD merchant-backend API behind the
 * 商品管理 / 商品列表 page, so we can implement "一键抓取全部商品".
 *
 * It reuses the SAME logged-in persistent profile the companion uses
 * (browser-data/<storeId>), captures every XHR/fetch response body whose URL
 * looks product-related, and writes everything to a JSON file so nothing is
 * lost to scrollback. Matching is intentionally broad (we don't yet know the
 * endpoint name) — better to over-capture than miss it.
 *
 * Usage (from companion/ dir, after the store has logged in at least once):
 *   TEST_STORE_ID=store-xxxx npx tsx capture-products.ts
 * Then in the opened window, click through the LEFT MENU:
 *   商品管理 → 商品列表（在售/全部）→ 翻第 2 页 → 点开一个商品详情
 * Each click fires the underlying API; they get captured + printed live.
 * Press Ctrl+C when done (or it auto-exits after CAPTURE_MINUTES, default 15).
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const STORE_ID = process.env.TEST_STORE_ID;
if (!STORE_ID) {
  console.error('请设置 TEST_STORE_ID 环境变量,例如: TEST_STORE_ID=store-xxxx npx tsx capture-products.ts');
  process.exit(1);
}

// URL fragments worth capturing. We don't know the exact商品列表 endpoint, so cast
// a wide net: anything with goods/product/item/sku/mall-good/价格 in the path.
// Matching is a plain case-insensitive substring test against the request URL.
const CANDIDATE_PATTERNS: Record<string, string[]> = {
  商品列表: [
    'goods/list', 'goodsList', 'queryGoodsList', 'mallGoods', 'goods/query',
    'goods_list', 'getGoodsList', 'goods/search', 'searchGoods', 'goodsManage',
    'product/list', 'productList', 'queryProductList', 'item/list', 'itemList',
    'goods/page', 'pageGoods', 'onSaleGoods', 'goodsBasic', 'goods/basic',
    'sku/list', 'skuList', 'goods/detail', 'goodsDetail', 'queryGoodsDetail',
    'mall/goods', 'volantis', 'p'+'mhms/goods', 'goods', // bare 'goods' last = catch-all
  ],
};

const OUT_FILE = path.join(__dirname, `products-capture-${STORE_ID}.json`);

type Capture = {
  group: string;
  url: string;            // without query string
  fullUrl: string;
  method: string;
  status: number;
  requestBody: string;    // first 1200 chars
  responseBody: string;   // first 8000 chars (product lists can be large)
  ts: string;
};

const captures: Capture[] = [];
const seenKeys = new Set<string>();

function classify(url: string): string | null {
  const low = url.toLowerCase();
  for (const [group, frags] of Object.entries(CANDIDATE_PATTERNS)) {
    if (frags.some((f) => low.includes(f.toLowerCase()))) return group;
  }
  return null;
}

function flush() {
  fs.writeFileSync(OUT_FILE, JSON.stringify({ storeId: STORE_ID, captures }, null, 2));
}

async function main() {
  // Login state lives in the persistent profile dir. In dev it's server/browser-data;
  // in the packaged app it's PDD_USER_DATA_DIR (userData/companion/browser-data).
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
      // Heuristic: a real product-list response mentions price/stock/goods fields.
      // Flag the promising ones so they're easy to spot in the printout.
      const looksProductish = /goods_name|goodsName|goods_id|goodsId|"sku|skuList|quantity|groupPrice|price|在售|库存/.test(text);
      const cap: Capture = {
        group,
        url: bareUrl,
        fullUrl: url.slice(0, 300),
        method: params.response?.requestHeaders?.[':method'] || 'POST',
        status: params.response?.status || 0,
        requestBody: (reqBodies.get(params.requestId) || '').slice(0, 1200),
        responseBody: text.slice(0, 8000),
        ts: new Date().toISOString(),
      };
      captures.push(cap);
      flush();
      console.log(`\n📦 [${group}]${looksProductish ? ' ⭐疑似商品列表' : ''} ${bareUrl}  status=${cap.status}  resp=${text.length}B`);
      console.log('   req:', cap.requestBody.slice(0, 240) || '(none)');
      console.log('   resp:', text.slice(0, 500).replace(/\s+/g, ' '));
    } catch (e: any) {
      console.log(`⚠️ [${group}] ${bareUrl}: ${e.message}`);
    }
  });

  console.log('\n=== 商品列表抓包器已启动 ===');
  console.log(`登录态: ${profileDir}`);
  console.log(`报告将写入: ${OUT_FILE}`);
  console.log('\n请在弹出的窗口里手动操作(左侧菜单):');
  console.log('  1. 点「商品管理」→「商品列表」(在售 / 全部)');
  console.log('  2. 翻到第 2 页(触发分页接口,确认翻页参数)');
  console.log('  3. 随便点开一个商品看详情(触发详情接口)');
  console.log('带 ⭐疑似商品列表 标记的就是我们要找的接口。抓完按 Ctrl+C。\n');

  // Detect login state up front so we don't silently capture nothing.
  await page.goto('https://mms.pinduoduo.com/home/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  const url0 = page.url();
  if (url0.includes('login') || url0.includes('passport')) {
    console.log('🔐 当前未登录(跳到了登录页)。请在弹出的窗口里登录该店铺,登录后再点商品管理。');
  } else {
    console.log('✅ 登录态有效。请点击左侧「商品管理 → 商品列表」。');
    // Best-effort: try to navigate straight to the goods management route. PDD's
    // exact path varies by version; if it 404s the user just clicks the menu.
    try {
      await page.goto('https://mms.pinduoduo.com/goods/goods_list', {
        waitUntil: 'domcontentloaded', timeout: 15000,
      });
      await page.waitForTimeout(3000);
      console.log(`已尝试自动打开商品列表页,当前 URL: ${page.url()}`);
    } catch {
      console.log('自动打开商品列表页失败(路径可能不同),请手动点左侧菜单。');
    }
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
