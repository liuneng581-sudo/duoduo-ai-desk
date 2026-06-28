"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatController = void 0;
const conversation_repository_1 = require("../repositories/conversation.repository");
const database_1 = __importDefault(require("../config/database"));
const express_1 = require("../types/express");
const gateway_1 = require("../services/companion/gateway");
const sanitizeReply_1 = require("../utils/sanitizeReply");
const logger_1 = __importDefault(require("../utils/logger"));
exports.chatController = {
    async getConversation(req, res) {
        try {
            const conversationId = (0, express_1.param)(req, 'conversationId');
            const conv = await conversation_repository_1.conversationRepository.findById(conversationId);
            if (!conv) {
                res.status(404).json({ error: '对话不存在' });
                return;
            }
            // Verify the conversation belongs to a store owned by this user
            if (conv.store?.userId !== req.user?.userId) {
                res.status(404).json({ error: '对话不存在' });
                return;
            }
            // Resolve the products this conversation is linked to (goods_id → KB) so the
            // UI can show "this conversation is about these products / this order".
            let relatedProducts = [];
            const goodsIds = conv.relatedGoodsIds ? JSON.parse(conv.relatedGoodsIds) : [];
            if (goodsIds.length > 0) {
                relatedProducts = await database_1.default.product.findMany({
                    where: { storeId: conv.storeId, externalId: { in: goodsIds } },
                    select: { name: true, price: true, productUrl: true },
                });
            }
            res.json({
                data: {
                    id: conv.id,
                    context: conv.context,
                    status: conv.status,
                    title: conv.title,
                    orderSn: conv.orderSn,
                    relatedProducts,
                    createdAt: conv.createdAt,
                    updatedAt: conv.updatedAt,
                    messages: conv.messages.map((m) => ({
                        id: m.id,
                        role: m.role,
                        content: m.content,
                        tokenCount: m.tokenCount,
                        createdAt: m.createdAt,
                    })),
                },
            });
        }
        catch (err) {
            res.status(500).json({ error: '查询失败' });
        }
    },
    /**
     * POST /chat/conversations/:conversationId/reply — human takeover.
     * The minimal "AI couldn't handle it, let me step in" path: the owner sends one
     * message to the customer through the companion, and the conversation is marked
     * active again. This is a safety net, not a full agent console — the product is
     * AI-first; humans only step in on handoffs.
     */
    async replyManual(req, res) {
        try {
            const conversationId = (0, express_1.param)(req, 'conversationId');
            const raw = typeof req.body?.content === 'string' ? req.body.content : '';
            const content = (0, sanitizeReply_1.sanitizeForCustomer)(raw).trim();
            if (!content) {
                res.status(400).json({ error: '回复内容不能为空' });
                return;
            }
            if (content.length > 1000) {
                res.status(400).json({ error: '回复内容过长，请控制在 1000 字以内' });
                return;
            }
            const conv = await conversation_repository_1.conversationRepository.findById(conversationId);
            if (!conv || conv.store?.userId !== req.user?.userId) {
                res.status(404).json({ error: '对话不存在' });
                return;
            }
            // The customer's PDD uid is the conversation's customerId — that's what the
            // companion addresses send_reply to.
            const full = await database_1.default.conversation.findUnique({
                where: { id: conversationId },
                select: { customerId: true },
            });
            if (!full?.customerId) {
                res.status(409).json({ error: '该对话缺少客户标识，无法发送' });
                return;
            }
            // Same compliance gate as AI replies — a human can also type something that
            // trips a PDD red line (站外引流/极限词/诱导好评). Block before it sends.
            const compliance = (0, sanitizeReply_1.checkCompliance)(content);
            if (!compliance.ok) {
                res.status(422).json({ error: `回复可能违反平台规则（${compliance.category || '敏感内容'}），请修改后再发送` });
                return;
            }
            const sent = gateway_1.companionGateway.sendReply(conv.storeId, full.customerId, content);
            if (!sent) {
                res.status(503).json({ error: '店铺未在线，无法发送，请先在店铺页连接' });
                return;
            }
            // The send already happened (irreversible). Persist + clear the handoff flag
            // in their OWN try/catch: if the DB write fails now, we must NOT return 500,
            // because the owner would re-send and the customer would get the message
            // twice. A missing history row is the lesser evil — report success.
            try {
                await database_1.default.message.create({
                    data: {
                        conversationId,
                        role: 'assistant',
                        content,
                        tokenCount: Math.ceil(content.length / 4),
                        metadata: JSON.stringify({ manual: true }),
                    },
                });
                await database_1.default.conversation.update({
                    where: { id: conversationId },
                    data: { status: 'active', updatedAt: new Date() },
                });
            }
            catch (persistErr) {
                logger_1.default.error('Manual reply sent but persist failed', { conversationId, message: persistErr?.message });
            }
            logger_1.default.info(`[${conv.storeId}] Manual reply sent for conv ${conversationId}`);
            res.json({ message: '已发送', data: { content } });
        }
        catch (err) {
            logger_1.default.error('Manual reply failed', { message: err?.message });
            res.status(500).json({ error: '发送失败' });
        }
    },
};
//# sourceMappingURL=chat.controller.js.map