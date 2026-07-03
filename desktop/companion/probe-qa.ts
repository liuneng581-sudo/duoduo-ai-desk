/**
 * Targeted probe (run after capture-qa.ts is stopped — needs exclusive profile):
 *  1. Maps orderCsGroupConvList groupType 0..6 → which 售前/售中/售后 bucket each is.
 *  2. Opens the order-management page and captures ALL XHR/fetch (no keyword
 *     filter) so the real order-list API can't be missed.
 *  3. Re-probes the revenue overview for field names.
 *
 *   TEST_STORE_ID=store-xxxx npx tsx probe-qa.ts
 * Writes probe-qa-<storeId>.json.
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const STORE_ID = process.env.TEST_STORE_ID;
if (!STORE_ID) { console.error('设置 TEST_STORE_ID'); process.exit(1); }

const OUT = path.join(__dirname, `probe-qa-${STORE_ID}.json`);
const report: any = { groupTypes: {}, orderPageXhr: [], revenue: {} };

async function main() {
  const baseDir = process.env.PDD_USER_DATA_DIR || path.join(__dirname, '..', 'server', 'browser-data');
  const profileDir = path.join(baseDir, STORE_ID!);
  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: false, viewport: { width: 1366, height: 900 },
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const page = browser.pages()[0] || (await browser.newPage());

  // Capture ALL XHR/fetch responses (no keyword filter) — only skip static assets.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const reqBodies = new Map<string, string>();
  const seen = new Set<string>();
  cdp.on('Network.requestWillBeSent', (p: any) => {
    reqBodies.set(p.requestId, p.request?.postData || '');
  });
  cdp.on('Network.responseReceived', async (p: any) => {
    const url = p.response?.url || '';
    if (!/mms\.pinduoduo\.com/.test(url)) return;
    if (/\.(png|jpg|jpeg|gif|webp|css|js|woff2?|svg|ico)(\?|$)/.test(url)) return;
    if (url.startsWith('data:')) return;
    const bare = url.split('?')[0];
    const key = bare + '|' + (reqBodies.get(p.requestId)?.slice(0, 40) || '');
    if (seen.has(key)) return; seen.add(key);
    try {
      const body = await cdp.send('Network.getResponseBody', { requestId: p.requestId });
      const text = body.body || '';
      // Only keep JSON-ish responses
      if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) return;
      report.orderPageXhr.push({
        url: bare,
        req: (reqBodies.get(p.requestId) || '').slice(0, 300),
        resp: text.slice(0, 1500),
      });
      fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
      console.log(`📦 ${bare.replace('https://mms.pinduoduo.com','')} [${text.length}B]`);
    } catch {}
  });

  // ── Step 1: map groupType 0..6 on the chat backend ──
  console.log('\n[1/3] 探测 orderCsGroupConvList 的 groupType 0..6 ...');
  await page.goto('https://mms.pinduoduo.com/chat-merchant/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  for (let gt = 0; gt <= 6; gt++) {
    const r = await page.evaluate(async (groupType) => {
      try {
        const res = await fetch('/latitude/mall/orderCsGroupConvList', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupType, pageNum: 0, pageSize: 20 }), credentials: 'include',
        });
        return { status: res.status, body: (await res.text()).slice(0, 1200) };
      } catch (e: any) { return { status: 0, body: e.message }; }
    }, gt);
    report.groupTypes[gt] = r;
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    // Summarize: total + first conv's uid if any
    let summary = `status=${r.status}`;
    try { const j = JSON.parse(r.body); summary += ` total=${j.result?.total ?? '?'}`; } catch {}
    console.log(`  groupType=${gt}: ${summary}`);
    await page.waitForTimeout(700);
  }

  // ── Step 2: open order management page, capture all XHR ──
  console.log('\n[2/3] 打开订单管理页,捕获全部 XHR(15s)...');
  try {
    await page.goto('https://mms.pinduoduo.com/orders/list', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch {
    // fallback common paths
    try { await page.goto('https://mms.pinduoduo.com/order/list', { waitUntil: 'domcontentloaded', timeout: 20000 }); } catch {}
  }
  await page.waitForTimeout(15000);

  // ── Step 3: revenue overview (already known endpoint, capture fresh) ──
  console.log('\n[3/3] 重新拉营收概况字段 ...');
  const rev = await page.evaluate(async () => {
    try {
      const res = await fetch('/sydney/api/mallScore/queryMallScoreOverView', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', credentials: 'include',
      });
      return { status: res.status, body: (await res.text()).slice(0, 2500) };
    } catch (e: any) { return { status: 0, body: e.message }; }
  });
  report.revenue = rev;
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  console.log(`\n完成。报告: ${OUT}`);
  console.log(`订单页捕获 ${report.orderPageXhr.length} 个 XHR`);
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error('probe 出错:', e); process.exit(1); });
