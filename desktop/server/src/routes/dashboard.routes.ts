import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { authMiddleware } from '../middleware/auth';
import { requireStoreAccess } from '../middleware/storeAccess';

const router = Router();

router.get('/overview', authMiddleware, dashboardController.getOverview);
router.get('/stores/:storeId/summary', authMiddleware, requireStoreAccess, dashboardController.getStoreSummary);
router.get('/stores/:storeId/revenue', authMiddleware, requireStoreAccess, dashboardController.getStoreRevenue);

export default router;
