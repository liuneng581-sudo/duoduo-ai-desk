"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardController = void 0;
const dashboard_service_1 = require("../services/dashboard.service");
const gateway_1 = require("../services/companion/gateway");
const express_1 = require("../types/express");
exports.dashboardController = {
    async getOverview(req, res) {
        try {
            const userId = req.user.userId;
            const data = await dashboard_service_1.dashboardService.getOverview(userId);
            res.json({ data });
        }
        catch (err) {
            res.status(500).json({ error: '查询失败' });
        }
    },
    async getStoreSummary(req, res) {
        try {
            const storeId = (0, express_1.param)(req, 'storeId');
            const data = await dashboard_service_1.dashboardService.getStoreSummary(storeId);
            if (!data) {
                res.status(404).json({ error: '店铺不存在' });
                return;
            }
            res.json({ data });
        }
        catch (err) {
            res.status(500).json({ error: '查询失败' });
        }
    },
    /** Live revenue/order stats pulled from PDD on demand (manual refresh). */
    async getStoreRevenue(req, res) {
        try {
            const storeId = (0, express_1.param)(req, 'storeId');
            const stats = await gateway_1.companionGateway.requestStats(storeId);
            res.json({ data: stats });
        }
        catch (err) {
            // companion offline / store not running / PDD timeout — surface as 503 so
            // the page can show "请先启动店铺" rather than a generic error.
            res.status(503).json({ error: err.message || '获取门店数据失败' });
        }
    },
};
//# sourceMappingURL=dashboard.controller.js.map