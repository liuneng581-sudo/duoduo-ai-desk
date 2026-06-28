"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const env_1 = require("./config/env");
const routes_1 = __importDefault(require("./routes"));
const errorHandler_1 = require("./middleware/errorHandler");
const logger_1 = __importDefault(require("./utils/logger"));
const rateLimit_1 = require("./middleware/rateLimit");
const app = (0, express_1.default)();
// Security
app.use((0, helmet_1.default)({
    contentSecurityPolicy: env_1.env.NODE_ENV === 'production' ? undefined : false,
}));
app.use((0, cors_1.default)({
    // Production: only allow the exact CLIENT_URL origin plus the Electron
    // renderer's fixed origin (http://localhost:3001 — the packaged app loads the
    // SPA from there). The previous wildcard `localhost(:\d+)?` allowed any local
    // port; narrow it to just the renderer port. Dev: allow the Vite dev origin.
    origin: env_1.env.NODE_ENV === 'production'
        ? ['http://localhost:3001', env_1.env.CLIENT_URL].filter(Boolean)
        : env_1.env.CLIENT_URL,
    credentials: true,
}));
// Body parsing
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
// Request logging
app.use((req, _res, next) => {
    logger_1.default.debug(`${req.method} ${req.path}`, {
        query: req.query,
        ip: req.ip,
    });
    next();
});
// API routes
app.use('/api', (0, rateLimit_1.rateLimit)({ windowMs: 60_000, max: 300, keySuffix: 'global' }));
app.use('/api', routes_1.default);
// In production (Electron packaged), serve the client SPA
if (env_1.env.NODE_ENV === 'production') {
    const clientDist = path_1.default.resolve(__dirname, '../../client/dist');
    if (fs_1.default.existsSync(clientDist)) {
        app.use(express_1.default.static(clientDist));
        // SPA fallback — serve index.html for any non-API route
        app.get('*', (_req, res) => {
            res.sendFile(path_1.default.join(clientDist, 'index.html'));
        });
        logger_1.default.info(`📁 Serving static files from ${clientDist}`);
    }
    else {
        logger_1.default.warn(`⚠️ Client dist not found at ${clientDist}`);
    }
}
// 404
app.use((_req, res) => {
    res.status(404).json({ error: '接口不存在' });
});
// Global error handler
app.use(errorHandler_1.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map