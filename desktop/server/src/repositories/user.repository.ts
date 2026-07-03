import prisma from '../config/database';

export const userRepository = {
  findByEmail: (email: string) =>
    prisma.user.findUnique({ where: { email } }),

  findById: (id: string) =>
    prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, avatarUrl: true, role: true, createdAt: true },
    }),

  create: (data: { email: string; passwordHash: string; name: string }) =>
    prisma.user.create({ data }),

  updateProfile: (id: string, data: { name?: string; avatarUrl?: string | null }) =>
    prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, avatarUrl: true, role: true, createdAt: true },
    }),
};
