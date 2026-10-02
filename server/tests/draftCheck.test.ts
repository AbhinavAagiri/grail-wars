import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Character, type ServantClass } from '@hgd/shared';
import { Room } from '../src/rooms/Room';

/*
 * "Faster drafting." The pick used to wait on two wiki lookups before it
 * existed at all, so a Master watched an empty slot while the Grail answered,
 * and the class rule was enforced by refusing the pick. The pick now lands the
 * moment it is made and the verdict reports on the card afterwards — which
 * moves the guarantee that no Servant is drafted into a class that does not fit
 * it from the pick handler to the lock gate. These tests pin both halves: the
 * instant pick, and a lock that will not take a slot whose check has not come
 * back clean.
 *
 * Every name used here is one the canon or the political denylist answers
 * without touching a wiki, so the suite stays offline.
 */

function character(name: string): Character {
  return { key: `test:${name}`, name, source: 'Custom', provider: 'custom', imageUrl: '', submittedBy: 'dev' };
}

/** A room in the draft. One class by default, so a single pick fills it. */
function draftRoom(classes: ServantClass[] = ['saber'], masters = 1): { room: Room; ids: string[] } {
  const room = new Room('TEST', () => {}, () => {});
  const ids: string[] = [];
  for (let i = 0; i < masters; i++) {
    const joined = room.join(`Master${i + 1}`, `socket-${i}`);
    if (!joined.playerId) throw new Error('the room refused a Master');
    ids.push(joined.playerId);
  }
  room.settings = {
    ...DEFAULT_SETTINGS,
    classes: [...classes],
    war: { ...DEFAULT_SETTINGS.war },
    debate: { ...DEFAULT_SETTINGS.debate },
  };
  room.phase = 'DRAFT';
  return { room, ids };
}

const checkFor = (room: Room, id: string, cls: ServantClass) => room.sanitize(id).myPickChecks?.[cls];

/** Wait for the background verdict behind a slot, then hand it back. */
async function settled(room: Room, id: string, cls: ServantClass) {
  await vi.waitFor(() => expect(checkFor(room, id, cls)?.status).not.toBe('checking'));
  return checkFor(room, id, cls);
}

describe('the class check behind a pick', () => {
  it('seats the pick before the verdict answers', async () => {
    const { room, ids } = draftRoom(['saber']);
    const id = ids[0]!;

    expect(room.setPick(id, 'saber', character('Kirito')).ok).toBe(true);
    // The card is on the board at once, with the check still running.
    expect(room.sanitize(id).myPicks?.saber?.name).toBe('Kirito');
    expect(checkFor(room, id, 'saber')?.status).toBe('checking');

    expect(await settled(room, id, 'saber')).toEqual({ status: 'ok' });
  });

  it('flags a pick whose class does not fit, and names the classes that do', async () => {
    const { room, ids } = draftRoom(['shielder']);
    const id = ids[0]!;

    expect(room.setPick(id, 'shielder', character('Kirito')).ok).toBe(true);
    const verdict = await settled(room, id, 'shielder');
    if (verdict?.status !== 'flagged') throw new Error('expected a flagged check');
    expect(verdict.classes).toEqual(['saber']);
    expect(verdict.message).toMatch(/can only be drafted as Saber/);
  });

  it('refuses a real-world political figure after the pick has landed', async () => {
    const { room, ids } = draftRoom(['saber']);
    const id = ids[0]!;

    expect(room.setPick(id, 'saber', character('JD Vance')).ok).toBe(true);
    const verdict = await settled(room, id, 'saber');
    expect(verdict?.status).toBe('refused');
  });

  it('ignores a verdict that arrives after the slot has changed', async () => {
    const { room, ids } = draftRoom(['shielder']);
    const id = ids[0]!;

    room.setPick(id, 'shielder', character('Kirito'));
    room.clearPick(id, 'shielder');
    expect(room.setPick(id, 'shielder', character('Vegeta')).ok).toBe(true);

    // Vegeta's verdict, never the one still in flight for Kirito.
    const verdict = await settled(room, id, 'shielder');
    if (verdict?.status !== 'flagged') throw new Error('expected a flagged check');
    expect(verdict.classes).toEqual(['berserker', 'avenger']);
  });

  it('clears the verdict with the slot', () => {
    const { room, ids } = draftRoom(['saber']);
    const id = ids[0]!;

    room.setPick(id, 'saber', character('Kirito'));
    expect(checkFor(room, id, 'saber')).toBeDefined();
    room.clearPick(id, 'saber');
    expect(checkFor(room, id, 'saber')).toBeUndefined();
  });
});

describe('the lock gate', () => {
  it('holds Lock In while a check is still running', async () => {
    const { room, ids } = draftRoom(['saber']);
    const id = ids[0]!;
    expect(room.setPick(id, 'saber', character('Kirito')).ok).toBe(true);

    const held = room.lock(id);
    expect(held.ok).toBe(false);
    expect(held.error).toMatch(/class check is still running/);

    await settled(room, id, 'saber');
    expect(room.lock(id).ok).toBe(true);
  });

  it('refuses Lock In for a flagged slot, naming the slot and the classes that fit', async () => {
    const { room, ids } = draftRoom(['shielder']);
    const id = ids[0]!;
    room.setPick(id, 'shielder', character('Kirito'));
    await settled(room, id, 'shielder');

    const refused = room.lock(id);
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/can only be drafted as Saber/);
    expect(refused.error).toMatch(/Shielder slot/);
  });

  it('still asks for every slot to be filled first', () => {
    const { room, ids } = draftRoom(['saber', 'archer']);
    const id = ids[0]!;
    room.setPick(id, 'saber', character('Kirito'));

    const refused = room.lock(id);
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/Fill all 2 slots first/);
  });

  it('seats a roster pick already checked, so the lock never waits for one', () => {
    const room = new Room('TEST', () => {}, () => {});
    const host = room.join('Master1', 'socket-a').playerId;
    room.join('Master2', 'socket-b');
    if (!host) throw new Error('the room refused a Master');
    room.settings = {
      ...DEFAULT_SETTINGS,
      aiChooses: true,
      classes: ['saber'],
      war: { ...DEFAULT_SETTINGS.war },
      debate: { ...DEFAULT_SETTINGS.debate },
    };
    room.startDraft(host);

    const pool = room.draftPool.get('saber') ?? [];
    expect(pool.length).toBeGreaterThan(0);
    expect(room.setPick(host, 'saber', pool[0]!).ok).toBe(true);
    // A roster pick was dealt by the class it fits: nothing to look up.
    expect(checkFor(room, host, 'saber')).toEqual({ status: 'ok' });
    expect(room.lock(host).ok).toBe(true);
  });
});

describe('the refusals that need no lookup', () => {
  it('still refuses a duplicate instantly, without waiting on a check', () => {
    const { room, ids } = draftRoom(['saber'], 2);
    const [a, b] = ids as [string, string];

    expect(room.setPick(a, 'saber', character('Kirito')).ok).toBe(true);
    const duplicate = room.setPick(b, 'saber', character('Kirito'));
    expect(duplicate.ok).toBe(false);
    expect(duplicate.error).toMatch(/already picked Kirito/);
  });

  it('still refuses a class that is not in this war', () => {
    const { room, ids } = draftRoom(['saber']);
    const refused = room.setPick(ids[0]!, 'caster', character('Rin Tohsaka'));
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/not part of this war/);
  });
});
