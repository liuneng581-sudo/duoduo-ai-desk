/**
 * AES-256-GCM authenticated encryption for sensitive data.
 * Uses 12-byte random IV + 16-byte auth tag appended to ciphertext.
 */

import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = env.API_KEY_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error('API_KEY_ENCRYPTION_KEY must be at least 32 characters');
  }
  return Buffer.from(raw.slice(0, 32), 'utf-8');
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex-encoded)
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length === 3) {
    // New GCM format: iv:tag:ciphertext
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const data = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf-8');
  }
  if (parts.length === 2) {
    // Legacy CBC format: iv:ciphertext (will be re-encrypted on next save)
    const iv = Buffer.from(parts[0], 'hex');
    const data = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf-8');
  }
  throw new Error('Invalid encrypted format');
}

// Shape of an encrypted value (iv:tag:ciphertext, all hex). Used to tell an
// encrypted secret apart from a legacy plaintext one so we can migrate in place.
const ENCRYPTED_RE = /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i;

export function isEncrypted(value: string): boolean {
  return ENCRYPTED_RE.test(value);
}

/** Decrypt if it looks encrypted; otherwise return as-is (legacy plaintext). */
export function decryptIfNeeded(value: string): string {
  if (!value) return '';
  if (!isEncrypted(value)) return value;
  try { return decrypt(value); } catch { return ''; }
}

/** Encrypt unless already encrypted (idempotent for at-rest storage). */
export function encryptIfNeeded(value: string): string {
  if (!value) return '';
  return isEncrypted(value) ? value : encrypt(value);
}
