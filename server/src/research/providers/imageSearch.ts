import { config } from '../../config';
import { politeJson } from '../../util/http';

export function imageSearchEnabled(): boolean {
  if (config.IMAGE_SEARCH_PROVIDER === 'brave') return !!config.BRAVE_SEARCH_KEY;
  if (config.IMAGE_SEARCH_PROVIDER === 'google_cse') return !!config.GOOGLE_CSE_KEY && !!config.GOOGLE_CSE_CX;
  return false;
}

interface NormalizedImage {
  url: string;
  width: number;
  height: number;
}

function preferSquare(images: NormalizedImage[]): string[] {
  return images
    .filter((i) => i.url && i.width >= 300 && i.height >= 300)
    .sort((a, b) => {
      const ratioA = Math.abs(1 - a.width / Math.max(1, a.height));
      const ratioB = Math.abs(1 - b.width / Math.max(1, b.height));
      if (ratioA !== ratioB) return ratioA - ratioB;
      return b.width * b.height - a.width * a.height;
    })
    .map((i) => i.url);
}

async function braveImages(query: string): Promise<string[]> {
  const url = new URL('https://api.search.brave.com/res/v1/images/search');
  url.searchParams.set('q', query);
  url.searchParams.set('safesearch', 'strict');
  url.searchParams.set('count', '10');
  const payload = await politeJson<any>(url.toString(), {
    headers: { 'x-subscription-token': config.BRAVE_SEARCH_KEY, accept: 'application/json' },
  });
  const results = payload?.results;
  if (!Array.isArray(results)) return [];
  return preferSquare(
    results.map((r: any) => ({
      url: String(r?.properties?.url ?? r?.thumbnail?.src ?? ''),
      width: Number(r?.properties?.width ?? 0),
      height: Number(r?.properties?.height ?? 0),
    })),
  );
}

async function googleCseImages(query: string): Promise<string[]> {
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', config.GOOGLE_CSE_KEY);
  url.searchParams.set('cx', config.GOOGLE_CSE_CX);
  url.searchParams.set('q', query);
  url.searchParams.set('searchType', 'image');
  url.searchParams.set('safe', 'active');
  url.searchParams.set('num', '10');
  const payload = await politeJson<any>(url.toString());
  const items = payload?.items;
  if (!Array.isArray(items)) return [];
  return preferSquare(
    items.map((r: any) => ({
      url: String(r?.link ?? ''),
      width: Number(r?.image?.width ?? 0),
      height: Number(r?.image?.height ?? 0),
    })),
  );
}

/** Extra image candidates beyond the wiki sources. Empty when not configured. */
export async function searchImages(name: string, source: string): Promise<string[]> {
  if (!imageSearchEnabled()) return [];
  const query = `${name} ${source} character`.trim();
  try {
    if (config.IMAGE_SEARCH_PROVIDER === 'brave') return await braveImages(query);
    if (config.IMAGE_SEARCH_PROVIDER === 'google_cse') return await googleCseImages(query);
  } catch {
    return [];
  }
  return [];
}
