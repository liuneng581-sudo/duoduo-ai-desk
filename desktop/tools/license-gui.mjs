/**
 * 多多AI客服 · 激活码生成器(图形界面版)
 *
 * 双击 start-license-gui.command 启动(或 `node tools/license-gui.mjs`),
 * 会自动打开浏览器:粘贴客户机器码 → 点「生成激活码」→ 复制发给客户。
 *
 * 纯本地、零依赖(Node 内置 http/crypto)。私钥只读 tools/license-private.key,
 * 绝不外传。和命令行版 gen-license.mjs 用同一套签名逻辑,生成的码完全等价。
 */
import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIVATE_KEY_PATH = path.join(__dirname, 'license-private.key');
const PORT = 48732;

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function groupCode(s) { return (s.match(/.{1,5}/g) || []).join('-'); }

function signLicense(machineId, days) {
  const privatePem = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  const privateKey = crypto.createPrivateKey(privatePem);
  const sig = crypto.sign(null, Buffer.from(`${machineId}:${days}`, 'utf8'), privateKey); // 64 bytes
  const tail = Buffer.from([(days >> 8) & 0xff, days & 0xff]);
  return groupCode(base32Encode(Buffer.concat([sig, tail])));
  return groupCode(base32Encode(sig));
}

const PAGE = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>多多AI客服 · 激活码生成器</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "PingFang SC", sans-serif; background: linear-gradient(135deg,#E8453C,#F47C3C); margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
  .card { background:#fff; border-radius:20px; box-shadow:0 12px 48px rgba(0,0,0,.22); width:100%; max-width:520px; padding:36px 32px; }
  .logo { width:56px;height:56px;border-radius:50%;background:#E8453C;display:flex;align-items:center;justify-content:center;margin:0 auto 14px; }
  .logo::after{content:"";width:20px;height:20px;border-radius:50%;background:#fff;}
  h1 { font-size:20px; text-align:center; margin:0 0 4px; color:#1A1A1A; font-weight:800; }
  .sub { text-align:center; color:#8A8A8A; font-size:13px; margin-bottom:24px; }
  label { font-size:13px; font-weight:700; color:#555; display:block; margin-bottom:6px; }
  textarea { width:100%; border:1px solid #E0E0E0; border-radius:10px; padding:12px; font-size:13px; font-family:monospace; resize:vertical; min-height:64px; }
  textarea:focus { outline:none; border-color:#E8453C; }
  button { width:100%; background:#E8453C; color:#fff; border:none; border-radius:10px; padding:13px; font-size:15px; font-weight:800; cursor:pointer; margin-top:16px; }
  button:hover { background:#d63a31; }
  .result { margin-top:22px; display:none; }
  .result.show { display:block; }
  .code { background:#FAFAF9; border:1px solid #E8E8E8; border-radius:10px; padding:14px; font-family:monospace; font-size:13px; word-break:break-all; color:#1A1A1A; line-height:1.7; }
  .copy { background:#1A1A1A; margin-top:10px; }
  .copy:hover { background:#333; }
  .err { color:#E8453C; font-size:13px; margin-top:12px; display:none; }
  .ok { color:#22A06B; font-size:12px; text-align:center; margin-top:8px; display:none; }
</style></head>
<body>
  <div class="card">
    <div class="logo"></div>
    <h1>激活码生成器</h1>
    <div class="sub">粘贴客户的机器码,生成专属激活码</div>
    <label>客户机器码</label>
    <textarea id="mid" placeholder="把客户激活页上的机器码粘到这里" autofocus></textarea>
    <label style="margin-top:14px;">授权档位</label>
    <select id="plan" style="width:100%;border:1px solid #E0E0E0;border-radius:10px;padding:11px;font-size:14px;">
      <option value="0">永久</option>
      <option value="7">7天体验</option>
      <option value="365">1年</option>
    </select>
    <button onclick="gen()" style="margin-top:16px;">生成激活码</button>
    <div class="err" id="err"></div>
    <div class="result" id="result">
      <label style="margin-top:4px;">激活码(发给客户)</label>
      <div class="code" id="code"></div>
      <button class="copy" onclick="copyCode()">复制激活码</button>
      <div class="ok" id="ok">已复制 ✓</div>
    </div>
  </div>
<script>
  async function gen() {
    const mid = document.getElementById('mid').value.trim();
    const days = parseInt(document.getElementById('plan').value, 10) || 0;
    const err = document.getElementById('err');
    const result = document.getElementById('result');
    err.style.display='none'; result.classList.remove('show');
    if (!mid) { err.textContent='请先粘贴机器码'; err.style.display='block'; return; }
    try {
      const res = await fetch('/gen', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ machineId: mid, days }) });
      const data = await res.json();
      if (!res.ok || data.error) { err.textContent = data.error || '生成失败'; err.style.display='block'; return; }
      document.getElementById('code').textContent = data.code;
      result.classList.add('show');
    } catch(e) { err.textContent='生成失败: '+e.message; err.style.display='block'; }
  }
  function copyCode() {
    const code = document.getElementById('code').textContent;
    navigator.clipboard.writeText(code).then(()=>{ const ok=document.getElementById('ok'); ok.style.display='block'; setTimeout(()=>ok.style.display='none',1500); });
  }
  document.getElementById('mid').addEventListener('keydown', e=>{ if((e.metaKey||e.ctrlKey)&&e.key==='Enter') gen(); });
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
    return;
  }
  if (req.method === 'POST' && req.url === '/gen') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 10000) req.destroy(); });
    req.on('end', () => {
      try {
        const { machineId, days } = JSON.parse(body || '{}');
        const mid = String(machineId || '').trim();
        if (!mid) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '机器码为空' })); return; }
        let d = parseInt(days, 10); if (!Number.isFinite(d) || d < 0) d = 0; d = Math.min(d, 36500);
        const code = signLicense(mid, d);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code, days: d }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  res.writeHead(404); res.end();
});

if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  console.error('❌ 找不到私钥 tools/license-private.key — 先跑 node tools/gen-license.mjs 生成密钥对');
  process.exit(1);
}

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`\n✅ 激活码生成器已启动: ${url}`);
  console.log('   浏览器会自动打开。关掉这个窗口即停止。\n');
  // 跨平台打开默认浏览器
  if (process.platform === 'win32') exec(`start "" "${url}"`);
  else if (process.platform === 'darwin') exec(`open "${url}"`);
  else exec(`xdg-open "${url}"`);
});
