/**
 * License / activation service — 一机一码,离线签名验证.
 *
 * 机器码(machineId)由 Electron 主进程算出并注入 env.MACHINE_ID。激活码是发行方
 * 用 Ed25519 私钥对 machineId 的签名(见 tools/gen-license.mjs)。本服务只持有
 * 公钥,用它验签:验签通过 = 该码确实由发行方签发且绑定本机 → 激活。
 *
 * 无私钥无法伪造激活码;码绑定 machineId → 换机失效。完全离线,无需联网。
 */
import * as crypto from 'crypto';
import prisma from '../config/database';
import { env } from '../config/env';
import logger from '../utils/logger';

// 发行方公钥(由 tools/gen-license.mjs 生成,公钥公开无妨)。
// 重新生成密钥对后,把新的公钥 PEM 贴到这里。
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEARtoTCMUMxh8Fn/DYKxtcnrjEuhsV1Kb4rPnIuu0RAb8=
-----END PUBLIC KEY-----`;

// 激活记录存在 SystemConfig 里(复用现有表,免新迁移)。归属到 owner user。
const ACTIVATION_KEY = 'license_activation';

// Owner 账号:单机授权模式下唯一的数据归属者(取代多用户账号体系)。
const OWNER_EMAIL = 'owner@local';

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const B32_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B32_ALPHABET.length; i++) B32_LOOKUP[B32_ALPHABET[i]] = i;

/** Decode a base32 string (dashes/whitespace/case ignored) back to bytes. */
function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_LOOKUP[ch];
    if (idx === undefined) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

let ownerUserIdCache: string | null = null;

export const licenseService = {
  getMachineId(): string {
    return env.MACHINE_ID;
  },

  /**
   * Verify an activation code against THIS machine. Returns { ok, days }.
   * The code is base32 of: Ed25519 signature(64 bytes) [+ 2-byte big-endian days].
   *   - days = 0  → 永久
   *   - days > 0  → valid for that many days from activation
   * The signed message is `${machineId}:${days}` so the validity period is also
   * tamper-proof (a customer can't extend a 7-day code by editing local state).
   * Legacy codes (64 bytes, no days tail) are treated as 永久 (days=0), signed
   * over the bare machineId — keeps old codes working. Never throws.
   */
  verifyCode(code: string): { ok: boolean; days: number } {
    try {
      const raw = base32Decode(code);
      const publicKey = crypto.createPublicKey(LICENSE_PUBLIC_KEY);
      const machineId = this.getMachineId();

      if (raw.length === 64) {
        // Legacy format: signature over bare machineId, permanent.
        const ok = crypto.verify(null, Buffer.from(machineId, 'utf8'), publicKey, raw);
        return { ok, days: 0 };
      }
      if (raw.length === 66) {
        // New format: 64-byte sig + 2-byte days. Signed message is `machineId:days`.
        const signature = raw.subarray(0, 64);
        const days = (raw[64] << 8) | raw[65];
        const msg = `${machineId}:${days}`;
        const ok = crypto.verify(null, Buffer.from(msg, 'utf8'), publicKey, signature);
        return { ok, days };
      }
      return { ok: false, days: 0 };
    } catch (e: any) {
      logger.warn(`License verify error: ${e?.message || e}`);
      return { ok: false, days: 0 };
    }
  },

  /** Is this machine activated AND not expired? */
  async isActivated(): Promise<boolean> {
    try {
      const ownerId = await this.ensureOwnerUser();
      const row = await prisma.systemConfig.findUnique({
        where: { userId_key: { userId: ownerId, key: ACTIVATION_KEY } },
        select: { value: true },
      });
      if (!row?.value) return false;
      const rec = JSON.parse(row.value) as { machineId: string; code: string; activatedAt: string };
      // Re-verify the code against the current machine (guards a copied DB).
      if (rec.machineId !== this.getMachineId()) return false;
      const v = this.verifyCode(rec.code);
      if (!v.ok) return false;
      // days=0 → permanent. Otherwise check the window from activatedAt.
      if (v.days > 0) {
        const start = new Date(rec.activatedAt).getTime();
        if (!Number.isFinite(start)) return false;
        const expireAt = start + v.days * 24 * 60 * 60 * 1000;
        if (Date.now() > expireAt) return false; // expired
      }
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Activate this machine with a code. Verifies the signature, then persists the
   * activation record (with activatedAt for expiry). Returns { ok, error?, days? }.
   */
  async activate(code: string): Promise<{ ok: boolean; error?: string; days?: number }> {
    const trimmed = (code || '').trim();
    if (!trimmed) return { ok: false, error: '请输入激活码' };
    const v = this.verifyCode(trimmed);
    if (!v.ok) {
      return { ok: false, error: '激活码无效，或与本机不匹配' };
    }
    const ownerId = await this.ensureOwnerUser();
    const value = JSON.stringify({
      machineId: this.getMachineId(), code: trimmed, days: v.days,
      activatedAt: new Date().toISOString(),
    });
    await prisma.systemConfig.upsert({
      where: { userId_key: { userId: ownerId, key: ACTIVATION_KEY } },
      update: { value },
      create: { userId: ownerId, key: ACTIVATION_KEY, value },
    });
    logger.info(`License activated (days=${v.days || '永久'})`);
    return { ok: true, days: v.days };
  },

  /**
   * Activation details for display: { activated, plan, expiresAt, remainingDays }.
   * plan: 'permanent' | 'trial' | 'expired' | 'none'. Used by the UI to show
   * "体验版剩余 N 天" / "永久授权" etc.
   */
  async getActivationInfo(): Promise<{
    activated: boolean; plan: 'permanent' | 'trial' | 'expired' | 'none';
    days: number; expiresAt: string | null; remainingDays: number | null;
  }> {
    try {
      const ownerId = await this.ensureOwnerUser();
      const row = await prisma.systemConfig.findUnique({
        where: { userId_key: { userId: ownerId, key: ACTIVATION_KEY } },
        select: { value: true },
      });
      if (!row?.value) return { activated: false, plan: 'none', days: 0, expiresAt: null, remainingDays: null };
      const rec = JSON.parse(row.value) as { machineId: string; code: string; days?: number; activatedAt: string };
      if (rec.machineId !== this.getMachineId()) return { activated: false, plan: 'none', days: 0, expiresAt: null, remainingDays: null };
      const v = this.verifyCode(rec.code);
      if (!v.ok) return { activated: false, plan: 'none', days: 0, expiresAt: null, remainingDays: null };
      if (v.days === 0) return { activated: true, plan: 'permanent', days: 0, expiresAt: null, remainingDays: null };
      const start = new Date(rec.activatedAt).getTime();
      const expireAt = start + v.days * 24 * 60 * 60 * 1000;
      const remainingMs = expireAt - Date.now();
      if (remainingMs <= 0) {
        return { activated: false, plan: 'expired', days: v.days, expiresAt: new Date(expireAt).toISOString(), remainingDays: 0 };
      }
      return {
        activated: true, plan: 'trial', days: v.days,
        expiresAt: new Date(expireAt).toISOString(),
        remainingDays: Math.ceil(remainingMs / (24 * 60 * 60 * 1000)),
      };
    } catch {
      return { activated: false, plan: 'none', days: 0, expiresAt: null, remainingDays: null };
    }
  },

  /**
   * Ensure the single license-owner user exists and return its id. All app data
   * (stores / products / Q&A / settings) hangs off this userId, so the rest of
   * the codebase keeps using req.user.userId unchanged.
   */
  async ensureOwnerUser(): Promise<string> {
    if (ownerUserIdCache) return ownerUserIdCache;
    const existing = await prisma.user.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (existing) {
      ownerUserIdCache = existing.id;
      return existing.id;
    }
    // Create the owner. No password login in license mode — store an unusable
    // random hash so the column constraint is satisfied and the account can't be
    // logged into with a password.
    const unusableHash = crypto.randomBytes(48).toString('hex');
    const created = await prisma.user.create({
      data: { email: OWNER_EMAIL, passwordHash: unusableHash, name: '店主', role: 'admin' },
      select: { id: true },
    });
    ownerUserIdCache = created.id;
    return created.id;
  },
};
