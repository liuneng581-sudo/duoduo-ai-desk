"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const logger_1 = __importDefault(require("./utils/logger"));
const database_1 = __importDefault(require("./config/database"));
const migrate_1 = require("./utils/migrate");
const gateway_1 = require("./services/companion/gateway");
const aiChat_service_1 = require("./services/ai/aiChat.service");
// Process-level backstops: surface stray async errors loudly instead of letting
// them silently hang a request or crash the process without a trace. Log and
// keep serving — an isolated rejection should not take down the whole server.
process.on('unhandledRejection', (reason) => {
    logger_1.default.error(`Unhandled promise rejection: ${reason?.message || reason}`, { stack: reason?.stack });
});
process.on('uncaughtException', (err) => {
    logger_1.default.error(`Uncaught exception: ${err.message}`, { stack: err.stack });
});
// ── DB init: runs on EVERY startup (idempotent) ──
// Applies any pending migrations via @prisma/client (no prisma CLI / no
// schema-engine needed in the packaged app — see utils/migrate.ts). This is the
// upgrade path: a new version's migrations get applied to the existing user DB
// on first launch. On a brand-new DB it applies all migrations from scratch.
async function autoInitDatabase() {
    await (0, migrate_1.runMigrations)();
    // Ensure there is at least one admin account to log in with. The shipped
    // template DB is empty (no demo data), so a fresh install needs a bootstrap
    // admin. Idempotent: only creates when no user exists.
    const userCount = await database_1.default.user.count();
    if (userCount === 0) {
        const adminPassword = process.env.SEED_ADMIN_PASSWORD || crypto_1.default.randomBytes(12).toString('base64url');
        const passwordHash = await bcryptjs_1.default.hash(adminPassword, 12);
        await database_1.default.user.create({
            data: { email: 'admin@pdd-ai.com', passwordHash, name: '管理员', role: 'admin' },
        });
        logger_1.default.info('👤 Bootstrap admin created: admin@pdd-ai.com');
        // Surface the generated password once so first-run login is possible. In the
        // packaged app this lands in duoduo-server.log.
        if (!process.env.SEED_ADMIN_PASSWORD) {
            logger_1.default.info(`   初始密码(请立即登录修改): ${adminPassword}`);
        }
    }
}
// Create HTTP server from Express app
const server = http_1.default.createServer(app_1.default);
// Attach WebSocket gateway for companion client
gateway_1.companionGateway.attach(server);
// Migrate + bootstrap BEFORE accepting requests, so the API never serves against
// an unmigrated/empty database. A migration failure is fatal — we refuse to
// serve a half-broken schema (better a hard failure than scattered 500s).
autoInitDatabase()
    .then(() => {
    logger_1.default.info('📦 Database ready');
    startListening();
})
    .catch((err) => {
    logger_1.default.error(`❌ Database migration failed — refusing to start: ${err.message}`, { stack: err.stack });
    // Exit non-zero: a broken schema must not serve traffic. Electron will show
    // the server failed to start rather than the app silently misbehaving.
    process.exit(1);
});
function startListening() {
    server.listen(env_1.env.PORT, env_1.env.BIND_HOST, () => {
        logger_1.default.info(`🚀 Server running on http://${env_1.env.BIND_HOST}:${env_1.env.PORT}`);
        logger_1.default.info(`📦 Environment: ${env_1.env.NODE_ENV}`);
        logger_1.default.info(`🌐 Client URL: ${env_1.env.CLIENT_URL}`);
        logger_1.default.info(`🔌 WebSocket: ws://localhost:${env_1.env.PORT}/ws`);
        // Auto-reset stale browser states (leftover from crashes)
        database_1.default.store.updateMany({
            where: { browserState: { in: ['connecting', 'needs_login', 'online', 'error'] } },
            data: { browserState: 'idle' },
        }).then((r) => {
            if (r.count > 0)
                logger_1.default.info(`🔧 Reset ${r.count} stale store states to idle`);
        }).catch(() => { });
        // Start AI message listener (connects to companion gateway)
        aiChat_service_1.aiChatService.startListening();
        logger_1.default.info('🤖 AI chat service started');
    });
}
//# sourceMappingURL=index.js.map