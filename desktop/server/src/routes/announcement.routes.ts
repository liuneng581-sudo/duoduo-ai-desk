import { Router } from 'express';
import { announcementController } from '../controllers/announcement.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Client-facing: get active announcements (requires auth)
router.get('/', authMiddleware, announcementController.listActive);

// Admin: list all (including inactive)
router.get('/all', authMiddleware, announcementController.listAll);

// Admin: create / update / delete
router.post('/', authMiddleware, announcementController.create);
router.put('/:id', authMiddleware, announcementController.update);
router.delete('/:id', authMiddleware, announcementController.remove);

export default router;
