/**
 * 多多AI客服 — 云端激活码签发服务 + 下载/兑换站
 *
 * 职责：
 *  1) 静态托管下载页(index.html)、兑换页(redeem.html)、安装包与更新源(/downloads)
 *  2) 在线签发激活码（Ed25519 私钥在服务器，绝不进客户端）：
 *     - POST /api/license/trial  { machineId }      → 7天试用，一机一次（去重表）
 *     - POST /api/license/issue  { machineId, plan, adminEmail, adminPassword }
 *                                                    → 超管签发 一年 / 永久
 *  3) 签名算法与客户端验签完全一致：签 `${machineId}:${days}`，
 *     码 = base32(64字节签名 + 2字节天数大端)。days=0永久 / 7试用 / 365一年。
 *
 * 安全：私钥仅在本服务器（license-private.key, 权限600）。超管校验在服务端。
 * 所有签发接口限流。
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 配置（可用环境变量覆盖）──
const PORT = parseInt(process.env.PORT || '4010', 10);
const BIND = process.env.BIND_HOST || '127.0.0.1';
const PRIVATE_KEY_PATH = process.env.LICENSE_PRIVATE_KEY || path.join(__dirname, 'license-private.key');
const DB_PATH = process.env.LICENSE_DB || path.join(__dirname, 'data', 'license.db');

// 超管凭证只来自环境变量。源码不提供默认邮箱或密码。
// 未设置、过短、占位符、纯数字、或常见弱口令模式一律拒绝启动。
const MIN_ADMIN_PASSWORD_LENGTH = 12;

function isWeakAdminPassword(password, email) {
  const trimmed = password.trim();
  const normalized = trimmed.toLowerCase();
  if (!trimmed || trimmed.length < MIN_ADMIN_PASSWORD_LENGTH) return true;
  if (email && normalized === email.trim().toLowerCase()) return true;
  if (/^(local-dev-|change-?me|placeholder|your-|example|todo|replace-with)/.test(normalized)) return true;
  if (normalized.includes('change-me') || normalized.includes('changeme') || normalized.includes('placeholder')) return true;
  if (/^\d+$/.test(trimmed)) return true;
  // Common shapes: a dictionary word plus digits/punctuation only (no extra words).
  if (/^(admin|root|password|passw0rd|changeme|change-me|default|letmein|qwerty|guest|test)[\d\W_]*$/i.test(trimmed)) return true;
  return false;
}

function requireAdminCredentials() {
  const email = (process.env.ADMIN_EMAIL || '').trim();
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('[FATAL] ADMIN_EMAIL 未设置或不是有效邮箱。请通过环境变量配置超管邮箱（见 .env.example）。服务拒绝启动。');
    process.exit(1);
  }
  if (!String(password).trim()) {
    console.error('[FATAL] ADMIN_PASSWORD 未设置。超管密码必须通过环境变量注入，源码不包含默认密码。服务拒绝启动。');
    process.exit(1);
  }
  if (isWeakAdminPassword(String(password), email)) {
    console.error(`[FATAL] ADMIN_PASSWORD 过弱、是占位符，或命中了已知默认口令。请设置至少 ${MIN_ADMIN_PASSWORD_LENGTH} 位的随机强密码后重启。服务拒绝启动。`);
    process.exit(1);
  }
  return { email, password: String(password) };
}

const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = requireAdminCredentials();

// ── 加载私钥 ──
if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  console.error(`[FATAL] 找不到私钥: ${PRIVATE_KEY_PATH}`);
  process.exit(1);
}
const PRIVATE_KEY = crypto.createPrivateKey(fs.readFileSync(PRIVATE_KEY_PATH, 'utf8'));

// ── DB（trial 去重 + 签发记录）──
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS trial_claims (
    machineId   TEXT PRIMARY KEY,
    code        TEXT NOT NULL,
    ip          TEXT,
    createdAt   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS issued_licenses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    machineId   TEXT NOT NULL,
    plan        TEXT NOT NULL,
    days        INTEGER NOT NULL,
    code        TEXT NOT NULL,
    issuedBy    TEXT,
    ip          TEXT,
    createdAt   TEXT NOT NULL
  );
`);

// ── base32 编码（与 gen-license.mjs / 客户端解码一致）──
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function groupCode(s) {
  return (s.match(/.{1,5}/g) || []).join('-');
}

/** 签发激活码：签 `${machineId}:${days}` → base32(64字节签名 + 2字节天数大端)。 */
function signLicense(machineId, days) {
  const msg = `${machineId}:${days}`;
  const sig = crypto.sign(null, Buffer.from(msg, 'utf8'), PRIVATE_KEY); // 64 bytes
  const tail = Buffer.from([(days >> 8) & 0xff, days & 0xff]);          // 2 bytes BE
  return groupCode(base32Encode(Buffer.concat([sig, tail])));
}

