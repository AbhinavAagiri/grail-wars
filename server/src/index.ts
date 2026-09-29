import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { config } from './config';
import { logger } from './logger';
import { createSearchRouter } from './api/search';
import { createImageRouter } from './api/image';
import { createFeedbackRouter } from './api/feedback';
import { RoomManager } from './rooms/RoomManager';
import { registerHandlers } from './socket/handlers';
import { mediaStats } from './util/mediaStore';

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  }),
);

if (!config.isProd) {
  app.use(
    cors({
      origin: [config.CLIENT_ORIGIN, `http://localhost:${config.PORT}`, 'http://127.0.0.1:5173'],
      credentials: true,
    }),
  );
}

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, ...managerRef.get()?.stats(), media: mediaStats() });
});

app.use('/api/search', apiLimiter);
app.use('/api/image-proxy', apiLimiter);
app.use('/api/upload', uploadLimiter);
app.use(createSearchRouter());
app.use(createImageRouter());
app.use(createFeedbackRouter());

/* ------------------------------------------------------------------ */
/* Static client                                                       */
/* ------------------------------------------------------------------ */

// Resolve relative to this file (server/src in dev, server/dist in prod) so the
// built client is found no matter what the current working directory is.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/media') || req.path.startsWith('/socket.io')) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.type('text/plain').send(
      'Grail Wars server is running. Run `npm run build` in the client to serve the UI.',
    );
  });
}

/* ------------------------------------------------------------------ */
/* Realtime                                                            */
/* ------------------------------------------------------------------ */

const io = new Server(server, {
  cors: config.isProd ? undefined : { origin: config.CLIENT_ORIGIN, credentials: true },
  maxHttpBufferSize: 1e6,
});

// The manager needs per-room broadcast helpers that target the room's sockets.
const manager = new RoomManager(
  (code) => (event, payload) => {
    io.to(code).emit(event, payload);
  },
  (code) => (playerId, event, payload) => {
    for (const socket of io.sockets.sockets.values()) {
      const data = socket.data as { code?: string; playerId?: string };
      if (data.code === code && data.playerId === playerId) socket.emit(event, payload);
    }
  },
);

const managerRef = { get: () => manager };
manager.startSweeper();
registerHandlers(io, manager);

server.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, env: config.NODE_ENV, llm: config.llmEnabled ? config.LLM_PROVIDER : 'off' },
    'Grail Wars listening',
  );
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  manager.stop();
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { app, server, io, manager };
