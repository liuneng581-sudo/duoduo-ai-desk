import prisma from '../config/database';

export const storeRepository = {
  findByUser: (userId: string) =>
    prisma.store.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    }),

  findById: (id: string) =>
    prisma.store.findUnique({ where: { id } }),

  create: (data: {
    userId: string; name: string; shopId?: string; description?: string;
    loginAccount?: string | null; loginPassword?: string | null;
  }) =>
    prisma.store.create({ data }),

  update: (id: string, data: {
    name?: string; shopId?: string; description?: string; status?: string;
    loginAccount?: string | null; loginPassword?: string | null;
    aiEnabled?: boolean; aiPauseOnSensitive?: boolean;
  }) =>
    prisma.store.update({ where: { id }, data }),

  delete: (id: string) =>
    prisma.store.delete({ where: { id } }),

  updateBrowserState: (id: string, data: {
    browserState?: string; cookieData?: string; cookieExpiresAt?: Date;
  }) =>
    prisma.store.update({ where: { id }, data }),
};
