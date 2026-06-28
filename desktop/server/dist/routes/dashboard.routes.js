"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboard_controller_1 = require("../controllers/dashboard.controller");
const auth_1 = require("../middleware/auth");
const storeAccess_1 = require("../middleware/storeAccess");
const router = (0, express_1.Router)();
router.get('/overview', auth_1.authMiddleware, dashboard_controller_1.dashboardController.getOverview);
router.get('/stores/:storeId/summary', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, dashboard_controller_1.dashboardController.getStoreSummary);
router.get('/stores/:storeId/revenue', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, dashboard_controller_1.dashboardController.getStoreRevenue);
exports.default = router;
//# sourceMappingURL=dashboard.routes.js.map