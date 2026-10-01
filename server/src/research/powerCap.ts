/**
 * The room's Max Power Level.
 *
 * `Max Power level` is a war rule, not a draft filter: a Servant's tier is only
 * known once research has scaled them, and the wiki that supplies a tier is the
 * same lookup the draft already pays for. So the cap is applied where the tier
 * becomes known — a Servant whose peak tier is above the cap is scaled down to
 * it, losing the tier, the speed, the durability and the reach the cap does not
 * allow. The original tier is kept on the profile so the Review screen can say
 * what it was capped from.
 */
import type { Profile } from '@hgd/shared';
import {
  LEVELS,
  RANGE_LEVEL_OFFSET,
  RANGE_SCALE,
  SPEED_MAX_INDEX,
  SPEED_SCALE,
  TIER_MAX_INDEX,
  durabilityFromTierIndex,
  norm,
  parseTier,
} from './tiers';
import { baseScore } from '../sim/score';

export interface PowerCap {
  label: string;
  index: number;
}

/** Parse a cap code ("4-B", "High 6-A") into its tier. Unknown codes disable it. */
export function parsePowerCap(cap: string | undefined): PowerCap | null {
  if (!cap) return null;
  const parsed = parseTier(cap);
  if (parsed.tierPeak === 'Unknown') return null;
  return { label: parsed.tierPeak, index: parsed.tierIndex };
}

/**
 * Scale a profile down to the cap, or return it untouched when it already sits
 * at or below it. Everything the score reads is clamped, so a capped
 * Universe-tier fighter really does fight like a Solar-System one.
 */
export function applyPowerCap(profile: Profile, cap: string | undefined): Profile {
  const limit = parsePowerCap(cap);
  if (!limit) return profile;
  if (profile.tierIndex <= limit.index + 1e-6) return profile;

  const speedCeiling = Math.max(0, Math.round((limit.index / TIER_MAX_INDEX) * SPEED_MAX_INDEX * 0.9));
  const durabilityCeiling = Math.max(0, Math.round(durabilityFromTierIndex(limit.index)));
  const rangeCeiling = durabilityCeiling + RANGE_LEVEL_OFFSET;

  const next: Profile = {
    ...profile,
    tierPeak: limit.label,
    tierBase: limit.label,
    tierIndex: limit.index,
    speedIndex: Math.min(profile.speedIndex, speedCeiling),
    durabilityIndex: Math.min(profile.durabilityIndex, durabilityCeiling),
    rangeIndex: Math.min(profile.rangeIndex, rangeCeiling),
    haxScore: Math.min(profile.haxScore, Math.round(norm(limit.index, TIER_MAX_INDEX))),
    capped: { level: limit.label, from: profile.tierPeak },
  };
  next.speed = SPEED_SCALE[Math.round(next.speedIndex)] ?? next.speed;
  next.durability = LEVELS[Math.round(next.durabilityIndex)] ?? next.durability;
  next.range = RANGE_SCALE[Math.round(next.rangeIndex)] ?? next.range;
  next.baseScore = baseScore(next);
  return next;
}
