import { userRepository } from '../repositories/user.repository';
import { hashPassword, comparePassword } from '../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken, JwtPayload } from '../utils/jwt';
import prisma from '../config/database';

const TOKEN_VERSION_KEY = 'token_version';

async function getTokenVersion(userId: string): Promise<number> {
  const row = await prisma.systemConfig.findUnique({
    where: { userId_key: { userId, key: TOKEN_VERSION_KEY } },
    select: { value: true },
  });
  return row ? Number(row.value) || 0 : 0;
}

async function bumpTokenVersion(userId: string): Promise<number> {
  const next = (await getTokenVersion(userId)) + 1;
  await prisma.systemConfig.upsert({
    where: { userId_key: { userId, key: TOKEN_VERSION_KEY } },
    update: { value: String(next) },
    create: { userId, key: TOKEN_VERSION_KEY, value: String(next) },
  });
  return next;
}

export const authService = {
  async register(email: string, password: string, name: string) {
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new Error('邮箱已注册');
    }

    const passwordHash = await hashPassword(password);
    const user = await userRepository.create({ email, passwordHash, name });

    const tokenVersion = await getTokenVersion(user.id);
    const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role, tokenVersion };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  },

  async login(email: string, password: string) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new Error('邮箱或密码错误');
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      throw new Error('邮箱或密码错误');
    }

    const tokenVersion = await getTokenVersion(user.id);
    const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role, tokenVersion };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, role: user.role },
    };
  },

  async refresh(token: string) {
    const payload = verifyRefreshToken(token);
    const user = await userRepository.findById(payload.userId);
    if (!user) {
      throw new Error('用户不存在');
    }

    // Reject refresh tokens issued before the last logout/revocation.
    const storedVersion = await getTokenVersion(user.id);
    if ((payload.tokenVersion ?? 0) !== storedVersion) {
      throw new Error('刷新令牌已失效');
    }

    const newPayload: JwtPayload = { userId: user.id, email: user.email, role: user.role, tokenVersion: storedVersion };
    const accessToken = signAccessToken(newPayload);
    const newRefreshToken = signRefreshToken(newPayload);

    return { accessToken, refreshToken: newRefreshToken };
  },

  /** Invalidate all outstanding refresh tokens for the user (logout). */
  async logout(userId: string): Promise<void> {
    await bumpTokenVersion(userId);
  },

  async me(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('用户不存在');
    }
    return user;
  },

  /** Update the current user's display name (and optionally avatar). */
  async updateProfile(userId: string, data: { name?: string; avatarUrl?: string | null }) {
    const patch: { name?: string; avatarUrl?: string | null } = {};
    if (data.name !== undefined) {
      const n = data.name.trim();
      if (!n) throw new Error('昵称不能为空');
      patch.name = n.slice(0, 30);
    }
    if (data.avatarUrl !== undefined) patch.avatarUrl = data.avatarUrl;
    return userRepository.updateProfile(userId, patch);
  },
};
