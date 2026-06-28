"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardRepository = void 0;
const database_1 = __importDefault(require("../config/database"));
const time_1 = require("../utils/time");
exports.dashboardRepository = {
    /**
     * Get aggregated stats across all user's stores.
     */
    async getOverview(userId) {
        const stores = await database_1.default.store.findMany({
            where: { userId },
            select: {
                id: true,
                name: true,
                status: true,
                browserState: true,
                _count: {
                    select: {
                        conversations: true,
                        orders: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
        // Get conversation stats per store
        const storeIds = stores.map((s) => s.id);
        const conversationStats = storeIds.length > 0
            ? await database_1.default.conversation.groupBy({
                by: ['storeId', 'status'],
                where: { storeId: { in: storeIds } },
                _count: true,
            })
            : [];
        const todayStart = (0, time_1.startOfTodayShanghai)();
        const todayOrders = storeIds.length > 0
            ? await database_1.default.order.groupBy({
                by: ['storeId'],
                where: {
                    storeId: { in: storeIds },
                    createdAt: { gte: todayStart },
                },
                _count: true,
                _sum: { totalAmount: true },
            })
            : [];
        const todayConversations = storeIds.length > 0
            ? await database_1.default.conversation.findMany({
                where: {
                    storeId: { in: storeIds },
                    updatedAt: { gte: todayStart },
                },
                select: {
                    id: true,
                    storeId: true,
                    context: true,
                    status: true,
                },
            })
            : [];
        // Build store cards
        return stores.map((store) => {
            const convStats = conversationStats.filter((c) => c.storeId === store.id);
            const activeConvs = convStats.filter((c) => c.status === 'active').reduce((s, c) => s + c._count, 0);
            const resolvedConvs = convStats.filter((c) => c.status === 'resolved').reduce((s, c) => s + c._count, 0);
            const storeOrders = todayOrders.find((o) => o.storeId === store.id);
            const storeConvs = todayConversations.filter((c) => c.storeId === store.id);
            return {
                id: store.id,
                name: store.name,
                status: store.status,
                browserState: store.browserState,
                totalConversations: store._count.conversations,
                activeConversations: activeConvs,
                resolvedConversations: resolvedConvs,
                todayOrders: storeOrders?._count ?? 0,
                todayRevenue: storeOrders?._sum?.totalAmount ?? 0,
                todayConversations: storeConvs.length,
                // Conversations needing attention (active for long time — simplified)
                needsAttention: storeConvs.filter((c) => c.status === 'active').length,
            };
        });
    },
    /**
     * Get single store dashboard summary.
     */
    async getStoreSummary(storeId) {
        const store = await database_1.default.store.findUnique({
            where: { id: storeId },
            select: { id: true, name: true, status: true, browserState: true },
        });
        if (!store)
            return null;
        const todayStart = (0, time_1.startOfTodayShanghai)();
        const [todayOrders, todayConvs, recentConvs, recentOrders] = await Promise.all([
            database_1.default.order.findMany({
                where: { storeId, createdAt: { gte: todayStart } },
                select: { id: true, status: true, totalAmount: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 10,
            }),
            database_1.default.conversation.findMany({
                where: { storeId, updatedAt: { gte: todayStart } },
                select: {
                    id: true,
                    context: true,
                    status: true,
                    title: true,
                    updatedAt: true,
                    messages: {
                        select: { role: true, content: true, createdAt: true },
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                    },
                },
                orderBy: { updatedAt: 'desc' },
                take: 20,
            }),
            database_1.default.conversation.findMany({
                where: { storeId },
                select: {
                    id: true,
                    context: true,
                    status: true,
                    title: true,
                    updatedAt: true,
                    messages: {
                        select: { role: true, content: true, createdAt: true },
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                    },
                },
                orderBy: { updatedAt: 'desc' },
                take: 50,
            }),
            // recentOrders must NOT be filtered to today — "recent" means latest
            // orders regardless of date. (Previously it reused todayOrders, so a store
            // with no orders today showed an empty list despite having order history.)
            database_1.default.order.findMany({
                where: { storeId },
                select: { id: true, status: true, totalAmount: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 10,
            }),
        ]);
        return {
            ...store,
            todayOrderCount: todayOrders.length,
            todayRevenue: todayOrders.reduce((s, o) => s + o.totalAmount, 0),
            todayConversationCount: todayConvs.length,
            activeConversationCount: todayConvs.filter((c) => c.status === 'active').length,
            recentConversations: recentConvs.map((c) => ({
                id: c.id,
                context: c.context,
                status: c.status,
                title: c.title,
                lastMessage: c.messages[0]?.content?.slice(0, 100) ?? '',
                lastMessageRole: c.messages[0]?.role ?? null,
                updatedAt: c.updatedAt,
            })),
            recentOrders: recentOrders,
        };
    },
};
//# sourceMappingURL=dashboard.repository.js.map