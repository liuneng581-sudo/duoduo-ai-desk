"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chat_controller_1 = require("../controllers/chat.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get('/conversations/:conversationId', auth_1.authMiddleware, chat_controller_1.chatController.getConversation);
router.post('/conversations/:conversationId/reply', auth_1.authMiddleware, chat_controller_1.chatController.replyManual);
exports.default = router;
//# sourceMappingURL=chat.routes.js.map