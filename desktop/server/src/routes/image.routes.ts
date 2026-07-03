import { Router } from 'express';
import { imageController } from '../controllers/image.controller';
import { authMiddleware } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();

// Image generation is costly (calls paid AI APIs) — throttle per user/IP.
const generateLimiter = rateLimit({ windowMs: 60_000, max: 10, keySuffix: 'img-gen', message: '图片生成过于频繁，请稍后再试' });

router.post('/generate', authMiddleware, generateLimiter, imageController.generate);
router.get('/history', authMiddleware, imageController.history);
router.delete('/:id', authMiddleware, imageController.remove);

export default router;
