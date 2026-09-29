import { politePostJson } from '../../util/http';

const ENDPOINT = 'https://graphql.anilist.co';

export interface AniListCandidate {
  providerId: string;
  name: string;
  source: string;
  thumb: string;
  /**
   * Other names AniList holds for the character. Anime databases index the
   * legal name — Kirito is filed as "Kazuto Kirigaya" — with the name everyone
   * actually uses in `alternative`, so matching on `name` alone misses him.
   */
  aliases?: string[];
  /** the works the character appears in, romaji and English */
  titles?: string[];
  blurb?: string;
}

const SEARCH_QUERY = `
query ($q: String) {
  Page(perPage: 5) {
    characters(search: $q) {
      id
      name { full native userPreferred alternative }
      image { large }
      media(perPage: 2) { nodes { title { romaji english } } }
    }
  }
}`;

const DETAIL_QUERY = `
query ($id: Int) {
  Character(id: $id) {
    id
    name { full native userPreferred alternative }
    description(asHtml: false)
    image { large }
    media(perPage: 1) { nodes { title { romaji english } } }
  }
}`;

function mediaTitle(node: any): string {
  const title = node?.media?.nodes?.[0]?.title;
  return title?.english || title?.romaji || '';
}

/** Every romaji/English title the character's works are known by. */
export function mediaTitles(node: any): string[] {
  const nodes = node?.media?.nodes;
  if (!Array.isArray(nodes)) return [];
  const out: string[] = [];
  for (const item of nodes) {
    for (const value of [item?.title?.romaji, item?.title?.english]) {
      const clean = String(value ?? '').trim();
      if (clean && !out.includes(clean)) out.push(clean);
    }
  }
  return out;
}

/** AniList serves this grey silhouette when it holds no artwork for a character. */
const NO_ARTWORK_RE = /\/character\/(?:large|medium|small)\/default\.(?:jpg|jpeg|png)$/i;

export function hasArtwork(url: string): boolean {
  return Boolean(url) && !NO_ARTWORK_RE.test(url);
}

/** Every name AniList records for a character, most official first. */
export function nameVariants(node: any): string[] {
  const name = node?.name ?? {};
  const values = [
    name.full,
    name.userPreferred,
    name.native,
    ...(Array.isArray(name.alternative) ? name.alternative : []),
  ];
  const out: string[] = [];
  for (const value of values) {
    const clean = String(value ?? '').trim();
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}

/** "Kirito (キリト)" → "Kirito". */
export function bareName(value: string): string {
  return String(value ?? '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A search for "Kirito" should not look like it failed just because AniList
 * files him under "Kazuto Kirigaya". When the query is not part of the official
 * name but is one of the character's known aliases, show the alias.
 */
export function displayName(full: string, variants: string[], query: string): string {
  const asked = bareName(query).toLowerCase();
  if (!asked) return full;
  const official = bareName(full).toLowerCase().split(' ').filter(Boolean);
  if (official.includes(asked)) return full;
  for (const variant of variants) {
    const alias = bareName(variant);
    if (alias.toLowerCase() === asked) return alias;
  }
  return full;
}

function stripTags(html: string): string {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchAniList(query: string): Promise<AniListCandidate[]> {
  const payload = await politePostJson<any>(ENDPOINT, { query: SEARCH_QUERY, variables: { q: query } });
  const nodes = payload?.data?.Page?.characters;
  if (!Array.isArray(nodes)) return [];
  return nodes
    .map((n: any) => {
      const variants = nameVariants(n);
      const full = String(n?.name?.full ?? '').trim() || variants[0] || '';
      return {
        providerId: String(n?.id ?? ''),
        name: displayName(full, variants, query),
        source: mediaTitle(n) || 'Anime / Manga',
        thumb: hasArtwork(String(n?.image?.large ?? '')) ? String(n.image.large) : '',
        aliases: variants.filter((v) => v !== full),
        titles: mediaTitles(n),
      };
    })
    .filter((c: AniListCandidate) => c.providerId && c.name);
}

export interface AniListCharacter {
  providerId: string;
  name: string;
  source: string;
  description: string;
  imageUrl: string;
}

export async function getAniListCharacter(id: string): Promise<AniListCharacter | null> {
  const numeric = Number.parseInt(id, 10);
  if (!Number.isFinite(numeric)) return null;
  const payload = await politePostJson<any>(ENDPOINT, { query: DETAIL_QUERY, variables: { id: numeric } });
  const c = payload?.data?.Character;
  if (!c) return null;
  return {
    providerId: String(c.id),
    name: String(c.name?.full ?? '').trim() || nameVariants(c)[0] || '',
    source: mediaTitle(c) || 'Anime / Manga',
    description: stripTags(c.description),
    imageUrl: hasArtwork(String(c.image?.large ?? '')) ? String(c.image.large) : '',
  };
}
