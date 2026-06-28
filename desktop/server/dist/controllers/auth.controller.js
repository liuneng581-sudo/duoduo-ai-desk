"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = void 0;
const auth_service_1 = require("../services/auth.service");
exports.authController = {
    async register(req, res) {
        try {
            const { email, password, name } = req.body;
            const result = await auth_service_1.authService.register(email, password, name);
            res.cookie('refreshToken', result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production', // set true in production
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/api/auth',
            });
            res.json({
                accessToken: result.accessToken,
                user: result.user,
            });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    },
    async login(req, res) {
        try {
            const { email, password } = req.body;
            const result = await auth_service_1.authService.login(email, password);
            res.cookie('refreshToken', result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/api/auth',
            });
            res.json({
                accessToken: result.accessToken,
                user: result.user,
            });
        }
        catch (error) {
            res.status(401).json({ error: error.message });
        }
    },
    async refresh(req, res) {
        try {
            const token = req.cookies?.refreshToken;
            if (!token) {
                res.status(401).json({ error: '缺少刷新令牌' });
                return;
            }
            const result = await auth_service_1.authService.refresh(token);
            res.cookie('refreshToken', result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/api/auth',
            });
            res.json({ accessToken: result.accessToken });
        }
        catch {
            res.status(401).json({ error: '刷新令牌无效' });
        }
    },
    async me(req, res) {
        try {
            const user = await auth_service_1.authService.me(req.user.userId);
            res.json(user);
        }
        catch {
            res.status(404).json({ error: '用户不存在' });
        }
    },
    async updateMe(req, res) {
        try {
            const { name, avatarUrl } = req.body;
            const user = await auth_service_1.authService.updateProfile(req.user.userId, { name, avatarUrl });
            res.json(user);
        }
        catch (err) {
            res.status(400).json({ error: err.message || '更新失败' });
        }
    },
    async logout(req, res) {
        try {
            // Bump token version so all outstanding refresh tokens are invalidated.
            await auth_service_1.authService.logout(req.user.userId);
            res.clearCookie('refreshToken', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                path: '/api/auth',
            });
            res.json({ message: '已退出' });
        }
        catch {
            res.status(500).json({ error: '退出失败' });
        }
    },
};
//# sourceMappingURL=auth.controller.js.map