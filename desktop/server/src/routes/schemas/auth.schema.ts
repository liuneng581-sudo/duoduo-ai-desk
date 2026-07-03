import { z } from 'zod';

/**
 * Validation schemas for auth endpoints. Enforced server-side via the
 * `validate` middleware — client-side rules (RegisterPage) are bypassable, so
 * email format and password length must be checked here too.
 */
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少 6 位').max(128, '密码过长'),
  name: z.string().trim().min(1, '请输入姓名').max(50, '姓名过长'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('邮箱格式不正确'),
  password: z.string().min(1, '请输入密码').max(128),
});
