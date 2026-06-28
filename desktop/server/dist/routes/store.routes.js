"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const store_controller_1 = require("../controllers/store.controller");
const auth_1 = require("../middleware/auth");
const storeAccess_1 = require("../middleware/storeAccess");
const product_routes_1 = __importDefault(require("./product.routes"));
const qa_routes_1 = __importDefault(require("./qa.routes"));
const router = (0, express_1.Router)();
router.get('/', auth_1.authMiddleware, store_controller_1.storeController.list);
router.post('/', auth_1.authMiddleware, store_controller_1.storeController.create);
router.get('/:storeId', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, store_controller_1.storeController.get);
router.put('/:storeId', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, store_controller_1.storeController.update);
router.delete('/:storeId', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, store_controller_1.storeController.remove);
// Product knowledge base, scoped to a store: /stores/:storeId/products/...
router.use('/:storeId/products', product_routes_1.default);
// Q&A knowledge base, scoped to a store: /stores/:storeId/qa/...
router.use('/:storeId/qa', qa_routes_1.default);
exports.default = router;
//# sourceMappingURL=store.routes.js.map