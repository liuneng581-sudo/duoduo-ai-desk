/**
 * 多多AI客服 · 激活码签发工具(只在发行方手里运行,绝不打包进 app)
 *
 * 一机一码,离线签名验证:
 *   - 首次运行自动生成 Ed25519 密钥对。
 *     · 私钥 → tools/license-private.key（你自己保管,绝不进 git / 安装包 / 给客户）
 *     · 公钥 → 打印出来,你贴进 server/src/services/license.service.ts 的 LICENSE_PUBLIC_KEY
 *   - 签发激活码:对客户的机器码签名 → base32 字符串 = 激活码,发给客户。
 *
 * 用法:
 *   node tools/gen-license.mjs                 # 首次:生成密钥对并打印公钥
 *   node tools/gen-license.mjs <机器码>         # 对某台机器签发激活码
 *
 * 安全模型:私钥只在你手里 → 没有私钥无法伪造激活码;码绑定机器码 → 换机失效。
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIVATE_KEY_PATH = path.join(__dirname, 'license-private.key');
const PUBLIC_KEY_PATH = path.join(__dirname, 'license-public.key');

// ── base32 (Crockford-ish, no padding) — 激活码用,避免易混字符 ──
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

/** Format an activation code into dash-separated groups of 5 for readability. */
function groupCode(s) {
  return (s.match(/.{1,5}/g) || []).join('-');
}

function loadOrCreateKeys() {
  if (fs.existsSync(PRIVATE_KEY_PATH)) {
    const privatePem = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
    const privateKey = crypto.createPrivateKey(privatePem);
    const publicKey = crypto.createPublicKey(privateKey);
    return { privateKey, publicKey, created: false };
  }
  // Generate a fresh Ed25519 keypair.
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  fs.writeFileSync(PRIVATE_KEY_PATH, privatePem, { mode: 0o600 });
  fs.writeFileSync(PUBLIC_KEY_PATH, publicPem, { mode: 0o644 });
  return { privateKey, publicKey, created: true };
}

// 签发激活码:签 `${machineId}:${days}`,码 = base32(64字节签名 + 2字节天数大端)。
// days=0 永久 / 7 体验 / 365 一年。
function signLicense(privateKey, machineId, days) {
  const msg = `${machineId}:${days}`;
  const sig = crypto.sign(null, Buffer.from(msg, 'utf8'), privateKey); // 64 bytes
  const tail = Buffer.from([(days >> 8) & 0xff, days & 0xff]);          // 2 bytes BE
  return groupCode(base32Encode(Buffer.concat([sig, tail])));
}

// 把档位参数解析成天数:trial/7→7, year/1y/365→365, 其余→0(永久)
function parseDays(arg) {
  if (!arg) return 0;
  const a = String(arg).toLowerCase();
  if (a === 'trial' || a === '7' || a === '7d' || a === '体验') return 7;
  if (a === 'year' || a === '1y' || a === '365' || a === '一年') return 365;
  if (a === 'permanent' || a === '0' || a === '永久') return 0;
  const n = parseInt(a, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 36500) : 0;
}

function main() {
  const { privateKey, publicKey, created } = loadOrCreateKeys();
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString().trim();

  if (created) {
    console.log('✅ 已生成新的 Ed25519 密钥对');
    console.log(`   私钥: ${PRIVATE_KEY_PATH}  ← 自己保管,绝不外泄/进 git/进安装包`);
    console.log(`   公钥: ${PUBLIC_KEY_PATH}`);
    console.log('');
    console.log('👉 把下面这段公钥贴进 server/src/services/license.service.ts 的 LICENSE_PUBLIC_KEY:');
    console.log('');
    console.log(publicPem);
    console.log('');
  }

  const machineId = process.argv[2];
  if (!machineId) {
    if (!created) {
      console.log('用法: node tools/gen-license.mjs <机器码> [档位]');
      console.log('  档位: trial(7天体验) | year(1年) | permanent(永久,默认)');
      console.log('当前公钥(贴进 license.service.ts):');
      console.log('');
      console.log(publicPem);
    }
    return;
  }

  const days = parseDays(process.argv[3]);
  const planLabel = days === 7 ? '7天体验' : days === 365 ? '1年' : days === 0 ? '永久' : `${days}天`;
  const code = signLicense(privateKey, machineId.trim(), days);
  console.log('');
  console.log('机器码:', machineId.trim());
  console.log('档位  :', planLabel);
  console.log('激活码:', code);
  console.log('');
  console.log('把「激活码」发给客户,在激活页输入即可。此码只对该机器码有效。');
}

main();
