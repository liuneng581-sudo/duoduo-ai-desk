import prisma from '../config/database';

export type ProductInput = {
  externalId?: string | null;
  name: string;
  description?: string | null;
  price: number;
  stock?: number;
  category?: string | null;
  productUrl?: string | null;
  imageUrls?: string | null;
  freight?: string | null;
  material?: string | null;
  specs?: string | null;
  shippingTime?: string | null;
  lastSyncedAt?: Date | null;
  status?: string;
};

export const productRepository = {
  findByStore: (storeId: string, opts?: { search?: string; category?: string; take?: number; skip?: number }) =>
    prisma.product.findMany({
      where: {
        storeId,
        ...(opts?.category ? { category: opts.category } : {}),
        ...(opts?.search
          ? { OR: [{ name: { contains: opts.search } }, { description: { contains: opts.search } }] }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: opts?.take ?? 200,
      skip: opts?.skip ?? 0,
    }),

  countByStore: (storeId: string, opts?: { search?: string; category?: string }) =>
    prisma.product.count({
      where: {
        storeId,
        ...(opts?.category ? { category: opts.category } : {}),
        ...(opts?.search
          ? { OR: [{ name: { contains: opts.search } }, { description: { contains: opts.search } }] }
          : {}),
      },
    }),

  findById: (id: string) => prisma.product.findUnique({ where: { id } }),

  /** Store-scoped lookup — guards against cross-store access (IDOR). */
  findByIdInStore: (storeId: string, id: string) =>
    prisma.product.findFirst({ where: { id, storeId } }),

  create: (storeId: string, data: ProductInput) =>
    prisma.product.create({ data: { storeId, ...data } }),

  update: (id: string, data: Partial<ProductInput>) =>
    prisma.product.update({ where: { id }, data }),

  /** Store-scoped update — updateMany so a wrong-store id affects 0 rows, not another tenant's. */
  updateInStore: (storeId: string, id: string, data: Partial<ProductInput>) =>
    prisma.product.updateMany({ where: { id, storeId }, data }),

  delete: (id: string) => prisma.product.delete({ where: { id } }),

  /** Store-scoped delete — deleteMany returns count, 0 when the id isn't in this store. */
  deleteInStore: (storeId: string, id: string) =>
    prisma.product.deleteMany({ where: { id, storeId } }),

  /**
   * Upsert by (storeId, externalId) — used by Excel import to dedupe re-imports.
   * Rows without an externalId can't be deduped, so they always create.
   */
  upsertByExternalId: (storeId: string, data: ProductInput) => {
    if (!data.externalId) {
      return prisma.product.create({ data: { storeId, ...data } });
    }
    return prisma.product.upsert({
      where: { storeId_externalId: { storeId, externalId: data.externalId } },
      create: { storeId, ...data },
      update: { ...data },
    });
  },
};
