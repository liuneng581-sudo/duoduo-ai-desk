import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * GET /api/ai/status
 * Check AI service is listening.
 */
router.get('/status', authMiddleware, (_req, res) => {
  res.json({
    data: {
      listening: true,
    },
  });
});

export default router;
