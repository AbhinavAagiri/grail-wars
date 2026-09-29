/** Real-world cities the Holy Grail War can be fought in. */
import type { WarLocation } from '@hgd/shared';
import worldLocationsRaw from '../data/world-locations.json';

export const WORLD_LOCATIONS = worldLocationsRaw as WarLocation[];
export const WAR_LOCATION_IDS = WORLD_LOCATIONS.map((l) => l.id);

export function warLocationById(id: string | undefined | null): WarLocation | null {
  if (!id) return null;
  return WORLD_LOCATIONS.find((l) => l.id === id) ?? null;
}

/** `count` distinct random real-world locations. */
export function randomWarLocations(rng: () => number, count: number): WarLocation[] {
  const pool = [...WORLD_LOCATIONS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, Math.max(0, Math.min(count, pool.length)));
}
