import { Request, Response, NextFunction } from 'express';
import { licenseService } from '../services/license.service';
import logger from '../utils/logger';

/**
 * Activation gate (replaces JWT login).
 *
 * This is a single-machine, license-activated desktop app — there is no account
 * login. Access is gated on whether THIS machine is activated. When it is, we
 * attach the single license-owner user to req.user, so every downstream handler
 * that reads req.user.userId keeps working unchanged.
 *
 * Unactivated requests get 401 with code NOT_ACTIVATED, which the client maps to
 * the activation page.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const activated = await licenseService.isActivated();
    if (!activated) {
      res.status(401).json({ error: '应用未激活', code: 'NOT_ACTIVATED' });
      return;
    }
    const userId = await licenseService.ensureOwnerUser();
    req.user = { userId, email: 'owner@local', role: 'admin' };
    next();
  } catch (error: any) {
    logger.warn('Activation check failed', { error: error?.message || error });
    res.status(401).json({ error: '应用未激活', code: 'NOT_ACTIVATED' });
  }
}
