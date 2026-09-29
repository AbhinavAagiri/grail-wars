import { config } from '../../config';
import { politeJson } from '../../util/http';

const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/w500';

export function tmdbEnabled(): boolean {
  return !!config.TMDB_API_KEY;
}

export interface TmdbCandidate {
  providerId: string;
  name: string;
  source: string;
  thumb: string;
  blurb?: string;
}

export async function searchTmdb(query: string): Promise<TmdbCandidate[]> {
  if (!tmdbEnabled()) return [];
  const url = new URL(`${API}/search/person`);
  url.searchParams.set('api_key', config.TMDB_API_KEY);
  url.searchParams.set('query', query);
  try {
    const payload = await politeJson<any>(url.toString());
    const results = payload?.results;
    if (!Array.isArray(results)) return [];
    return results.slice(0, 5).map((r: any) => ({
      providerId: String(r?.id ?? ''),
      name: String(r?.name ?? ''),
      source: String(r?.known_for?.[0]?.title ?? r?.known_for?.[0]?.name ?? 'Film / TV'),
      thumb: r?.profile_path ? `${IMG}${r.profile_path}` : '',
    }));
  } catch {
    return [];
  }
}

export async function getTmdbImage(query: string): Promise<string | null> {
  if (!tmdbEnabled()) return null;
  try {
    const people = await searchTmdb(query);
    return people.find((p) => p.thumb)?.thumb ?? null;
  } catch {
    return null;
  }
}
