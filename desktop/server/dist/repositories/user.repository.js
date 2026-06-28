"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRepository = void 0;
const database_1 = __importDefault(require("../config/database"));
exports.userRepository = {
    findByEmail: (email) => database_1.default.user.findUnique({ where: { email } }),
    findById: (id) => database_1.default.user.findUnique({
        where: { id },
        select: { id: true, email: true, name: true, avatarUrl: true, role: true, createdAt: true },
    }),
    create: (data) => database_1.default.user.create({ data }),
    updateProfile: (id, data) => database_1.default.user.update({
        where: { id },
        data,
        select: { id: true, email: true, name: true, avatarUrl: true, role: true, createdAt: true },
    }),
};
//# sourceMappingURL=user.repository.js.map