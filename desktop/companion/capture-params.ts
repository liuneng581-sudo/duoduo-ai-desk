import { chromium } from 'playwright';
const STORE_ID = process.env.TEST_STORE_ID;
if (!STORE_ID) { console.error('Set TEST_STORE_ID env var.'); process.exit(1); }
(async () => {
  const b = await chromium.launchPersistentContext(`./browser-data/${STORE_ID}`, {headless:false,viewport:{width:1280,height:900},args:['--no-sandbox']});
  const p = b.pages()[0] || await b.newPage();
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Network.enable');

  let urls: string[] = [];
  cdp.on('Network.requestWillBeSent', (params: any) => {
    const u = params.request?.url || '';
    if (u.includes('plateau') || u.includes('chat') || u.includes('mms.pinduoduo'))
      urls.push('REQ ' + u.split('?')[0].split('/').slice(-2).join('/') + ' POST=' + (params.request?.postData?.slice(0,300) || 'none'));
  });
  cdp.on('Network.responseReceived', (params: any) => {
    const u = params.response?.url || '';
    if (u.includes('plateau') || u.includes('/chat'))
      urls.push('RESP ' + u.split('?')[0].split('/').slice(-2).join('/') + ' status=' + params.response?.status);
  });

  await p.goto('https://mms.pinduoduo.com/chat-merchant/index.html', {waitUntil:'domcontentloaded',timeout:30000});
  await p.waitForTimeout(5000);

  await p.evaluate(() => {
    const items = document.querySelectorAll('[class*="conversation"],[class*="chat-item"]');
    for (const el of items) if ((el as HTMLElement).offsetParent) { (el as HTMLElement).click(); break; }
  });
  await p.waitForTimeout(5000);

  console.log('Count:', urls.length);
  for (const u of urls) console.log(u);
  await b.close();
})();
