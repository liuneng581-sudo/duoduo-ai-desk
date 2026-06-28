"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importStar(require("multer"));
const product_controller_1 = require("../controllers/product.controller");
const auth_1 = require("../middleware/auth");
const storeAccess_1 = require("../middleware/storeAccess");
// Excel imports are parsed in-memory (never written to disk) and capped at 5MB —
// a catalog spreadsheet is tiny; anything larger is almost certainly a mistake.
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.originalname.toLowerCase().endsWith('.xlsx');
        if (ok)
            cb(null, true);
        else
            cb(new Error('仅支持 .xlsx 文件'));
    },
});
// Wrap upload.single so multer errors (file too large / wrong type) return a
// clean 4xx instead of falling through to the generic 500 error handler.
function uploadFile(req, res, next) {
    upload.single('file')(req, res, (err) => {
        if (!err)
            return next();
        if (err instanceof multer_1.MulterError) {
            const msg = err.code === 'LIMIT_FILE_SIZE' ? '文件过大，最大 5MB' : '文件上传失败';
            return res.status(413).json({ error: msg });
        }
        return res.status(400).json({ error: err.message || '文件无效' });
    });
}
// Mounted under /stores/:storeId/products — every route requires store ownership.
const router = (0, express_1.Router)({ mergeParams: true });
router.get('/', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, product_controller_1.productController.list);
router.get('/template', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, product_controller_1.productController.template);
router.get('/export', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, product_controller_1.productController.exportExcel);
router.get('/sync-status', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, product_controller_1.productController.syncStatus);
router.post('/', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, product_controller_1.productController.create);
router.post('/import', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, uploadFile, product_controller_1.productController.importExcel);
router.post('/sync-from-pdd', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, product_controller_1.productController.syncFromPdd);
router.get('/:productId', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, product_controller_1.productController.get);
router.put('/:productId', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, product_controller_1.productController.update);
router.delete('/:productId', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, product_controller_1.productController.remove);
exports.default = router;
//# sourceMappingURL=product.routes.js.map