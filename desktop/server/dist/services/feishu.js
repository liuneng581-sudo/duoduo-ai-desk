"use strict";
/**
 * Feishu (Lark) Bot Notification Service
 *
 * Uses Feishu Webhook Bot to push notifications to a group chat.
 * Webhook URL format: https://open.feishu.cn/open-apis/bot/v2/hook/{hook-id}
 *
 * Set up:
 * 1. In Feishu, create a group chat → Settings → Bots → Add Bot → Custom Bot
 * 2. Copy the webhook URL
 * 3. Paste into our Settings page
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.feishuService = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const LEVEL_COLORS = {
    error: 'red',
    warning: 'yellow',
    info: 'blue',
};
const LEVEL_ICONS = {
    error: '🔴',
    warning: '🟡',
    info: '🔵',
};
exports.feishuService = {
    /**
     * Send a card notification via webhook.
     */
    async send(webhookUrl, payload) {
        const color = LEVEL_COLORS[payload.level] || 'blue';
        const icon = LEVEL_ICONS[payload.level] || '🔵';
        const card = {
            header: {
                title: { tag: 'plain_text', content: `${icon} ${payload.title}` },
                template: color,
            },
            elements: [
                {
                    tag: 'div',
                    text: {
                        tag: 'lark_md',
                        content: [
                            payload.storeName ? `**店铺**：${payload.storeName}\n` : '',
                            payload.content,
                        ].join(''),
                    },
                },
            ],
        };
        // Add action button if provided
        if (payload.action && payload.actionUrl) {
            card.elements.push({
                tag: 'action',
                actions: [{
                        tag: 'button',
                        text: { tag: 'plain_text', content: payload.action },
                        url: payload.actionUrl,
                        type: 'primary',
                    }],
            });
        }
        // Add timestamp
        card.elements.push({
            tag: 'hr',
        });
        card.elements.push({
            tag: 'note',
            elements: [{
                    tag: 'plain_text',
                    content: `多多AI客服 · ${new Date().toLocaleString('zh-CN')}`,
                }],
        });
        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ msg_type: 'interactive', card }),
                signal: AbortSignal.timeout(10000),
            });
            // Feishu's v2 webhook (/open-apis/bot/v2/hook/) returns { code, msg };
            // the legacy /bot/hook/ endpoint used { StatusCode }. Accept either so
            // both endpoint generations report success correctly.
            const result = await response.json();
            const ok = result.code === 0 || result.StatusCode === 0;
            if (ok) {
                logger_1.default.info('Feishu notification sent');
                return true;
            }
            else {
                logger_1.default.error('Feishu notification failed', { code: result.code ?? result.StatusCode, msg: result.msg });
                return false;
            }
        }
        catch (err) {
            logger_1.default.error('Feishu notification error', { error: err.message });
            return false;
        }
    },
    /**
     * Send a simple text notification.
     */
    async sendText(webhookUrl, text) {
        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ msg_type: 'text', content: { text } }),
                signal: AbortSignal.timeout(10000),
            });
            const result = await response.json();
            return result.code === 0 || result.StatusCode === 0;
        }
        catch {
            return false;
        }
    },
    /**
     * Send alert for store login needed.
     */
    async notifyLoginRequired(webhookUrl, storeName, dashboardUrl) {
        await this.send(webhookUrl, {
            title: '需要登录拼多多',
            content: `请在本地浏览器窗口中完成「${storeName}」的登录。如果收到验证码，请及时处理。`,
            level: 'warning',
            storeName,
            action: '查看详情',
            actionUrl: dashboardUrl,
        });
    },
    /**
     * Send alert for captcha / verification needed.
     */
    async notifyCaptchaRequired(webhookUrl, storeName, dashboardUrl) {
        await this.send(webhookUrl, {
            title: '需要完成拼多多验证',
            content: `店铺「${storeName}」登录过程中需要验证码、滑块或安全验证，请及时在本地浏览器窗口中处理。`,
            level: 'warning',
            storeName,
            action: '查看详情',
            actionUrl: dashboardUrl,
        });
    },
    /**
     * Send alert when AI confidence is low / needs human intervention.
     */
    async notifyHumanNeeded(webhookUrl, storeName, conversationId, reason) {
        await this.send(webhookUrl, {
            title: '需要人工介入',
            content: `**原因**：${reason}\n**对话ID**：${conversationId}`,
            level: 'error',
            storeName,
        });
    },
    /**
     * Send alert on system error.
     */
    async notifyError(webhookUrl, storeName, error) {
        await this.send(webhookUrl, {
            title: '系统异常',
            content: `店铺「${storeName}」发生异常：${error}`,
            level: 'error',
            storeName,
        });
    },
    /**
     * Send daily summary.
     */
    async notifyDailySummary(webhookUrl, stats) {
        await this.send(webhookUrl, {
            title: '每日经营摘要',
            content: [
                `**管理店铺**：${stats.stores} 个`,
                `**今日对话**：${stats.conversations} 条`,
                `**今日订单**：${stats.orders} 单`,
                `**今日营收**：¥${stats.revenue.toLocaleString()}`,
            ].join('\n'),
            level: 'info',
        });
    },
};
//# sourceMappingURL=feishu.js.map