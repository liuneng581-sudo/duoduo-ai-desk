import { Router } from 'express';
import authRoutes from './auth.routes';
import licenseRoutes from './license.routes';
import dashboardRoutes from './dashboard.routes';
import chatRoutes from './chat.routes';
import pddRoutes from './pdd.routes';
import aiRoutes from './ai.routes';
import storeRoutes from './store.routes';
import settingsRoutes from './settings.routes';
import imageRoutes from './image.routes';
import announcementRoutes from './announcement.routes';
import prisma from '../config/database';

const router = Router();

router.use('/auth', authRoutes);
router.use('/license', licenseRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/chat', chatRoutes);
router.use('/pdd', pddRoutes);
router.use('/ai', aiRoutes);
router.use('/stores', storeRoutes);
router.use('/settings', settingsRoutes);
router.use('/images', imageRoutes);
router.use('/announcements', announcementRoutes);

router.get('/health', async (_req, res) => {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {}
  res.json({
    status: dbOk ? 'ok' : 'degraded',
    database: dbOk ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

export default router;
