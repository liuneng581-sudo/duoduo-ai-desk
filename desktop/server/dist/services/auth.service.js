"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = void 0;
const user_repository_1 = require("../repositories/user.repository");
const password_1 = require("../utils/password");
const jwt_1 = require("../utils/jwt");
const database_1 = __importDefault(require("../config/database"));
const TOKEN_VERSION_KEY = 'token_version';
async function getTokenVersion(userId) {
    const row = await database_1.default.systemConfig.findUnique({
        where: { userId_key: { userId, key: TOKEN_VERSION_KEY } },
        select: { value: true },
    });
    return row ? Number(row.value) || 0 : 0;
}
async function bumpTokenVersion(userId) {
    const next = (await getTokenVersion(userId)) + 1;
    await database_1.default.systemConfig.upsert({
        where: { userId_key: { userId, key: TOKEN_VERSION_KEY } },
        update: { value: String(next) },
        create: { userId, key: TOKEN_VERSION_KEY, value: String(next) },
    });
    return next;
}
exports.authService = {
    async register(email, password, name) {
        const existing = await user_repository_1.userRepository.findByEmail(email);
        if (existing) {
            throw new Error('邮箱已注册');
        }
        const passwordHash = await (0, password_1.hashPassword)(password);
        const user = await user_repository_1.userRepository.create({ email, passwordHash, name });
        const tokenVersion = await getTokenVersion(user.id);
        const payload = { userId: user.id, email: user.email, role: user.role, tokenVersion };
        const accessToken = (0, jwt_1.signAccessToken)(payload);
        const refreshToken = (0, jwt_1.signRefreshToken)(payload);
        return {
            accessToken,
            refreshToken,
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
        };
    },
    async login(email, password) {
        const user = await user_repository_1.userRepository.findByEmail(email);
        if (!user) {
            throw new Error('邮箱或密码错误');
        }
        const valid = await (0, password_1.comparePassword)(password, user.passwordHash);
        if (!valid) {
            throw new Error('邮箱或密码错误');
        }
        const tokenVersion = await getTokenVersion(user.id);
        const payload = { userId: user.id, email: user.email, role: user.role, tokenVersion };
        const accessToken = (0, jwt_1.signAccessToken)(payload);
        const refreshToken = (0, jwt_1.signRefreshToken)(payload);
        return {
            accessToken,
            refreshToken,
            user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, role: user.role },
        };
    },
    async refresh(token) {
        const payload = (0, jwt_1.verifyRefreshToken)(token);
        const user = await user_repository_1.userRepository.findById(payload.userId);
        if (!user) {
            throw new Error('用户不存在');
        }
        // Reject refresh tokens issued before the last logout/revocation.
        const storedVersion = await getTokenVersion(user.id);
        if ((payload.tokenVersion ?? 0) !== storedVersion) {
            throw new Error('刷新令牌已失效');
        }
        const newPayload = { userId: user.id, email: user.email, role: user.role, tokenVersion: storedVersion };
        const accessToken = (0, jwt_1.signAccessToken)(newPayload);
        const newRefreshToken = (0, jwt_1.signRefreshToken)(newPayload);
        return { accessToken, refreshToken: newRefreshToken };
    },
    /** Invalidate all outstanding refresh tokens for the user (logout). */
    async logout(userId) {
        await bumpTokenVersion(userId);
    },
    async me(userId) {
        const user = await user_repository_1.userRepository.findById(userId);
        if (!user) {
            throw new Error('用户不存在');
        }
        return user;
    },
    /** Update the current user's display name (and optionally avatar). */
    async updateProfile(userId, data) {
        const patch = {};
        if (data.name !== undefined) {
            const n = data.name.trim();
            if (!n)
                throw new Error('昵称不能为空');
            patch.name = n.slice(0, 30);
        }
        if (data.avatarUrl !== undefined)
            patch.avatarUrl = data.avatarUrl;
        return user_repository_1.userRepository.updateProfile(userId, patch);
    },
};
//# sourceMappingURL=auth.service.js.map