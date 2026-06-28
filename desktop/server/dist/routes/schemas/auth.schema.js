"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
/**
 * Validation schemas for auth endpoints. Enforced server-side via the
 * `validate` middleware — client-side rules (RegisterPage) are bypassable, so
 * email format and password length must be checked here too.
 */
exports.registerSchema = zod_1.z.object({
    email: zod_1.z.string().trim().toLowerCase().email('邮箱格式不正确'),
    password: zod_1.z.string().min(6, '密码至少 6 位').max(128, '密码过长'),
    name: zod_1.z.string().trim().min(1, '请输入姓名').max(50, '姓名过长'),
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().trim().toLowerCase().email('邮箱格式不正确'),
    password: zod_1.z.string().min(1, '请输入密码').max(128),
});
//# sourceMappingURL=auth.schema.js.map