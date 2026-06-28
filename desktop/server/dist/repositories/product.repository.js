"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.productRepository = void 0;
const database_1 = __importDefault(require("../config/database"));
exports.productRepository = {
    findByStore: (storeId, opts) => database_1.default.product.findMany({
        where: {
            storeId,
            ...(opts?.category ? { category: opts.category } : {}),
            ...(opts?.search
                ? { OR: [{ name: { contains: opts.search } }, { description: { contains: opts.search } }] }
                : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take: opts?.take ?? 200,
        skip: opts?.skip ?? 0,
    }),
    countByStore: (storeId, opts) => database_1.default.product.count({
        where: {
            storeId,
            ...(opts?.category ? { category: opts.category } : {}),
            ...(opts?.search
                ? { OR: [{ name: { contains: opts.search } }, { description: { contains: opts.search } }] }
                : {}),
        },
    }),
    findById: (id) => database_1.default.product.findUnique({ where: { id } }),
    /** Store-scoped lookup — guards against cross-store access (IDOR). */
    findByIdInStore: (storeId, id) => database_1.default.product.findFirst({ where: { id, storeId } }),
    create: (storeId, data) => database_1.default.product.create({ data: { storeId, ...data } }),
    update: (id, data) => database_1.default.product.update({ where: { id }, data }),
    /** Store-scoped update — updateMany so a wrong-store id affects 0 rows, not another tenant's. */
    updateInStore: (storeId, id, data) => database_1.default.product.updateMany({ where: { id, storeId }, data }),
    delete: (id) => database_1.default.product.delete({ where: { id } }),
    /** Store-scoped delete — deleteMany returns count, 0 when the id isn't in this store. */
    deleteInStore: (storeId, id) => database_1.default.product.deleteMany({ where: { id, storeId } }),
    /**
     * Upsert by (storeId, externalId) — used by Excel import to dedupe re-imports.
     * Rows without an externalId can't be deduped, so they always create.
     */
    upsertByExternalId: (storeId, data) => {
        if (!data.externalId) {
            return database_1.default.product.create({ data: { storeId, ...data } });
        }
        return database_1.default.product.upsert({
            where: { storeId_externalId: { storeId, externalId: data.externalId } },
            create: { storeId, ...data },
            update: { ...data },
        });
    },
};
//# sourceMappingURL=product.repository.js.map