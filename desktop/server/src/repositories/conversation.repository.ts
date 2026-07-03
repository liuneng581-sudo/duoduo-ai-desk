import prisma from '../config/database';

export const conversationRepository = {
  findById: (id: string) =>
    prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        storeId: true,
        context: true,
        status: true,
        title: true,
        orderSn: true,
        relatedGoodsIds: true,
        createdAt: true,
        updatedAt: true,
        store: { select: { userId: true } },
        messages: {
          select: {
            id: true,
            role: true,
            content: true,
            tokenCount: true,
            metadata: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),

  findByStore: (storeId: string, limit = 50) =>
    prisma.conversation.findMany({
      where: { storeId },
      select: {
        id: true,
        context: true,
        status: true,
        title: true,
        updatedAt: true,
        messages: {
          select: { role: true, content: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    }),
};
