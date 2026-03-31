import { Request, Response, NextFunction } from 'express';
import { getUserByToken, checkRateLimit } from '../storage/sessions';
import { User } from '../types/index';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const user = getUserByToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const allowed = checkRateLimit(user.id, 100, 3600000);
  if (!allowed) {
    res.status(429).json({ error: 'Rate limit exceeded: 100 requests per hour' });
    return;
  }

  req.user = user;
  next();
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  const configuredSecret = process.env.ADMIN_SECRET;
  // Reject if ADMIN_SECRET is not configured — avoids undefined === undefined bypass
  if (!configuredSecret) {
    res.status(403).json({ error: 'Admin access not configured on this server' });
    return;
  }
  const secret = req.headers['x-admin-secret'] || req.headers.authorization?.slice(7);
  if (!secret || secret !== configuredSecret) {
    res.status(403).json({ error: 'Invalid admin secret' });
    return;
  }
  next();
}
