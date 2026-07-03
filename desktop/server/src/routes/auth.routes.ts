import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { registerSchema, loginSchema } from './schemas/auth.schema';

const router = Router();

// Brute-force protection on auth endpoints (per-IP fixed window).
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keySuffix: 'login', message: '登录尝试过于频繁，请 15 分钟后再试' });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, keySuffix: 'register', message: '注册过于频繁，请稍后再试' });
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keySuffix: 'refresh' });

router.post('/register', registerLimiter, validate(registerSchema), authController.register);
router.post('/login', loginLimiter, validate(loginSchema), authController.login);
router.post('/refresh', refreshLimiter, authController.refresh);
router.post('/logout', authMiddleware, authController.logout);
router.get('/me', authMiddleware, authController.me);
router.patch('/me', authMiddleware, authController.updateMe);

export default router;
