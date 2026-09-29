import { hashString } from './text';

/** Wrap a remote image in our proxy. Data URIs and local media are left as-is. */
export function proxyUrl(raw: string | undefined | null): string {
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('/media/') || raw.startsWith('/api/image-proxy')) {
    return raw;
  }
  if (!/^https?:\/\//i.test(raw)) return '';
  return `/api/image-proxy?url=${encodeURIComponent(raw)}`;
}

/**
 * True when a URL is one of our generated initials placeholders rather than a
 * real portrait. Callers use this to avoid treating a fallback as artwork —
 * e.g. a wiki hit with no thumbnail, which would otherwise shadow the real
 * image we find later in the waterfall.
 */
export function isPlaceholderImage(raw: string | undefined | null): boolean {
  if (!raw) return true;
  // Our own images are proxied, so the URL arrives percent-encoded.
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    value = raw;
  }
  if (value.includes('data:image/svg+xml')) return true;
  // AniList answers with a grey silhouette at .../character/large/default.jpg
  // for characters it has no artwork for; that is a placeholder, not a portrait.
  return /anilistcdn\/[^?]*\/default\.(?:jpg|jpeg|png)/i.test(value);
}

const GOLD = '#c9a45c';
const GOLD_BRIGHT = '#e6c77e';

/**
 * Always-available fallback: a dark circle with gold initials and a thin gold
 * ring, as an SVG data URI. (Mirrored in the client for offline use.)
 */
export function generatedAvatar(name: string): string {
  const initials = (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
  const hueSeed = hashString(name || 'unknown');
  const ringRotation = hueSeed % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="Portrait of ${escapeXml(name || 'unknown')}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#24242e"/>
      <stop offset="100%" stop-color="#101014"/>
    </radialGradient>
  </defs>
  <rect width="256" height="256" fill="#0c0c0f"/>
  <circle cx="128" cy="128" r="118" fill="url(#bg)"/>
  <circle cx="128" cy="128" r="112" fill="none" stroke="${GOLD}" stroke-opacity="0.55" stroke-width="2"/>
  <circle cx="128" cy="128" r="104" fill="none" stroke="${GOLD}" stroke-opacity="0.18" stroke-width="1"
    stroke-dasharray="4 6" transform="rotate(${ringRotation} 128 128)"/>
  <text x="128" y="128" text-anchor="middle" dominant-baseline="central"
    font-family="Cinzel, Georgia, serif" font-size="86" font-weight="700" fill="${GOLD_BRIGHT}">${escapeXml(initials)}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
