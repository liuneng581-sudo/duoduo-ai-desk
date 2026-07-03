import { Router, Request, Response, NextFunction } from 'express';
import multer, { MulterError } from 'multer';
import { productController } from '../controllers/product.controller';
import { authMiddleware } from '../middleware/auth';
import { requireStoreAccess } from '../middleware/storeAccess';

// Excel imports are parsed in-memory (never written to disk) and capped at 5MB —
// a catalog spreadsheet is tiny; anything larger is almost certainly a mistake.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.originalname.toLowerCase().endsWith('.xlsx');
    if (ok) cb(null, true);
    else cb(new Error('仅支持 .xlsx 文件'));
  },
});

// Wrap upload.single so multer errors (file too large / wrong type) return a
// clean 4xx instead of falling through to the generic 500 error handler.
function uploadFile(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: any) => {
    if (!err) return next();
    if (err instanceof MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? '文件过大，最大 5MB' : '文件上传失败';
      return res.status(413).json({ error: msg });
    }
    return res.status(400).json({ error: err.message || '文件无效' });
  });
}

// Mounted under /stores/:storeId/products — every route requires store ownership.
const router = Router({ mergeParams: true });

router.get('/', authMiddleware, requireStoreAccess, productController.list);
router.get('/template', authMiddleware, requireStoreAccess, productController.template);
router.get('/export', authMiddleware, requireStoreAccess, productController.exportExcel);
router.get('/sync-status', authMiddleware, requireStoreAccess, productController.syncStatus);
router.post('/', authMiddleware, requireStoreAccess, productController.create);
router.post('/import', authMiddleware, requireStoreAccess, uploadFile, productController.importExcel);
router.post('/sync-from-pdd', authMiddleware, requireStoreAccess, productController.syncFromPdd);
router.get('/:productId', authMiddleware, requireStoreAccess, productController.get);
router.put('/:productId', authMiddleware, requireStoreAccess, productController.update);
router.delete('/:productId', authMiddleware, requireStoreAccess, productController.remove);

export default router;
