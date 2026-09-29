/** Small deterministic text helpers used across research, draft and sim. */

/** lowercase, strip accents, drop punctuation, collapse whitespace */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Canonical uniqueness key for a character. */
export function canonicalKey(provider: string, providerId: string | undefined, name: string, source: string): string {
  if (providerId) return normalize(`${provider}:${providerId}`);
  return normalize(`${name}|${source}`);
}

/** Remove control characters / angle brackets, collapse whitespace, clamp length. */
export function sanitizeText(input: unknown, maxLength: number): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Stable 32-bit string hash (used for deterministic tie-breaks). */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);
  let matches = 0;

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  return (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
}

/** Jaro-Winkler similarity in [0,1]. */
export function jaroWinkler(a: string, b: string): number {
  const s1 = normalize(a);
  const s2 = normalize(b);
  if (!s1.length || !s2.length) return 0;
  const j = jaro(s1, s2);
  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return j + prefix * 0.1 * (1 - j);
}

/**
 * Compare a search result title against the character name we asked for.
 * Names often carry a disambiguating suffix ("Krillin (Dragon Ball)").
 */
export function titleSimilarity(name: string, title: string): number {
  const target = normalize(name);
  const candidate = normalize(title);
  if (!target || !candidate) return 0;
  if (target === candidate) return 1;
  // Drop a trailing parenthetical qualifier before comparing.
  const stripped = normalize(title.replace(/\s*\([^)]*\)\s*$/, ''));
  const direct = jaroWinkler(target, candidate);
  const base = jaroWinkler(target, stripped);
  let score = Math.max(direct, base);
  if (stripped === target) score = Math.max(score, 0.96);
  if (candidate.startsWith(target) || stripped.startsWith(target)) score = Math.max(score, 0.9);
  // Penalise names that merely contain the target as a small fragment.
  if (target.length >= 4 && candidate.includes(target) && candidate.length > target.length * 2) {
    score = Math.min(score, 0.8);
  }
  return score;
}

/** Deterministic pick from a list using a numeric seed. */
export function pickSeeded<T>(list: readonly T[], seed: number): T {
  if (!list.length) throw new Error('pickSeeded called with an empty list');
  return list[Math.abs(Math.trunc(seed)) % list.length];
}

export function capitalize(input: string): string {
  return input ? input[0].toUpperCase() + input.slice(1) : input;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
