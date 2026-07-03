/**
 * Test: send a reply and capture the protocol
 */
import { chromium } from 'playwright';

const STORE_ID = process.env.TEST_STORE_ID;
if (!STORE_ID) {
  console.error('Set TEST_STORE_ID env var (e.g. store-cmqju...). Never hardcode a real store id.');
  process.exit(1);
}

async function main() {
  const browser = await chromium.launchPersistentContext(`./browser-data/${STORE_ID}`, {
    headless: false, viewport: { width: 1280, height: 900 }, args: ['--no-sandbox'],
  });
  const page = browser.pages()[0] || await browser.newPage();

  await page.goto('https://mms.pinduoduo.com/chat-merchant/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // CDP after page load
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');

  const captured: string[] = [];

  // HTTP requests — capture FULL body for send_message
  cdp.on('Network.requestWillBeSent', (params: any) => {
    const url = params.request?.url || '';
    if (url.includes('send_message')) {
      captured.push(`\n📤 SEND_MSG:\n${params.request?.postData?.slice(0, 3000) || '-'}\n`);
    } else if (url.includes('plateau') || url.includes('chat')) {
      captured.push(`HTTP ${params.request?.method} ${url.split('?')[0]} data=${params.request?.postData?.slice(0, 200) || '-'}`);
    }
  });

  // WebSocket sent
  cdp.on('Network.webSocketFrameSent', (params: any) => {
    const d = params.response?.payloadData || '';
    if (d.length > 5) captured.push(`WS-SENT: ${d.slice(0, 500)}`);
  });

  // Capture response bodies
  cdp.on('Network.responseReceived', async (params: any) => {
    const url = params.response?.url || '';
    if (url.includes('send_message')) {
      try {
        const body = await cdp.send('Network.getResponseBody', { requestId: params.requestId });
        captured.push(`\n📥 SEND_MSG RESPONSE:\n${body.body?.slice(0, 1000) || '-'}\n`);
      } catch {}
    }
  });

  // Do everything via JS in the page
  const result = await page.evaluate(() => {
    // Click first conversation
    const convs = document.querySelectorAll('[class*="conversation"], [class*="chat-item"], [class*="contact-item"], [class*="session"]');
    let clicked = false;
    for (const el of convs) {
      if ((el as HTMLElement).offsetParent !== null) {
        (el as HTMLElement).click();
        clicked = true;
        break;
      }
    }
    if (!clicked) return 'no visible conversation';

    // Wait a bit for chat panel to open (handled by caller)
    return 'clicked';
  });
  console.log('Conv click:', result);
  await page.waitForTimeout(2000);

  // ── Send via the page's own message dispatch (bypasses anti_content) ──
  const result2 = await page.evaluate(() => {
    const ta = document.querySelector('textarea');
    if (!ta) return 'no textarea';

    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    nativeSetter.call(ta, '您好，已收到您的消息~');
    ta.dispatchEvent(new Event('input', { bubbles: true }));

    // Fire the React change event
    const changeEvent = new Event('change', { bubbles: true });
    ta.dispatchEvent(changeEvent);

    // Find and click send button through React fiber
    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      if (b.textContent?.includes('发送') && (b as HTMLElement).offsetParent !== null) {
        b.click();
        return 'clicked send button';
      }
    }
    return 'no send button found';
  });
  console.log('Send:', result2);
  await page.waitForTimeout(3000);

  console.log('\n=== Captured traffic ===');
  for (const c of captured) console.log(c);
  if (captured.length === 0) console.log('Nothing captured');

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
