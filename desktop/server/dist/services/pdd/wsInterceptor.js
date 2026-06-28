"use strict";
/**
 * WebSocket interception.
 *
 * Pinduoduo's merchant chat page uses an internal WebSocket to
 * communicate with their messaging servers. We intercept this
 * WebSocket to receive customer messages and send AI replies.
 *
 * NOTE: The exact WebSocket URL and message format are reverse-engineered
 * from the Pinduoduo merchant backend and may change. This module
 * provides a logging-first approach: when first connecting, we log ALL
 * WebSocket traffic so you can identify the correct message format.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wsInterceptor = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
exports.wsInterceptor = {
    /** Active WebSocket connections, keyed by storeId */
    activeSockets: new Map(),
    /**
     * Start intercepting WebSocket connections on a page.
     * When a WebSocket is created on the page, we hook into it.
     */
    attach(page, storeId, onMessage) {
        page.on('websocket', (ws) => {
            const wsUrl = ws.url();
            logger_1.default.info(`[${storeId}] WebSocket opened: ${wsUrl}`);
            // Log all traffic on first connect for debugging
            let firstFrame = true;
            ws.on('framesent', (frame) => {
                if (firstFrame) {
                    logger_1.default.debug(`[${storeId}] WS → sent: ${frame.payload.slice(0, 200)}`);
                }
            });
            ws.on('framereceived', (frame) => {
                if (firstFrame) {
                    logger_1.default.debug(`[${storeId}] WS ← recv: ${frame.payload.slice(0, 200)}`);
                    firstFrame = false;
                }
                try {
                    const payload = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString();
                    const msg = parseMessage(payload, storeId);
                    if (msg) {
                        onMessage(msg);
                    }
                }
                catch (err) {
                    // Ignore parse errors — not all frames are customer messages
                }
            });
            ws.on('close', () => {
                logger_1.default.warn(`[${storeId}] WebSocket closed`);
                exports.wsInterceptor.activeSockets.delete(storeId);
            });
            exports.wsInterceptor.activeSockets.set(storeId, ws);
        });
    },
    /**
     * Send a reply through the intercepted WebSocket.
     * NOTE: PDD uses binary Titan protocol over WS — not directly writable.
     * HTTP send_message is the primary send path (see companion/index.ts).
     */
    async sendReply(storeId, _reply) {
        logger_1.default.warn(`[${storeId}] WS sendReply not supported — use HTTP send_message instead`);
        return false;
    },
};
/**
 * Try to parse a WebSocket frame into a customer message.
 *
 * NOTE: This is a template — the actual message format depends on
 * Pinduoduo's internal protocol. When first deployed, set LOG_LEVEL=debug
 * and examine the logged WebSocket frames to determine the exact format.
 *
 * Common patterns observed in community projects:
 * - Message type field: "type" or "msgType" or "commandType"
 * - Customer messages typically have type: "message" or "chat_message"
 * - Heartbeat messages should be ignored
 */
function parseMessage(payload, storeId) {
    let data;
    try {
        data = JSON.parse(payload);
    }
    catch {
        return null; // Not JSON — ignore binary/heartbeat frames
    }
    // Log unknown message types for protocol discovery
    const type = (data.type || data.msgType || data.commandType);
    if (!type) {
        // Unrecognized format — log once per session for debugging
        return null;
    }
    // Ignore system messages
    if (['HeartBeat', 'Heartbeat', 'Ack', 'pong', 'system'].includes(type)) {
        return null;
    }
    // Check if this is a customer message
    // (Exact type name depends on Pinduoduo's protocol — adjust after observing traffic)
    const isCustomerMessage = type === 'message' ||
        type === 'chat_message' ||
        type === 'customer_message' ||
        type.includes('Msg');
    if (!isCustomerMessage) {
        return null;
    }
    // Extract message fields
    const msgId = (data.msgId || data.id || data.messageId || '');
    const conversationId = (data.conversationId || data.sessionId || data.chatId || '');
    const content = (data.content || data.text || data.body || '');
    const msgType = (data.msgType || data.messageType || 'text');
    const timestamp = (data.timestamp || data.time || data.sendTime || Date.now());
    if (!content || !conversationId) {
        return null;
    }
    logger_1.default.debug(`[${storeId}] Message received: conv=${conversationId} type=${msgType} content=${content.slice(0, 50)}`);
    return {
        msgId,
        conversationId,
        customerId: data.customerId,
        content,
        msgType,
        timestamp: typeof timestamp === 'number' ? timestamp : Date.now(),
        raw: data,
    };
}
/**
 * Format a reply to send through the WebSocket.
 * Format depends on Pinduoduo's protocol. Adjust after observing traffic.
 */
function formatReply(reply) {
    return JSON.stringify({
        type: 'send_message',
        conversationId: reply.conversationId,
        content: reply.content,
        msgType: reply.msgType || 'text',
    });
}
//# sourceMappingURL=wsInterceptor.js.map