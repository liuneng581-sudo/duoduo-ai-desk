import prisma from '../config/database';

export interface AnnouncementInput {
  title: string;
  content: string;
  level?: string;
  active?: boolean;
}

export const announcementService = {
  /** List all active announcements, newest first (for client display). */
  async listActive() {
    return prisma.announcement.findMany({
      where: { active: true },
      orderBy: { publishedAt: 'desc' },
    });
  },

  /** List all announcements (admin view). */
  async listAll() {
    return prisma.announcement.findMany({
      orderBy: { publishedAt: 'desc' },
    });
  },

  /** Create a new announcement. */
  async create(data: AnnouncementInput) {
    return prisma.announcement.create({
      data: {
        title: data.title,
        content: data.content,
        level: data.level || 'info',
        active: data.active !== undefined ? data.active : true,
      },
    });
  },

  /** Update an existing announcement. Returns null if not found. */
  async update(id: string, data: Partial<AnnouncementInput>) {
    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) return null;
    return prisma.announcement.update({
      where: { id },
      data,
    });
  },

  /** Delete an announcement. Returns true if deleted, false if not found. */
  async remove(id: string) {
    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) return false;
    await prisma.announcement.delete({ where: { id } });
    return true;
  },
};
