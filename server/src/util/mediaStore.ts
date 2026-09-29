import { nanoid } from 'nanoid';

interface StoredImage {
  bytes: Buffer;
  contentType: string;
  expiresAt: number;
}

const TTL_MS = 4 * 60 * 60 * 1000;
const MAX_ITEMS = 500;

const store = new Map<string, StoredImage>();

function sweep(): void {
  const now = Date.now();
  for (const [id, item] of store) {
    if (item.expiresAt <= now) store.delete(id);
  }
  // Hard cap in case a room uploads thousands of images.
  while (store.size > MAX_ITEMS) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

export function putImage(bytes: Buffer, contentType: string): string {
  sweep();
  const id = nanoid(16);
  store.set(id, { bytes, contentType, expiresAt: Date.now() + TTL_MS });
  return `/media/${id}`;
}

export function getImage(id: string): StoredImage | undefined {
  sweep();
  return store.get(id);
}

export function mediaStats(): { count: number } {
  return { count: store.size };
}
