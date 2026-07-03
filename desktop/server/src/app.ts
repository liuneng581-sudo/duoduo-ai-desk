import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import logger from './utils/logger';
import { rateLimit } from './middleware/rateLimit';

const app = express();

// Security
app.use(helmet({
  contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
}));
app.use(cors({
  // Production: only allow the exact CLIENT_URL origin plus the Electron
  // renderer's fixed origin (http://localhost:3001 — the packaged app loads the
  // SPA from there). The previous wildcard `localhost(:\d+)?` allowed any local
  // port; narrow it to just the renderer port. Dev: allow the Vite dev origin.
  origin: env.NODE_ENV === 'production'
    ? ['http://localhost:3001', env.CLIENT_URL].filter(Boolean)
    : env.CLIENT_URL,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logging
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`, {
    query: req.query,
    ip: req.ip,
  });
  next();
});

// API routes
app.use('/api', rateLimit({ windowMs: 60_000, max: 300, keySuffix: 'global' }));
app.use('/api', routes);

// In production (Electron packaged), serve the client SPA
if (env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // SPA fallback — serve index.html for any non-API route
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
    logger.info(`📁 Serving static files from ${clientDist}`);
  } else {
    logger.warn(`⚠️ Client dist not found at ${clientDist}`);
  }
}

// 404
app.use((_req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// Global error handler
app.use(errorHandler);

export default app;
