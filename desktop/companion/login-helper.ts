/**
 * One-shot login helper — opens PDD merchant login in the store's persistent
 * profile so the user can sign in. Once login succeeds (URL leaves the login
 * page and the home/chat shell loads), the cookies are persisted into the
 * profile dir and the script exits. Then capture-qa.ts can run against a valid
 * session.
 *
 *   TEST_STORE_ID=store-xxxx npx tsx login-helper.ts
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const STORE_ID = process.env.TEST_STORE_ID;
if (!STORE_ID) {
  console.error('请设置 TEST_STORE_ID,例如: TEST_STORE_ID=store-xxxx npx tsx login-helper.ts');
  process.exit(1);
}

async function main() {
  const baseDir = process.env.PDD_USER_DATA_DIR
    || path.join(__dirname, '..', 'server', 'browser-data');
  const profileDir = path.join(baseDir, STORE_ID!);
  fs.mkdirSync(profileDir, { recursive: true });

  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1366, height: 900 },
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const page = browser.pages()[0] || (await browser.newPage());
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  console.log('\n=== PDD 登录助手 ===');
  console.log(`登录态目录: ${profileDir}`);
  console.log('请在弹出的窗口里登录店铺(扫码或账号密码)。');
  console.log('登录成功后我会自动检测并保存,然后这个窗口会关闭。\n');

  await page.goto('https://mms.pinduoduo.com/home/', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Poll for login completion: home/chat shell reachable and not bounced to login.
  const MAX_MINUTES = Number(process.env.LOGIN_MINUTES || 10);
  let ticks = 0;
  const maxTicks = MAX_MINUTES * 30; // 2s per tick
  while (ticks < maxTicks) {
    await page.waitForTimeout(2000);
    ticks++;
    let u = '';
    try { u = page.url(); } catch {}
    const loggedIn = u && !u.includes('login') && !u.includes('passport') && u.includes('pinduoduo.com');
    if (loggedIn) {
      // Confirm a logged-in API works (avoids a stale shell counting as login).
      const ok = await page.evaluate(async () => {
        try {
          const r = await fetch('/plateau/chat/latest_conversations', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { offset: 0, size: 1 }, client: 1, anti_content: '' }),
            credentials: 'include',
          });
          const t = await r.text();
          return r.status === 200 && t.includes('success');
        } catch { return false; }
      }).catch(() => false);
      if (ok) {
        console.log('✅ 登录成功,登录态已保存。正在关闭窗口...');
        await page.waitForTimeout(1500);
        try { await browser.close(); } catch {}
        process.exit(0);
      }
    }
    if (ticks % 15 === 0) console.log(`[等待登录] ${Math.round(ticks * 2 / 60)} 分钟... 当前页: ${u.slice(0, 60)}`);
  }
  console.log(`⏱ ${MAX_MINUTES} 分钟内未完成登录,退出。`);
  try { await browser.close(); } catch {}
  process.exit(1);
}

main().catch((e) => { console.error('登录助手出错:', e); process.exit(1); });
