import prisma from '../config/database';

export type QAInput = {
  question: string;
  answer: string;
  keywords?: string | null;
  category?: string | null;
  enabled?: boolean;
};

export const qaRepository = {
  findByStore: (storeId: string, opts?: { search?: string; category?: string; enabledOnly?: boolean; take?: number }) =>
    prisma.qAEntry.findMany({
      where: {
        storeId,
        ...(opts?.category ? { category: opts.category } : {}),
        ...(opts?.enabledOnly ? { enabled: true } : {}),
        ...(opts?.search
          ? {
              OR: [
                { question: { contains: opts.search } },
                { answer: { contains: opts.search } },
                { keywords: { contains: opts.search } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      // Default-bound the result set for the list/search view; callers that need
      // the full set (export) pass an explicit high take so a backup never
      // silently drops rows.
      take: opts?.take ?? 1000,
    }),

  /** Store-scoped lookup — guards against cross-store access (IDOR). */
  findByIdInStore: (storeId: string, id: string) =>
    prisma.qAEntry.findFirst({ where: { id, storeId } }),

  create: (storeId: string, data: QAInput) =>
    prisma.qAEntry.create({ data: { storeId, ...data } }),

  /** Store-scoped update — updateMany so a wrong-store id affects 0 rows, not another tenant's. */
  updateInStore: (storeId: string, id: string, data: Partial<QAInput>) =>
    prisma.qAEntry.updateMany({ where: { id, storeId }, data }),

  /** Store-scoped delete — deleteMany returns count, 0 when the id isn't in this store. */
  deleteInStore: (storeId: string, id: string) =>
    prisma.qAEntry.deleteMany({ where: { id, storeId } }),
};
