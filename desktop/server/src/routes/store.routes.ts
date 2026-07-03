import { Router } from 'express';
import { storeController } from '../controllers/store.controller';
import { authMiddleware } from '../middleware/auth';
import { requireStoreAccess } from '../middleware/storeAccess';
import productRoutes from './product.routes';
import qaRoutes from './qa.routes';

const router = Router();

router.get('/', authMiddleware, storeController.list);
router.post('/', authMiddleware, storeController.create);
router.get('/:storeId', authMiddleware, requireStoreAccess, storeController.get);
router.put('/:storeId', authMiddleware, requireStoreAccess, storeController.update);
router.delete('/:storeId', authMiddleware, requireStoreAccess, storeController.remove);

// Product knowledge base, scoped to a store: /stores/:storeId/products/...
router.use('/:storeId/products', productRoutes);

// Q&A knowledge base, scoped to a store: /stores/:storeId/qa/...
router.use('/:storeId/qa', qaRoutes);

export default router;