function nowISO() {
  return new Date().toISOString();
}

/** 机器码基本校验：客户端的 machineId 是 32 位十六进制大写（sha256 截断）。
 *  宽松接受 16~64 位字母数字，避免误拒。 */
function validMachineId(m) {
  return typeof m === 'string' && /^[A-Za-z0-9]{16,64}$/.test(m.trim());
}

const app = express();
app.set('trust proxy', 1); // 在 nginx 反代后，正确取 client ip
app.use(express.json({ limit: '16kb' }));

// ── 限流 ──
const trialLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: '操作过于频繁，请稍后再试' } });
const issueLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: '尝试次数过多，请 15 分钟后再试' } });

// ── 7天试用：一机一次 ──
app.post('/api/license/trial', trialLimiter, (req, res) => {
  try {
    const machineId = (req.body?.machineId || '').trim();
    if (!validMachineId(machineId)) {
      return res.status(400).json({ error: '机器码格式不正确，请从软件「激活」页复制完整机器码' });
    }
    const existing = db.prepare('SELECT code, createdAt FROM trial_claims WHERE machineId = ?').get(machineId);
    if (existing) {
      // 一机一次：已领过就把原来的码再返回（方便用户找回），但不再新发。
      return res.status(409).json({
        error: '该设备已领取过 7 天试用，无法重复领取',
        code: existing.code,
        alreadyClaimed: true,
      });
    }
    const days = 7;
    const code = signLicense(machineId, days);
    db.prepare('INSERT INTO trial_claims (machineId, code, ip, createdAt) VALUES (?, ?, ?, ?)')
      .run(machineId, code, req.ip || '', nowISO());
    return res.json({ code, plan: 'trial', days });
  } catch (e) {
    console.error('trial error:', e);
    return res.status(500).json({ error: '签发失败，请重试' });
  }
});

// ── 超管签发：一年 / 永久 ──
app.post('/api/license/issue', issueLimiter, (req, res) => {
  try {
    const { machineId: rawM, plan, adminEmail, adminPassword } = req.body || {};
    const machineId = (rawM || '').trim();
    // 超管校验（服务端，恒定时间比较防时序侧信道）。
    // timingSafeEqual 要求两 buffer 等长，否则抛异常 → 先比长度。
    const safeEqual = (a, b) => {
      if (typeof a !== 'string' || typeof b !== 'string') return false;
      const ba = Buffer.from(a), bb = Buffer.from(b);
      if (ba.length !== bb.length) return false;
      return crypto.timingSafeEqual(ba, bb);
    };
    const emailOk = safeEqual(adminEmail, ADMIN_EMAIL);
    const passOk = safeEqual(adminPassword, ADMIN_PASSWORD);
    if (!emailOk || !passOk) {
      return res.status(401).json({ error: '管理员账号或密码错误' });
    }
    if (!validMachineId(machineId)) {
      return res.status(400).json({ error: '机器码格式不正确' });
    }
    let days;
    if (plan === 'year') days = 365;
    else if (plan === 'permanent') days = 0;
    else return res.status(400).json({ error: '授权类型无效（year / permanent）' });

    const code = signLicense(machineId, days);
    db.prepare('INSERT INTO issued_licenses (machineId, plan, days, code, issuedBy, ip, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(machineId, plan, days, code, adminEmail, req.ip || '', nowISO());
    return res.json({ code, plan, days });
  } catch (e) {
    console.error('issue error:', e);
    return res.status(500).json({ error: '签发失败，请重试' });
  }
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: nowISO() }));

// ── 静态站点（下载页/兑换页/下载与更新源）──
app.use('/downloads', express.static(path.join(__dirname, 'public', 'downloads'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));
app.use('/', express.static(path.join(__dirname, 'public')));

app.listen(PORT, BIND, () => {
  console.log(`License server running on http://${BIND}:${PORT}`);
  console.log(`Private key: ${PRIVATE_KEY_PATH}`);
  console.log(`DB: ${DB_PATH}`);
});
