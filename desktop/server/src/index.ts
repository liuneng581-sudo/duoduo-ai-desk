import http from 'http';
import bcrypt from 'bcryptjs';
import app from './app';
import { env } from './config/env';
import logger from './utils/logger';
import prisma from './config/database';
import { runMigrations } from './utils/migrate';
import { resolveBootstrapPassword } from './utils/bootstrapPassword';
import { companionGateway } from './services/companion/gateway';
import { aiChatService } from './services/ai/aiChat.service';

// Process-level backstops: surface stray async errors loudly instead of letting
// them silently hang a request or crash the process without a trace. Log and
// keep serving — an isolated rejection should not take down the whole server.
process.on('unhandledRejection', (reason: any) => {
  logger.error(`Unhandled promise rejection: ${reason?.message || reason}`, { stack: reason?.stack });
});
process.on('uncaughtException', (err: Error) => {
  logger.error(`Uncaught exception: ${err.message}`, { stack: err.stack });
});

// Reject a known/weak explicit bootstrap password before serving, including when
// the database already has users. Unset SEED_ADMIN_PASSWORD is fine: first boot
// generates a random password instead of a public default.
if (process.env.SEED_ADMIN_PASSWORD) {
  try {
    resolveBootstrapPassword(process.env.SEED_ADMIN_PASSWORD, process.env.NODE_ENV !== 'development');
  } catch (err: any) {
    logger.error(`❌ ${err?.message || err}`);
    process.exit(1);
  }
}

// ── DB init: runs on EVERY startup (idempotent) ──
// Applies any pending migrations via @prisma/client (no prisma CLI / no
// schema-engine needed in the packaged app — see utils/migrate.ts). This is the
// upgrade path: a new version's migrations get applied to the existing user DB
// on first launch. On a brand-new DB it applies all migrations from scratch.
async function autoInitDatabase(): Promise<void> {
  await runMigrations();

  // Ensure there is at least one admin account to log in with. The shipped
  // template DB is empty (no demo data), so a fresh install needs a bootstrap
  // admin. Idempotent: only creates when no user exists.
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    const generated = !process.env.SEED_ADMIN_PASSWORD;
    const adminPassword = resolveBootstrapPassword(
      process.env.SEED_ADMIN_PASSWORD,
      process.env.NODE_ENV !== 'development',
    );
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.create({
      data: { email: 'admin@pdd-ai.com', passwordHash, name: '管理员', role: 'admin' },
    });
    logger.info('👤 Bootstrap admin created: admin@pdd-ai.com');
    // Surface the generated password once so first-run login is possible. In the
    // packaged app this lands in duoduo-server.log. There is no shared default.
    if (generated) {
      logger.info(`   初始密码(随机生成，请立即登录修改): ${adminPassword}`);
    }
  }
}

// Create HTTP server from Express app
const server = http.createServer(app);

// Attach WebSocket gateway for companion client
companionGateway.attach(server);

// Migrate + bootstrap BEFORE accepting requests, so the API never serves against
// an unmigrated/empty database. A migration failure is fatal — we refuse to
// serve a half-broken schema (better a hard failure than scattered 500s).
autoInitDatabase()
  .then(() => {
    logger.info('📦 Database ready');
    startListening();
  })
  .catch((err: any) => {
    logger.error(`❌ Database migration failed — refusing to start: ${err.message}`, { stack: err.stack });
    // Exit non-zero: a broken schema must not serve traffic. Electron will show
    // the server failed to start rather than the app silently misbehaving.
    process.exit(1);
  });

function startListening(): void {
  server.listen(env.PORT, env.BIND_HOST, () => {
    logger.info(`🚀 Server running on http://${env.BIND_HOST}:${env.PORT}`);
    logger.info(`📦 Environment: ${env.NODE_ENV}`);
    logger.info(`🌐 Client URL: ${env.CLIENT_URL}`);
    logger.info(`🔌 WebSocket: ws://localhost:${env.PORT}/ws`);

    // Auto-reset stale browser states (leftover from crashes)
    prisma.store.updateMany({
      where: { browserState: { in: ['connecting', 'needs_login', 'online', 'error'] } },
      data: { browserState: 'idle' },
    }).then((r) => {
      if (r.count > 0) logger.info(`🔧 Reset ${r.count} stale store states to idle`);
    }).catch(() => {});

    // Start AI message listener (connects to companion gateway)
    aiChatService.startListening();
    logger.info('🤖 AI chat service started');
  });
}
