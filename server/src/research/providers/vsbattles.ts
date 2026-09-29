import { politeJson } from '../../util/http';
import { parseVsbPage, parseVsbSearch, type VsBStats } from '../parseVsb';

const API = 'https://vsbattles.fandom.com/api.php';

function apiUrl(params: Record<string, string | number>): string {
  const url = new URL(API);
  const all: Record<string, string | number> = { format: 'json', origin: '*', maxlag: 5, ...params };
  for (const [k, v] of Object.entries(all)) url.searchParams.set(k, String(v));
  return url.toString();
}

export interface VsBSearchResult {
  title: string;
  pageId: number;
  snippet: string;
}

export async function searchVsb(name: string, source: string): Promise<VsBSearchResult[]> {
  // Searching "Sherlock Holmes Sherlock Holmes" just dilutes the ranking, so the
  // source only counts when it actually says something the name does not.
  const lowerName = name.toLowerCase();
  const lowerSource = source.toLowerCase();
  const sourceAddsInfo = Boolean(source) && !lowerName.includes(lowerSource) && !lowerSource.includes(lowerName);
  const term = [name, sourceAddsInfo ? source : ''].filter(Boolean).join(' ').trim();
  if (!term) return [];
  const url = apiUrl({
    action: 'query',
    list: 'search',
    srsearch: term,
    srlimit: 5,
    srnamespace: 0,
  });
  try {
    const payload = await politeJson<any>(url);
    return parseVsbSearch(payload);
  } catch {
    return [];
  }
}

export interface VsBPage extends VsBStats {
  pageUrl: string;
}

export async function fetchVsbPage(title: string): Promise<VsBPage | null> {
  const url = apiUrl({
    action: 'parse',
    page: title,
    prop: 'text|categories',
    formatversion: 2,
    redirects: 1,
  });
  try {
    const payload = await politeJson<any>(url);
    const parsed = payload?.parse;
    if (!parsed) return null;
    const html: string = parsed?.text ?? '';
    const categories: string[] = Array.isArray(parsed?.categories)
      ? parsed.categories.map((c: any) => String(c?.category ?? c)).filter(Boolean)
      : [];
    const stats = parseVsbPage(html, String(parsed?.title ?? title), categories);
    return {
      ...stats,
      pageUrl: `https://vsbattles.fandom.com/wiki/${encodeURIComponent(stats.title || title).replace(/%20/g, '_')}`,
    };
  } catch {
    return null;
  }
}

/**
 * Page images for several profiles at once. The draft list shows five search
 * results, so one batched request keeps every row illustrated. Thumbnails only:
 * a VS Battles "original" is often a multi-megabyte scan.
 */
export async function getVsbImages(pageIds: number[]): Promise<Map<number, string>> {
  const ids = pageIds.filter((id) => Number.isFinite(id));
  if (!ids.length) return new Map();
  const url = apiUrl({
    action: 'query',
    pageids: ids.join('|'),
    prop: 'pageimages',
    piprop: 'thumbnail',
    pithumbsize: 400,
    formatversion: 2,
  });
  try {
    const payload = await politeJson<any>(url);
    const pages = payload?.query?.pages;
    if (!Array.isArray(pages)) return new Map();
    const out = new Map<number, string>();
    for (const page of pages) {
      const id = Number(page?.pageid);
      const source = page?.thumbnail?.source;
      if (Number.isFinite(id) && source) out.set(id, String(source));
    }
    return out;
  } catch {
    return new Map();
  }
}

/** Page image via the standard pageimages API. */
export async function getVsbImage(title: string): Promise<string | null> {
  const url = apiUrl({
    action: 'query',
    titles: title,
    prop: 'pageimages',
    piprop: 'original|thumbnail',
    pithumbsize: 600,
    redirects: 1,
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
