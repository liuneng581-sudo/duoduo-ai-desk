"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardService = void 0;
const dashboard_repository_1 = require("../repositories/dashboard.repository");
exports.dashboardService = {
    getOverview: (userId) => dashboard_repository_1.dashboardRepository.getOverview(userId),
    getStoreSummary: (storeId) => dashboard_repository_1.dashboardRepository.getStoreSummary(storeId),
};
//# sourceMappingURL=dashboard.service.js.map