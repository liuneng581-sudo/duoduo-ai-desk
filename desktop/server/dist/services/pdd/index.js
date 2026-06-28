"use strict";
/**
 * Pinduoduo Browser Automation Service
 *
 * Main entry point for the Playwright-based Pinduoduo chat integration.
 *
 * Architecture:
 *   sessionPool (manages browser lifecycle per store)
 *     └── browserManager (Chromium launch + login)
 *          └── wsInterceptor (WebSocket hijack → message events)
 *               └── AI Engine (Claude/OpenAI → generates reply)
 *                    └── wsInterceptor.sendReply (response back to Pinduoduo)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.wsInterceptor = exports.browserManager = exports.sessionPool = void 0;
var sessionPool_1 = require("./sessionPool");
Object.defineProperty(exports, "sessionPool", { enumerable: true, get: function () { return sessionPool_1.sessionPool; } });
var browserManager_1 = require("./browserManager");
Object.defineProperty(exports, "browserManager", { enumerable: true, get: function () { return browserManager_1.browserManager; } });
var wsInterceptor_1 = require("./wsInterceptor");
Object.defineProperty(exports, "wsInterceptor", { enumerable: true, get: function () { return wsInterceptor_1.wsInterceptor; } });
//# sourceMappingURL=index.js.map