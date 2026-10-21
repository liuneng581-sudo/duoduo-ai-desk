import crypto from 'crypto';

/**
 * First-run desktop admin password.
 * There is no public default. An explicit SEED_ADMIN_PASSWORD that is empty,
 * a known historical default, a placeholder, or (outside development) shorter
 * than 12 characters is rejected so production cannot boot with a known login.
 */
const MIN_EXPLICIT_PASSWORD_LENGTH = 12;

export function isRejectedBootstrapPassword(password: string, production: boolean): boolean {
  const trimmed = password.trim();
  const normalized = trimmed.toLowerCase();
  if (!trimmed) return true;
  if (/^(local-dev-|change-?me|placeholder|your-|example|todo|replace-with)/.test(normalized)) return true;
  if (normalized.includes('change-me') || normalized.includes('changeme') || normalized.includes('placeholder')) return true;
  if (/^\d+$/.test(trimmed)) return true;
  // Common shapes: a dictionary word plus digits/punctuation only (no extra words).
  // Applied in every environment so a known short login cannot be selected.
  if (/^(admin|root|password|passw0rd|changeme|change-me|default|letmein|qwerty|guest|test)[\d\W_]*$/i.test(trimmed)) return true;
  // Outside development, also require length so a packaged launch cannot keep a short explicit password.
  if (production && trimmed.length < MIN_EXPLICIT_PASSWORD_LENGTH) return true;
  return false;
}

export function resolveBootstrapPassword(explicit: string | undefined, production: boolean): string {
  if (explicit === undefined || explicit === '') {
    return crypto.randomBytes(12).toString('base64url');
  }
  if (isRejectedBootstrapPassword(explicit, production)) {
    throw new Error(
      'SEED_ADMIN_PASSWORD 无效：它是空白、占位符、已知默认口令，或在非开发环境中短于 12 位。请改成自设强密码，或留空以随机生成。生产环境不能使用公开默认口令。',
    );
  }
  return explicit;
}
