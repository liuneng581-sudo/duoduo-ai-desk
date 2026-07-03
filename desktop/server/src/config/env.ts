import dotenv from 'dotenv';
import path from 'path';

// Env precedence (highest first): real process env (e.g. values Electron
// injects at runtime — DATABASE_URL pointing at the userData DB, runtime
// secrets) > server-local .env > root .env. dotenv never overwrites a var
// that's already set, so load the most specific file FIRST and let earlier
// definitions win. (The previous order loaded root last with no override, so
// root silently shadowed server-local; using override:true would have been
// worse — it would clobber the values Electron injects.)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });      // server-local
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });    // project root (fills gaps only)

// Only an explicit NODE_ENV=development run may fall back to placeholder secrets.
// Everything else (production, `npm start`, start.sh, missing NODE_ENV) must use
// real secrets — Electron injects random ones at runtime, so the packaged app is
// unaffected. This prevents a non-dev launch from silently running with weak
// placeholder keys.
const isDevelopment = process.env.NODE_ENV === 'development';

// Markers that indicate a value is an obvious placeholder rather than a real secret.
const PLACEHOLDER_PREFIXES = ['local-dev-', 'change-me', 'changeme', 'placeholder', 'your-'];
function isPlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase();
  return PLACEHOLDER_PREFIXES.some((p) => v.startsWith(p)) || v.includes('change-me') || v.includes('changeme');
}

function requireSecret(name: string, devDefault: string): string {
  const value = process.env[name];
  if (value && !isPlaceholder(value)) return value;

  // A real value was provided but it looks like a placeholder — refuse always.
  if (value && isPlaceholder(value) && !isDevelopment) {
    throw new Error(`${name} 看起来是占位符（如 "local-dev-..."），非开发环境拒绝启动。请设置真实的密钥。`);
  }

  // No value (or a placeholder in dev): only NODE_ENV=development may use the dev default.
  if (isDevelopment) return value || devDefault;

  throw new Error(`${name} 缺失或无效。仅 NODE_ENV=development 允许使用开发默认密钥；当前环境必须提供真实密钥（Electron 启动会自动注入）。`);
}

function requireSecretMinLength(name: string, devDefault: string, minLength: number): string {
  const value = requireSecret(name, devDefault);
  if (value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters`);
  }
  return value;
}

export const env = {
  // Database
  DATABASE_URL: process.env.DATABASE_URL || '',

  // JWT
  JWT_ACCESS_SECRET: requireSecret('JWT_ACCESS_SECRET', 'local-dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: requireSecret('JWT_REFRESH_SECRET', 'local-dev-refresh-secret-change-me'),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  COMPANION_WS_TOKEN: requireSecret('COMPANION_WS_TOKEN', 'local-dev-companion-token'),

  // API Key Encryption (must be 32 chars for AES-256)
  API_KEY_ENCRYPTION_KEY: requireSecretMinLength(
    'API_KEY_ENCRYPTION_KEY',
    'local-dev-api-key-encryption-secret',
    32,
  ),

  // Server
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  // Bind address — default localhost-only so the API/WS is not exposed on the LAN.
  // Set BIND_HOST=0.0.0.0 only if you intentionally need remote access.
  BIND_HOST: process.env.BIND_HOST || '127.0.0.1',

  // AI Providers
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',

  // Pinduoduo Browser
  PDD_BROWSER_MODE: process.env.PDD_BROWSER_MODE || 'headful',
  PDD_BROWSER_COUNT: parseInt(process.env.PDD_BROWSER_COUNT || '3', 10),
  PDD_USER_DATA_DIR: process.env.PDD_USER_DATA_DIR || './browser-data',

  // License / activation — machine fingerprint injected by the Electron main
  // process (see electron/main.ts getMachineId). In standalone dev runs there's
  // no Electron, so fall back to a fixed dev value to keep the activation flow
  // testable locally.
  MACHINE_ID: process.env.MACHINE_ID || 'DEV-MACHINE-LOCAL',
} as const;

export type Env = typeof env;
