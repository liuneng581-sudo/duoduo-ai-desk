import { Router } from 'express';
import { chatController } from '../controllers/chat.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/conversations/:conversationId', authMiddleware, chatController.getConversation);
router.post('/conversations/:conversationId/reply', authMiddleware, chatController.replyManual);

export default router;
