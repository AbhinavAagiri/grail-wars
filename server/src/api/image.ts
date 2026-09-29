import { Router, type Request, type Response } from 'express';
import { LRUCache } from 'lru-cache';
import multer from 'multer';
import { LIMITS } from '@hgd/shared';
import { config, userAgent } from '../config';
import { logger } from '../logger';
import { UnsafeUrlError, assertSafeImageUrl, looksLikeHttpUrl } from '../security/url';
import { getImage, putImage } from '../util/mediaStore';

const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/avif',
];

const cache = new LRUCache<string, { bytes: Buffer; contentType: string }>({
  max: 200,
  ttl: 30 * 60 * 1000,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.UPLOAD_MAX_BYTES, files: 1 },
});

/** Detect real image types from magic bytes rather than trusting the header. */
export function sniffImageType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.slice(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.slice(4, 8).toString('ascii') === 'ftyp') return 'image/avif';
  return null;
}

/** Optional sharp: used for normalisation when the binary happens to be present. */
async function loadSharp(): Promise<((input: Buffer) => any) | null> {
  try {
    const specifier = 'sharp';
    const mod = (await import(/* @vite-ignore */ specifier)) as any;
    const fn = mod?.default ?? mod;
    return typeof fn === 'function' ? fn : null;
  } catch {
    return null;
  }
}

export function createImageRouter(): Router {
  const router = Router();

  router.get('/media/:id', (req: Request, res: Response) => {
    const item = getImage(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.setHeader('content-type', item.contentType);
    res.setHeader('cache-control', 'public, max-age=14400');
    res.send(item.bytes);
  });

  router.get('/api/image-proxy', async (req: Request, res: Response) => {
    const raw = typeof req.query.url === 'string' ? req.query.url : '';
    if (!looksLikeHttpUrl(raw)) {
      res.status(400).json({ error: 'Invalid url' });
      return;
    }
    const cached = cache.get(raw);
    if (cached) {
      res.setHeader('content-type', cached.contentType);
      res.setHeader('cache-control', 'public, max-age=86400');
      res.send(cached.bytes);
      return;
    }

    let url: URL;
    try {
      url = await assertSafeImageUrl(raw);
    } catch (err) {
      const message = err instanceof UnsafeUrlError ? err.message : 'Blocked url';
      res.status(400).json({ error: message });
      return;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      let response: globalThis.Response;
      try {
        response = await fetch(url.toString(), {
          signal: controller.signal,
          redirect: 'follow',
          headers: { 'user-agent': userAgent(), accept: 'image/*' },
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        res.status(502).json({ error: `Upstream ${response.status}` });
        return;
      }
      const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
        res.status(415).json({ error: 'Unsupported image type' });
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      let bytes = Buffer.from(arrayBuffer);
      if (bytes.byteLength > LIMITS.IMAGE_PROXY_MAX_BYTES) {
        res.status(413).json({ error: 'Image too large' });
        return;
      }

      const sharp = await loadSharp();
      if (sharp) {
        try {
          bytes = await sharp(bytes).resize(600, 600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
          cache.set(raw, { bytes, contentType: 'image/jpeg' });
          res.setHeader('content-type', 'image/jpeg');
          res.setHeader('cache-control', 'public, max-age=86400');
          res.send(bytes);
          return;
        } catch {
          // fall through to the raw bytes
        }
      }

      cache.set(raw, { bytes, contentType });
      res.setHeader('content-type', contentType);
      res.setHeader('cache-control', 'public, max-age=86400');
      res.send(bytes);
    } catch (err) {
      logger.debug({ err }, 'image proxy failed');
      res.status(502).json({ error: 'Could not fetch image' });
    }
  });

  router.post('/api/upload', upload.single('image'), async (req: Request, res: Response) => {
    const file = req.file;
    if (!file?.buffer?.length) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    if (file.buffer.byteLength > LIMITS.UPLOAD_MAX_BYTES) {
      res.status(413).json({ error: 'File too large' });
      return;
    }
    const sniffed = sniffImageType(file.buffer);
    if (!sniffed) {
      res.status(415).json({ error: 'Only PNG, JPEG, WEBP, GIF or AVIF images are allowed' });
      return;
    }

    try {
      const sharp = await loadSharp();
      let bytes = file.buffer;
      let contentType = sniffed;
      if (sharp) {
        bytes = await sharp(file.buffer).resize(512, 512, { fit: 'cover' }).jpeg({ quality: 84 }).toBuffer();
        contentType = 'image/jpeg';
      }
      const url = putImage(bytes, contentType);
      res.json({ url, normalized: Boolean(sharp) });
    } catch (err) {
      logger.warn({ err }, 'upload failed');
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  return router;
}
