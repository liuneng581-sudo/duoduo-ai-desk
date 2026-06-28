"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.conversationRepository = void 0;
const database_1 = __importDefault(require("../config/database"));
exports.conversationRepository = {
    findById: (id) => database_1.default.conversation.findUnique({
        where: { id },
        select: {
            id: true,
            storeId: true,
            context: true,
            status: true,
            title: true,
            orderSn: true,
            relatedGoodsIds: true,
            createdAt: true,
            updatedAt: true,
            store: { select: { userId: true } },
            messages: {
                select: {
                    id: true,
                    role: true,
                    content: true,
                    tokenCount: true,
                    metadata: true,
                    createdAt: true,
                },
                orderBy: { createdAt: 'asc' },
            },
        },
    }),
    findByStore: (storeId, limit = 50) => database_1.default.conversation.findMany({
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
        take: limit,
    }),
};
//# sourceMappingURL=conversation.repository.js.map