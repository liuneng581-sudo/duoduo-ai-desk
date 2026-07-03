/**
 * Message-level encryption for sensitive fields carried over the
 * companion WebSocket channel (e.g. PDD login credentials).
 *
 * Both the server and the companion hold the shared COMPANION_WS_TOKEN;
 * a 32-byte AES-256-GCM key is derived from it (SHA-256), so neither side
 * transmits credentials in plaintext even though the channel is localhost.
 *
 * Wire format: iv(12B hex):authTag(16B hex):ciphertext(hex)
 */
import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function deriveKey(): Buffer {
  return crypto.createHash('sha256').update(env.COMPANION_WS_TOKEN).digest();
}

export function encryptJson(obj: unknown): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(), iv);
  const json = JSON.stringify(obj);
  const enc = Buffer.concat([cipher.update(json, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptJson(packed: string): unknown {
  const parts = packed.split(':');
  if (parts.length !== 3) throw new Error('invalid ws crypto format');
  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const data = Buffer.from(parts[2], 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString('utf-8'));
}
