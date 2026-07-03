/**
 * 🔬 拼多多消息闭环验证脚本
 *
 * 用途：用真实账号验证消息收发全链路，输出结构化日志供分析
 *
 * 运行:
 *   cd companion
 *   npx tsx diagnostic.ts
 *
 * 前置条件:
 *   1. 曾用 Playwright 登录过拼多多商家后台（browser-data 目录有有效 session）
 *   2. 店铺有真实客户消息（或准备一个测试号发消息）
 *
 * 输出: diagnostic-output.json（结构化）+ 控制台实时日志
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BROWSER_DATA_DIR = path.join(__dirname, 'browser-data');
const OUTPUT_FILE = path.join(__dirname, 'diagnostic-output.json');

// 从 browser-data 自动检测可用的 store session
function findStoreDirs(): string[] {
  if (!fs.existsSync(BROWSER_DATA_DIR)) return [];
  return fs.readdirSync(BROWSER_DATA_DIR)
    .filter(d => d.startsWith('store-'))
    .map(d => path.join(BROWSER_DATA_DIR, d));
}

interface DiagnosticLog {
  phase: string;
  timestamp: string;
  data: any;
}

interface CapturedUserMessage {
  uid: string;
  content: string;
  msgId?: string;
  raw: any;
}

const logs: DiagnosticLog[] = [];
function record(phase: string, data: any) {
  const entry = { phase, timestamp: new Date().toISOString(), data };
  logs.push(entry);
  console.log(`\n📋 [${phase}] ${JSON.stringify(data).slice(0, 500)}`);
}

function asUserMessage(raw: any): CapturedUserMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw.message && !Array.isArray(raw.message) ? raw.message : raw;
  const from = msg.from || raw.from || {};
  const role = from.role || msg.from_role || raw.from_role;
  const uid = from.uid || msg.uid || raw.uid;
  const content = msg.content || msg.text || raw.content || raw.text;
  const msgId = msg.msg_id || msg.msgId || msg.id || raw.msg_id || raw.msgId || raw.id;
  if (role === 'user' && uid && content) return { uid: String(uid), content: String(content), msgId, raw };
  return null;
}

function extractUserMessages(payload: string): CapturedUserMessage[] {
  let root: any;
  try {
    root = JSON.parse(payload);
  } catch {
    // Binary frame (Titan protobuf) — try to extract readable strings for analysis
    try {
      const buf = Buffer.from(payload, 'base64');
      const text = buf.toString('utf-8').replace(/[^\x20-\x7E一-鿿]+/g, ' ');
      if (text.trim().length > 10) {
        return [{ uid: '?', content: `[BINARY DECODE]: ${text.slice(0, 200)}`, raw: { _binaryLen: buf.length, _text: text.slice(0, 200) } }];
      }
    } catch {}
    return [];
  }

  const candidates: any[] = [root];
  if (root.message) candidates.push(root.message);
  if (Array.isArray(root.message)) candidates.push(...root.message);
  if (Array.isArray(root.messages)) candidates.push(...root.messages);
  if (Array.isArray(root.data)) candidates.push(...root.data);
  if (Array.isArray(root.result?.messages)) candidates.push(...root.result.messages);
  if (Array.isArray(root.result?.conversations)) candidates.push(...root.result.conversations);
  if (Array.isArray(root.message?.data)) candidates.push(...root.message.data);

  const found: CapturedUserMessage[] = [];
  for (const candidate of candidates) {
    const direct = asUserMessage(candidate);
    if (direct) found.push(direct);

    if (candidate && typeof candidate === 'object' && Array.isArray(candidate.message)) {
      for (const nested of candidate.message) {
        const nestedMsg = asUserMessage(nested);
        if (nestedMsg) found.push(nestedMsg);
      }
    }
  }

  const seen = new Set<string>();
  return found.filter((msg) => {
    const key = msg.msgId || `${msg.uid}:${msg.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Collect all captured user messages across WS + HTTP
const allUserMessages: CapturedUserMessage[] = [];

function collectUserMessages(source: string, payload: string) {
  const msgs = extractUserMessages(payload);
  for (const m of msgs) {
    const key = m.msgId || `${m.uid}:${m.content}`;
    if (!allUserMessages.find(x => (x.msgId || `${x.uid}:${x.content}`) === key)) {
      allUserMessages.push(m);
      record(`USER_MSG [${source}]`, { uid: m.uid, content: m.content?.slice(0, 80), msgId: m.msgId });
    }
  }
}

async function main() {
  console.log('🔬 PDD 消息闭环验证工具');
  console.log('══════════════════════════\n');

  const storeDirs = findStoreDirs();
  if (storeDirs.length === 0) {
    console.log('❌ 未找到 browser-data/store-* 目录');
    console.log('   请先用 Playwright 登录一次拼多多商家后台');
    process.exit(1);
  }

  const userDataDir = storeDirs[0];
  const storeId = path.basename(userDataDir);
  console.log(`📁 使用 session: ${storeId}\n`);

  // ─── Phase 1: 启动浏览器 ───
  console.log('━'.repeat(60));
  console.log('Phase 1: 启动浏览器，导航到客服页面');
  console.log('━'.repeat(60));

  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const pages = browser.pages();
  const page = pages[0] || await browser.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // ─── Phase 2: CDP 拦截 ───
  console.log('━'.repeat(60));
  console.log('Phase 2: 启动 CDP 网络拦截');
  console.log('━'.repeat(60));

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');

  // WebSocket 帧 — 完整记录
  const wsFrames: any[] = [];
  cdp.on('Network.webSocketCreated', (params: any) => {
    record('WS_CREATED', { url: params.url });
  });
  cdp.on('Network.webSocketFrameReceived', (params: any) => {
    const data = params.response?.payloadData || '';
    if (data.length < 5) return;
    wsFrames.push({ direction: 'recv', timestamp: Date.now(), data });
    // Try JSON first, then binary decode
    collectUserMessages('ws', data);
  });
  cdp.on('Network.webSocketFrameSent', (params: any) => {
    const data = params.response?.payloadData || '';
    if (data.length < 5) return;
    wsFrames.push({ direction: 'sent', timestamp: Date.now(), data });
    record('WS_SENT', { preview: data.slice(0, 300) });
  });

  // HTTP 请求 — 只记录 chat 相关
  const httpLogs: any[] = [];
  cdp.on('Network.requestWillBeSent', (params: any) => {
    const url = params.request?.url || '';
    if (url.includes('plateau') || url.includes('chat')) {
      const entry = {
        method: params.request?.method,
        url: url.split('?')[0],
        postData: params.request?.postData?.slice(0, 2000),
      };
      httpLogs.push({ ...entry, direction: 'request' });
      record('HTTP_REQ', entry);
    }
  });
  cdp.on('Network.responseReceived', async (params: any) => {
    const url = params.response?.url || '';
    if (url.includes('plateau') || url.includes('chat')) {
      const status = params.response?.status;
      try {
        const body = await cdp.send('Network.getResponseBody', { requestId: params.requestId });
        const text = body.body?.slice(0, 2000) || '';
        const entry = { url: url.split('?')[0], status, body: text };
        httpLogs.push({ ...entry, direction: 'response' });
        // Extract user messages from HTTP responses (latest_conversations etc.)
        if (text.length > 10 && text.startsWith('{')) {
          collectUserMessages('http', text);
        }
        if (!text.includes('"from":{"uid"')) {
          record('HTTP_RESP', entry);
        }
      } catch {
        httpLogs.push({ url: url.split('?')[0], status, body: '(unavailable)', direction: 'response' });
      }
    }
  });

  // ─── Phase 3: 导航 ───
  console.log('━'.repeat(60));
  console.log('Phase 3: 导航到客服页面');
  console.log('━'.repeat(60));

  await page.goto('https://mms.pinduoduo.com/home/', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(3000);

  const url = page.url();
  if (url.includes('login') || url.includes('passport')) {
    record('NEEDS_LOGIN', { url });
    console.log('\n🔐 需要登录！请在打开的浏览器中完成登录');
    console.log('   等待最多 5 分钟...\n');

    const start = Date.now();
    while (Date.now() - start < 300000) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        if (page.isClosed()) { console.log('浏览器已关闭'); process.exit(1); }
        const u = page.url();
        if (!u.includes('login') && !u.includes('passport') && u.includes('mms')) break;
      } catch { break; }
    }
  }

  // 保存 cookies
  const cookies = await browser.cookies();
  record('COOKIES', { count: cookies.length, names: cookies.map(c => c.name) });

  // 导航到客服页
  await page.goto('https://mms.pinduoduo.com/chat-merchant/index.html', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(5000);
  record('CHAT_PAGE', { url: page.url(), title: await page.title() });

  // ─── Phase 4: 等待并捕获消息 ───
  console.log('━'.repeat(60));
  console.log('Phase 4: 等待客户消息（2 分钟）...');
  console.log('   现在用测试买家号发一条消息！');
  console.log('   例如：「你好，这个有货吗？」');
  console.log('━'.repeat(60));

  // 点击第一个会话（如果存在）以触发消息加载
  try {
    const clicked = await page.evaluate(() => {
      const items = document.querySelectorAll(
        '[class*="conversation"], [class*="chat-item"], [class*="contact-item"], ' +
        '[class*="session-item"], [class*="list-item"]'
      );
      for (const el of items) {
        if ((el as HTMLElement).offsetParent !== null) {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    });
    record('CLICK_CONV', { clicked });
    if (clicked) await page.waitForTimeout(2000);
  } catch {}

  // Poll for new messages from HTTP responses while waiting
  console.log('   ⏳ 等待 120 秒，现在去发测试消息...\n');
  const waitSeconds = 120;
  for (let i = 0; i < waitSeconds; i += 5) {
    await new Promise(r => setTimeout(r, 5000));
    // Trigger HTTP poll by clicking around or refreshing conversation
    if (i % 15 === 0 && i > 0) {
      try {
        await page.evaluate(() => {
          const items = document.querySelectorAll('[class*="chat-item"]');
          if (items.length > 0) (items[0] as HTMLElement).click();
        });
      } catch {}
    }
    if (allUserMessages.length > 0) {
      console.log(`   📩 已捕获 ${allUserMessages.length} 条用户消息，继续等待...`);
    }
    if (i % 30 === 0) {
      console.log(`   ... ${waitSeconds - i}s 剩余`);
    }
  }

  // ─── Phase 5: 测试发送（仅当收到过消息时才测试，避免空发触发风控）───
  console.log('━'.repeat(60));
  console.log('Phase 5: 测试消息发送');
  console.log('━'.repeat(60));

  // Use messages from all sources (WS + HTTP response bodies)
  const validUserMsgs = allUserMessages.filter(m => m.uid !== '?' && !m.content.startsWith('[BINARY'));
  record('COLLECTED', { total: allUserMessages.length, valid: validUserMsgs.length, httpOnly: allUserMessages.filter(m => !m.raw?._binaryLen).length, binaryWs: allUserMessages.filter(m => m.raw?._binaryLen).length });

  if (validUserMsgs.length > 0) {
    const lastMsg = validUserMsgs[validUserMsgs.length - 1];
    const uid = lastMsg.uid;
    record('TEST_TARGET', { uid, lastContent: lastMsg.content?.slice(0, 50) });

    // ─── Test A: HTTP 发送 ───
    console.log('\n📤 Test A: HTTP send_message');
    const testContent = '您好，这是系统自动测试消息，请忽略。【多多AI客服 验证】';

    const ts = Math.floor(Date.now() / 1000);
    const sendBody = {
      data: {
        cmd: 'send_message',
        anti_content: '',
        request_id: Date.now().toString() + Math.random().toString(36).slice(2, 5),
        message: {
          to: { role: 'user', uid },
          from: { role: 'mall_cs' },
          ts,
          content: testContent,
          msg_id: null,
          type: 0,
          is_aut: 1,
          manual_reply: 0,
          status: 'read',
          is_read: 1,
          hash: '',
        },
        random: Math.random().toString(36).slice(2),
      },
      client: 'WEB',
      anti_content: '',
    };

    try {
      const httpResult = await page.evaluate(async (body: any) => {
        const res = await fetch('/plateau/chat/send_message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          credentials: 'include',
        });
        return { status: res.status, body: await res.text() };
      }, sendBody);

      record('TEST_HTTP_SEND', httpResult);
      await page.waitForTimeout(2000);
    } catch (e: any) {
      record('TEST_HTTP_SEND_ERROR', { error: e.message });
    }

    // ─── Test B: page.evaluate 点击发送 ───
    console.log('\n📤 Test B: page.evaluate 点击发送');
    try {
      const clickResult = await page.evaluate((content: string) => {
        // 找到 textarea
        const textarea = document.querySelector('textarea');
        if (!textarea) return { error: 'textarea not found' };

        // 通过原生 setter 设置值（绕过 React 事件）
        const nativeSetter = (Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        ) as any)?.set;
        if (nativeSetter) {
          nativeSetter.call(textarea, content);
        } else {
          (textarea as HTMLTextAreaElement).value = content;
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));

        // 找发送按钮
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          const text = btn.textContent || '';
          if ((text.includes('发送') || text.includes('Send')) &&
              (btn as HTMLElement).offsetParent !== null) {
            btn.click();
            return { success: true, buttonText: text };
          }
        }

        // 备选：找带发送图标的按钮
        for (const btn of btns) {
          const aria = btn.getAttribute('aria-label') || '';
          if ((aria.includes('发送') || aria.includes('send')) &&
              (btn as HTMLElement).offsetParent !== null) {
            btn.click();
            return { success: true, ariaLabel: aria };
          }
        }

        // 列出所有可见按钮的文本供参考
        const allBtns = Array.from(btns)
          .filter(b => (b as HTMLElement).offsetParent !== null)
          .map(b => b.textContent?.trim() || b.getAttribute('aria-label') || '')
          .filter(t => t.length > 0);
        return { error: 'send button not found', availableButtons: allBtns.slice(0, 10) };
      }, '您好，这是自动测试消息，请忽略。【PDD AI 验证-click】');

      record('TEST_CLICK_SEND', clickResult);
      await page.waitForTimeout(3000);
    } catch (e: any) {
      record('TEST_CLICK_SEND_ERROR', { error: e.message });
    }
  } else {
    record('NO_USER_MSG', { message: '2分钟内未捕获到客户消息，跳过发送测试。请用测试买家号发一条消息后重试。' });
  }

  // ─── Phase 6: 页面结构探测 ───
  console.log('━'.repeat(60));
  console.log('Phase 6: 页面结构探测（辅助定位选择器）');
  console.log('━'.repeat(60));

  const domInfo = await page.evaluate(() => {
    const info: any = {};

    // 查找 textarea
    const textareas = document.querySelectorAll('textarea');
    info.textareas = Array.from(textareas).map(ta => ({
      placeholder: ta.placeholder,
      className: ta.className?.slice(0, 100),
      visible: (ta as HTMLElement).offsetParent !== null,
    }));

    // 查找 contenteditable 编辑器
    const editables = document.querySelectorAll('[contenteditable="true"], [contenteditable=""], [role="textbox"]');
    info.contenteditables = Array.from(editables).map(el => ({
      tag: el.tagName,
      className: el.className?.slice(0, 100),
      ariaLabel: el.getAttribute('aria-label'),
      role: el.getAttribute('role'),
      visible: (el as HTMLElement).offsetParent !== null,
      text: (el as HTMLElement).innerText?.slice(0, 50),
    }));

    // 查找所有可见按钮
    const buttons = document.querySelectorAll('button');
    info.visibleButtons = Array.from(buttons)
      .filter(b => (b as HTMLElement).offsetParent !== null)
      .slice(0, 20)
      .map(b => ({
        text: b.textContent?.trim()?.slice(0, 50),
        className: b.className?.slice(0, 100),
        ariaLabel: b.getAttribute('aria-label'),
      }));

    // 查找输入框
    const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
    info.textInputs = Array.from(inputs)
      .filter(i => (i as HTMLElement).offsetParent !== null)
      .slice(0, 10)
      .map(i => ({
        placeholder: (i as HTMLInputElement).placeholder,
        className: i.className?.slice(0, 100),
      }));

    // 查找所有可见的 div/span 可能在聊天区域
    const allVisibleEls = document.querySelectorAll('div, span, pre');
    const chatRegionEls: any[] = [];
    for (const el of allVisibleEls) {
      if ((el as HTMLElement).offsetParent === null) continue;
      const text = (el as HTMLElement).innerText?.trim() || '';
      if ((text.includes('发送') || text.includes('回复')) && text.length < 10) {
        chatRegionEls.push({ tag: el.tagName, text: text.slice(0, 30), className: el.className?.slice(0, 80) });
      }
    }
    info.sendRelatedEls = chatRegionEls.slice(0, 5);

    // 查找会话列表项
    const convSelectors = [
      '[class*="conversation"]', '[class*="chat-item"]', '[class*="contact"]',
      '[class*="session"]', '[class*="list-item"]', '[role="listitem"]',
    ];
    info.conversationCounts = convSelectors.reduce((acc: any, sel) => {
      acc[sel] = document.querySelectorAll(sel).length;
      return acc;
    }, {});

    return info;
  });
  record('DOM_INFO', domInfo);

  // ─── 保存输出 ───
  console.log('━'.repeat(60));
  console.log('Phase 7: 保存诊断报告');
  console.log('━'.repeat(60));

  const report = {
    generatedAt: new Date().toISOString(),
    storeId,
    summary: {
      wsFramesReceived: wsFrames.filter((f: any) => f.direction === 'recv').length,
      wsFramesSent: wsFrames.filter((f: any) => f.direction === 'sent').length,
      httpRequests: httpLogs.filter((l: any) => l.direction === 'request').length,
      httpResponses: httpLogs.filter((l: any) => l.direction === 'response').length,
      userMessagesFound: allUserMessages.length,
    },
    logs,
    rawData: {
      wsFrames: wsFrames.slice(-200),    // 最近 200 条
      httpLogs: httpLogs.slice(-100),    // 最近 100 条
    },
    domInfo,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
  console.log(`\n✅ 报告已保存: ${OUTPUT_FILE}`);
  console.log(`   WS 帧总数: ${report.summary.wsFramesReceived} recv / ${report.summary.wsFramesSent} sent`);
  console.log(`   HTTP 请求: ${report.summary.httpRequests} req / ${report.summary.httpResponses} resp`);
  console.log(`   用户消息: ${report.summary.userMessagesFound} 条`);

  // 清理
  await browser.close();
  console.log('\n🏁 验证完成。请将 diagnostic-output.json 发回分析。\n');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
