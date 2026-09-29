const GOLD = '#c9a45c';
const GOLD_BRIGHT = '#e6c77e';

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Always-available portrait: dark circle, gold initials, thin gold ring. */
export function generatedAvatar(name: string): string {
  const initials =
    (name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?';
  const rotation = hashString(name || 'unknown') % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="Portrait of ${escapeXml(name)}">
  <defs><radialGradient id="bg" cx="50%" cy="35%" r="75%"><stop offset="0%" stop-color="#24242e"/><stop offset="100%" stop-color="#101014"/></radialGradient></defs>
  <rect width="256" height="256" fill="#0c0c0f"/>
  <circle cx="128" cy="128" r="118" fill="url(#bg)"/>
  <circle cx="128" cy="128" r="112" fill="none" stroke="${GOLD}" stroke-opacity="0.55" stroke-width="2"/>
  <circle cx="128" cy="128" r="104" fill="none" stroke="${GOLD}" stroke-opacity="0.18" stroke-width="1" stroke-dasharray="4 6" transform="rotate(${rotation} 128 128)"/>
  <text x="128" y="128" text-anchor="middle" dominant-baseline="central" font-family="Cinzel, Georgia, serif" font-size="86" font-weight="700" fill="${GOLD_BRIGHT}">${escapeXml(initials)}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Swap a broken remote image for the generated avatar. */
export function onPortraitError(name: string) {
  return (event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    const fallback = generatedAvatar(name);
    if (img.src !== fallback) img.src = fallback;
  };
}
