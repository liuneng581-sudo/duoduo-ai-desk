/**
 * CDP test — capture HTTP response bodies
 */
import { chromium } from 'playwright';

const STORE_ID = process.env.TEST_STORE_ID;
if (!STORE_ID) {
  console.error('Set TEST_STORE_ID env var (e.g. store-cmqju...). Never hardcode a real store id.');
  process.exit(1);
}

async function main() {
  const browser = await chromium.launchPersistentContext(`./browser-data/${STORE_ID}`, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const pages = browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');

  // ── Capture response BODIES for chat APIs ──
  cdp.on('Network.responseReceived', async (params) => {
    const url = params.response?.url || '';
    const requestId = params.requestId;
    const chatApis = ['latest_conversations', 'plateau/chat/list', 'orderCsGroupConvList', 'userinfo/realtime'];

    if (chatApis.some(api => url.includes(api))) {
      try {
        const body = await cdp.send('Network.getResponseBody', { requestId });
        const text = body.body || '';
        console.log(`\n📦 ${url.split('?')[0].split('/').slice(-2).join('/')} [${text.length}B]:`);
        console.log(text.slice(0, 2000));
        console.log('───');
      } catch (e: any) {
        console.log(`⚠️ ${url.slice(0,80)}: ${e.message}`);
      }
    }
  });

  // ── WebSocket JSON ──
  cdp.on('Network.webSocketFrameReceived', (params) => {
    const data = params.response?.payloadData || '';
    if (data.length < 10) return;
    try {
      const j = JSON.parse(data);
      if (j.response && j.response !== 'auth') {
        console.log(`\n📩 WS-JSON [${new Date().toLocaleTimeString()}]:`);
        console.log(JSON.stringify(j, null, 2).slice(0, 1500));
        console.log('───');
      }
    } catch {}
  });

  await page.goto('https://mms.pinduoduo.com/chat-merchant/index.html', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(5000);

  // Click first conversation to trigger message loading
  try {
    const conv = await page.$('[class*="conversation"], [class*="chat-item"], [class*="session-item"], [class*="contact"]');
    if (conv) { console.log('🖱 Clicking conversation...'); await conv.click(); await page.waitForTimeout(3000); }
  } catch {}

  console.log('\n⏳ Listening 5 min...\n');
  await new Promise(r => setTimeout(r, 300000));
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
