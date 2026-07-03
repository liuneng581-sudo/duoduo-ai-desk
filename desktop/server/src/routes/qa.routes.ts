import { Router, Request, Response, NextFunction } from 'express';
import multer, { MulterError } from 'multer';
import { qaController } from '../controllers/qa.controller';
import { authMiddleware } from '../middleware/auth';
import { requireStoreAccess } from '../middleware/storeAccess';

// Excel imports parsed in-memory (never written to disk), capped at 5MB.
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

// Mounted under /stores/:storeId/qa — every route requires store ownership.
const router = Router({ mergeParams: true });

router.get('/', authMiddleware, requireStoreAccess, qaController.list);
router.get('/template', authMiddleware, requireStoreAccess, qaController.template);
router.get('/export', authMiddleware, requireStoreAccess, qaController.exportExcel);
router.post('/', authMiddleware, requireStoreAccess, qaController.create);
router.post('/import', authMiddleware, requireStoreAccess, uploadFile, qaController.importExcel);
router.put('/:qaId', authMiddleware, requireStoreAccess, qaController.update);
router.delete('/:qaId', authMiddleware, requireStoreAccess, qaController.remove);

export default router;
