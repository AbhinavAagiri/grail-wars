import { politeJson } from '../../util/http';

const API = 'https://en.wikipedia.org/w/api.php';

export interface WikiCandidate {
  providerId: string;
  name: string;
  source: string;
  thumb: string;
  blurb?: string;
}

function apiUrl(params: Record<string, string | number>): string {
  const url = new URL(API);
  const all: Record<string, string | number> = { format: 'json', origin: '*', ...params };
  for (const [k, v] of Object.entries(all)) url.searchParams.set(k, String(v));
  return url.toString();
}

export async function searchWikipedia(query: string): Promise<WikiCandidate[]> {
  const url = apiUrl({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: 5,
    prop: 'pageimages|extracts',
    piprop: 'thumbnail',
    pithumbsize: 200,
    exintro: 1,
    explaintext: 1,
    exsentences: 1,
    maxlag: 5,
  });
  const payload = await politeJson<any>(url);
  const pages = payload?.query?.pages;
  if (!pages) return [];
  return Object.values<any>(pages)
    .map((p) => ({
      providerId: String(p.pageid ?? p.title ?? ''),
      name: String(p.title ?? '').trim(),
      source: 'Wikipedia',
      thumb: String(p.thumbnail?.source ?? ''),
      blurb: String(p.extract ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
    }))
    .filter((c) => c.name);
}

export interface WikiSummary {
  title: string;
  extract: string;
  description: string;
  imageUrl: string;
  url: string;
}

export async function getWikipediaSummary(title: string): Promise<WikiSummary | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
  try {
    const payload = await politeJson<any>(url);
    if (!payload || payload.type === 'disambiguation') return null;
    return {
      title: String(payload.title ?? title),
      extract: String(payload.extract ?? ''),
      description: String(payload.description ?? ''),
      imageUrl: String(payload.originalimage?.source ?? payload.thumbnail?.source ?? ''),
      url: String(payload.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`),
    };
  } catch {
    return null;
  }
}

/** Original page image, best resolution available. */
export async function getWikipediaImage(title: string): Promise<string | null> {
  const url = apiUrl({
    action: 'query',
    titles: title,
    prop: 'pageimages',
    piprop: 'original|thumbnail',
    pithumbsize: 600,
    redirects: 1,
    maxlag: 5,
  });
  try {
    const payload = await politeJson<any>(url);
    const pages = payload?.query?.pages;
    if (!pages) return null;
    const first = Object.values<any>(pages)[0];
    return first?.original?.source ?? first?.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}
