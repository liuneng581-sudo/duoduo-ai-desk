"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
/**
 * GET /api/ai/status
 * Check AI service is listening.
 */
router.get('/status', auth_1.authMiddleware, (_req, res) => {
    res.json({
        data: {
            listening: true,
        },
    });
});
exports.default = router;
//# sourceMappingURL=ai.routes.js.map