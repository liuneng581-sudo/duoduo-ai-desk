"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeRepository = void 0;
const database_1 = __importDefault(require("../config/database"));
exports.storeRepository = {
    findByUser: (userId) => database_1.default.store.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
    }),
    findById: (id) => database_1.default.store.findUnique({ where: { id } }),
    create: (data) => database_1.default.store.create({ data }),
    update: (id, data) => database_1.default.store.update({ where: { id }, data }),
    delete: (id) => database_1.default.store.delete({ where: { id } }),
    updateBrowserState: (id, data) => database_1.default.store.update({ where: { id }, data }),
};
//# sourceMappingURL=store.repository.js.map