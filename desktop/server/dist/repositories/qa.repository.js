"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.qaRepository = void 0;
const database_1 = __importDefault(require("../config/database"));
exports.qaRepository = {
    findByStore: (storeId, opts) => database_1.default.qAEntry.findMany({
        where: {
            storeId,
            ...(opts?.category ? { category: opts.category } : {}),
            ...(opts?.enabledOnly ? { enabled: true } : {}),
            ...(opts?.search
                ? {
                    OR: [
                        { question: { contains: opts.search } },
                        { answer: { contains: opts.search } },
                        { keywords: { contains: opts.search } },
                    ],
                }
                : {}),
        },
        orderBy: { updatedAt: 'desc' },
        // Default-bound the result set for the list/search view; callers that need
        // the full set (export) pass an explicit high take so a backup never
        // silently drops rows.
        take: opts?.take ?? 1000,
    }),
    /** Store-scoped lookup — guards against cross-store access (IDOR). */
    findByIdInStore: (storeId, id) => database_1.default.qAEntry.findFirst({ where: { id, storeId } }),
    create: (storeId, data) => database_1.default.qAEntry.create({ data: { storeId, ...data } }),
    /** Store-scoped update — updateMany so a wrong-store id affects 0 rows, not another tenant's. */
    updateInStore: (storeId, id, data) => database_1.default.qAEntry.updateMany({ where: { id, storeId }, data }),
    /** Store-scoped delete — deleteMany returns count, 0 when the id isn't in this store. */
    deleteInStore: (storeId, id) => database_1.default.qAEntry.deleteMany({ where: { id, storeId } }),
};
//# sourceMappingURL=qa.repository.js.map