import { JwtPayload } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      /** Narrowed param helper for Express 5 compatibility */
      param(name: string): string;
    }
  }
}

/** Narrow req.params[id] to string for Express 5 compat */
export function param(req: { params: Record<string, string | string[]> }, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

export {};
