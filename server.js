import http from 'http';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

import { runSeed } from './server/db/seed.js';
import { initSocket } from './server/services/realtime.js';
import { checkDeadlinesAndNotify } from './server/services/notifications.js';
import { query } from './server/db/pool.js';

import authRoutes from './server/routes/auth.js';
import userRoutes from './server/routes/users.js';
import projectRoutes from './server/routes/projects.js';
import taskRoutes from './server/routes/tasks.js';
import commentRoutes from './server/routes/comments.js';
import fileRoutes from './server/routes/files.js';
import calendarRoutes from './server/routes/calendar.js';
import notificationRoutes from './server/routes/notifications.js';
import analyticsRoutes from './server/routes/analytics.js';
import settingsRoutes from './server/routes/settings.js';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  await runSeed();

  const app = express();
  const httpServer = http.createServer(app);

  // Initialize Socket.IO attached to the same HTTP server on port 3000
  initSocket(httpServer);

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false, // Allow preview iframe embedding
    })
  );

  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please wait a few minutes.' },
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await query('SELECT 1');
      res.json({ status: 'ok', service: 'TaskUpCard API', database: 'connected' });
    } catch (err) {
      console.error('[DB] Health check failed:', err.message);
      res.status(503).json({ status: 'error', service: 'TaskUpCard API', database: 'disconnected' });
    }
  });

  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/comments', commentRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/calendar', calendarRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/settings', settingsRoutes);

  // Global API error handler (handles Multer errors cleanly)
  app.use('/api', (err, _req, res, _next) => {
    console.error('[API Error]', err);
    res.status(err.status || 400).json({ error: err.message || 'Request failed.' });
  });

  if (isProduction) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[TaskUpCard] Server listening on http://0.0.0.0:${PORT}`);
    checkDeadlinesAndNotify();
    setInterval(checkDeadlinesAndNotify, 30 * 60 * 1000);
  });
}

startServer().catch((err) => {
  console.error('[TaskUpCard] Fatal startup error:', err);
  process.exit(1);
});
