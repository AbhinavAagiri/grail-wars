/**
 * Site feedback endpoint.
 *
 * The recipient address lives only in the server's environment and is never
 * sent to the browser. Delivery uses `FEEDBACK_WEBHOOK_URL` when configured —
 * any endpoint that converts a JSON POST into an email (Formspree, a Google
 * Apps Script web app, Zapier, …). Without a webhook the submission is logged
 * and kept in memory so the game still works with zero configuration.
 */
import { Router, type Request, type Response } from 'express';
import express from 'express';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../logger';

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const KEEP_IN_MEMORY = 50;

const feedbackSchema = z.object({
  name: z.string().trim().max(60).optional().default(''),
  email: z.string().trim().max(160).optional().default(''),
  topic: z.enum(['bug', 'idea', 'balance', 'other']).optional().default('other'),
  message: z.string().trim().min(4).max(2000),
  /** honeypot — real people never fill this in */
  company: z.string().max(200).optional().default(''),
});

interface StoredFeedback {
  at: number;
  topic: string;
  name: string;
  email: string;
  message: string;
  delivered: boolean;
}

/** In-memory inbox, newest last. Purely so a single-process deploy can review. */
const inbox: StoredFeedback[] = [];

export function recentFeedback(): readonly StoredFeedback[] {
  return inbox;
}

async function deliver(entry: Omit<StoredFeedback, 'delivered' | 'at'>): Promise<boolean> {
  const url = config.FEEDBACK_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        to: config.FEEDBACK_TO,
        subject: `Grail Wars feedback (${entry.topic})`,
        name: entry.name || 'Anonymous',
        replyTo: entry.email || undefined,
        message: entry.message,
        site: 'Grail Wars',
      }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch (err) {
    logger.warn({ err }, 'feedback webhook failed');
    return false;
  }
}

export function createFeedbackRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '16kb' }));

  const attempts = new Map<string, number[]>();

  const rateLimited = (ip: string): boolean => {
    const now = Date.now();
    const recent = (attempts.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    recent.push(now);
    attempts.set(ip, recent);
    if (attempts.size > 5000) attempts.clear();
    return recent.length > RATE_MAX;
  };

  router.post('/api/feedback', async (req: Request, res: Response) => {
    const parsed = feedbackSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Please write a short message (4+ characters).' });
      return;
    }
    const body = parsed.data;

    // Silently accept honeypot hits so bots see no difference.
    if (body.company) {
      res.json({ ok: true });
      return;
    }

    const ip = req.ip ?? 'unknown';
    if (rateLimited(ip)) {
      res.status(429).json({ ok: false, error: 'Too many messages — try again later.' });
      return;
    }

    const delivered = await deliver({
      topic: body.topic,
      name: body.name,
      email: body.email,
      message: body.message,
    });

    inbox.push({
      at: Date.now(),
      delivered,
      topic: body.topic,
      name: body.name,
      email: body.email,
      message: body.message,
    });
    if (inbox.length > KEEP_IN_MEMORY) inbox.shift();

    if (!delivered) {
      // No webhook configured: the message is safe in memory/logs, and the user
      // still gets a clean success state instead of a scary error.
      logger.warn(
        { topic: body.topic, length: body.message.length },
        'feedback received but no FEEDBACK_WEBHOOK_URL is configured — stored in memory only',
      );
    } else {
      logger.info({ topic: body.topic }, 'feedback delivered');
    }

    res.json({ ok: true });
  });

  return router;
}
