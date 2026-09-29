import type { Servant, ServantClass, WorldServantState } from '@hgd/shared';
import { MANA } from './config';

export interface Alliance {
  id: string;
  members: string[];
  formedDay: number;
  expiresDay: number | null;
}

export interface Trap {
  locationId: string;
  ownerId: string;
}

export interface WorldState {
  servants: Map<string, Servant>;
  state: Map<string, WorldServantState>;
  alliances: Alliance[];
  traps: Trap[];
  flags: Set<string>;
  /** unordered pair key -> number of times they have fought */
  encounters: Map<string, number>;
  appearancesToday: Map<string, number>;
  day: number;
  /** at most one mutual-destruction ending per war */
  mutualUsed: boolean;
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function initialState(servants: Servant[]): WorldState {
  const state = new Map<string, WorldServantState>();
  for (const s of servants) {
    state.set(s.id, {
      alive: true,
      injuries: 0,
      mana: 100,
      morale: 0,
      kills: 0,
      commandSpellsLeft: 3,
      masterAlive: true,
      buffNextFight: 0,
      scoutedTargets: [],
      allies: [],
      grudges: [],
      rescueUsed: false,
      masterless: false,
    });
  }
  return {
    servants: new Map(servants.map((s) => [s.id, s])),
    state,
    alliances: [],
    traps: [],
    flags: new Set(),
    encounters: new Map(),
    appearancesToday: new Map(),
    day: 1,
    mutualUsed: false,
  };
}

export function livingIds(world: WorldState): string[] {
  return [...world.state.entries()].filter(([, s]) => s.alive).map(([id]) => id);
}

export function livingCount(world: WorldState): number {
  return livingIds(world).length;
}

export function getState(world: WorldState, id: string): WorldServantState {
  const s = world.state.get(id);
  if (!s) throw new Error(`unknown servant ${id}`);
  return s;
}

export function getServant(world: WorldState, id: string): Servant {
  const s = world.servants.get(id);
  if (!s) throw new Error(`unknown servant ${id}`);
  return s;
}

export function classOf(world: WorldState, id: string): ServantClass {
  return getServant(world, id).cls;
}

export function injure(world: WorldState, id: string, amount: number): void {
  const s = getState(world, id);
  s.injuries = Math.min(3, Math.max(0, s.injuries + amount)) as WorldServantState['injuries'];
}

export function heal(world: WorldState, id: string, amount = 1): void {
  const s = getState(world, id);
  s.injuries = Math.max(0, s.injuries - amount) as WorldServantState['injuries'];
}

export function adjustMana(world: WorldState, id: string, delta: number): void {
  const s = getState(world, id);
  s.mana = Math.max(0, Math.min(100, s.mana + delta));
}

export function adjustMorale(world: WorldState, id: string, delta: number): void {
  const s = getState(world, id);
  s.morale = Math.max(-2, Math.min(2, s.morale + delta));
}

export function addGrudge(world: WorldState, holderId: string, targetId: string): void {
  if (holderId === targetId) return;
  const s = getState(world, holderId);
  if (!s.grudges.includes(targetId)) s.grudges.push(targetId);
}

export function kill(world: WorldState, id: string, day: number, killedBy?: string): void {
  const s = getState(world, id);
  s.alive = false;
  s.diedOnDay = day;
  s.killedBy = killedBy;
  s.mana = 0;
  // Allies of the fallen take it badly.
  if (killedBy) {
    for (const ally of s.allies) {
      if (getState(world, ally).alive) addGrudge(world, ally, killedBy);
    }
  }
  // Dissolve any alliance that included them.
  for (const alliance of world.alliances) {
    alliance.members = alliance.members.filter((m) => m !== id);
  }
  world.alliances = world.alliances.filter((a) => a.members.length >= 2);
  for (const [, other] of world.state) {
    other.allies = other.allies.filter((a) => a !== id);
  }
}

export function formAlliance(world: WorldState, a: string, b: string): Alliance {
  const alliance: Alliance = {
    id: `${a}+${b}`,
    members: [a, b],
    formedDay: world.day,
    expiresDay: world.day + 2,
  };
  world.alliances.push(alliance);
  for (const id of alliance.members) {
    const s = getState(world, id);
    const other = id === a ? b : a;
    if (!s.allies.includes(other)) s.allies.push(other);
  }
  return alliance;
}

export function allianceOf(world: WorldState, a: string, b: string): Alliance | undefined {
  return world.alliances.find((al) => al.members.includes(a) && al.members.includes(b));
}

export function breakAlliance(world: WorldState, a: string, b: string): void {
  const alliance = allianceOf(world, a, b);
  if (alliance) {
    alliance.members = [];
    world.alliances = world.alliances.filter((al) => al !== alliance);
  }
  for (const id of [a, b]) {
    const other = id === a ? b : a;
    const s = getState(world, id);
    s.allies = s.allies.filter((x) => x !== other);
  }
}

export function expireAlliances(world: WorldState): void {
  for (const alliance of world.alliances) {
    if (alliance.expiresDay !== null && world.day >= alliance.expiresDay) {
      for (const id of alliance.members) {
        const s = getState(world, id);
        s.allies = s.allies.filter((x) => !alliance.members.includes(x) || x === id);
      }
      alliance.members = [];
    }
  }
  world.alliances = world.alliances.filter((a) => a.members.length >= 2);
}

export function recordEncounter(world: WorldState, a: string, b: string): void {
  const key = pairKey(a, b);
  world.encounters.set(key, (world.encounters.get(key) ?? 0) + 1);
}

export function encounterCount(world: WorldState, a: string, b: string): number {
  return world.encounters.get(pairKey(a, b)) ?? 0;
}

export function metBefore(world: WorldState, a: string, b: string): boolean {
  return encounterCount(world, a, b) > 0;
}

export function noteAppearance(world: WorldState, id: string): void {
  world.appearancesToday.set(id, (world.appearancesToday.get(id) ?? 0) + 1);
}

export function resetAppearances(world: WorldState): void {
  world.appearancesToday = new Map();
}

export function hasGrudge(world: WorldState, holderId: string, targetId: string): boolean {
  return getState(world, holderId).grudges.includes(targetId);
}

export function scouted(world: WorldState, actorId: string, targetId: string): boolean {
  return getState(world, actorId).scoutedTargets.includes(targetId);
}

export function markScouted(world: WorldState, actorId: string, targetId: string): void {
  const s = getState(world, actorId);
  if (!s.scoutedTargets.includes(targetId)) s.scoutedTargets.push(targetId);
}

export function addTrap(world: WorldState, ownerId: string, locationId: string): void {
  if (!world.traps.some((t) => t.ownerId === ownerId && t.locationId === locationId)) {
    world.traps.push({ locationId: locationId, ownerId });
  }
}

export function trapAt(world: WorldState, targetId: string): string | null {
  const trap = world.traps.find((t) => t.ownerId !== targetId);
  return trap ? trap.ownerId : null;
}

/** Mana cost of having fought. Berserkers burn far more. */
export function fightManaCost(world: WorldState, id: string): number {
  const cls = classOf(world, id);
  const tierIndex = getServant(world, id).profile?.tierIndex ?? 0;
  let cost = cls === 'berserker' ? MANA.berserkerPerFight : MANA.perFight;
  if (tierIndex >= MANA.highTierThresholdIndex) cost += MANA.highTierExtra;
  return cost;
}

/** Nightfall: everyone still alive recovers a little mana. */
export function nightfallRecovery(world: WorldState): void {
  for (const [id, s] of world.state) {
    if (!s.alive) continue;
    adjustMana(world, id, MANA.nightfallRecover);
    if (s.masterless) adjustMana(world, id, -MANA.masterlessDrain);
  }
}

export function summaryCounts(world: WorldState): { alive: number; dead: number } {
  let alive = 0;
  for (const [, s] of world.state) if (s.alive) alive++;
  return { alive, dead: world.state.size - alive };
}
