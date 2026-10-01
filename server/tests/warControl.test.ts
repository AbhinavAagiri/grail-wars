import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLASSES, DEFAULT_SETTINGS, type Profile, type Servant, type ServantClass } from '@hgd/shared';
import { Room } from '../src/rooms/Room';
import { LEVELS, TIERS } from '../src/research/tiers';

/*
 * "The text skips itself before the timer ends." The autoplay tick was left
 * running at its old deadline when the host stepped forward by hand, so the
 * event they had just revealed was replaced almost immediately. A manual step
 * must restart the interval — and reaching the last event must stop playback.
 */

function profileFor(name: string): Profile {
  return {
    key: name.toLowerCase(),
    name,
    source: 'Test',
    tierPeak: '7-B',
    tierBase: '7-B',
    tierIndex: TIERS.indexOf('7-B'),
    speed: 'Hypersonic',
    speedIndex: 8,
    durability: 'City',
    durabilityIndex: LEVELS.indexOf('City'),
    range: 'Extended Melee Range',
    rangeIndex: 1,
    intelligence: 'Average',
    intelligenceIndex: 45,
    abilities: [],
    keyAbilityName: 'Strike',
    weaknesses: [],
    archetype: 'fighter',
    tags: ['honorable'],
    alignment: 'good',
    haxScore: 0,
    confidence: 'high',
    sources: [],
    baseScore: 50,
  };
}

function servantFor(index: number): Servant {
  const cls = CLASSES[index % CLASSES.length] as ServantClass;
  const name = `Servant${index}`;
  return {
    id: `s${index}`,
    playerId: `p${index}`,
    masterName: `Master${index}`,
    cls,
    character: {
      key: `test:${index}`,
      name,
      source: 'Test',
      provider: 'custom',
      imageUrl: '',
      submittedBy: `p${index}`,
    },
    profile: profileFor(name),
  };
}

async function warRoom(): Promise<Room> {
  const room = new Room('TEST', () => {}, () => {});
  room.hostId = 'host';
  room.phase = 'SUMMON';
  room.servants = [servantFor(0), servantFor(1), servantFor(2)];
  room.settings = {
    ...DEFAULT_SETTINGS,
    classes: [...DEFAULT_SETTINGS.classes],
    war: { ...DEFAULT_SETTINGS.war, days: 3, minEventsPerDay: 4, maxEventsPerDay: 4, autoplayMs: 1000 },
    debate: { ...DEFAULT_SETTINGS.debate },
  };
  await room.startWar('host');
  return room;
}

describe('war playback', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('restarts the autoplay interval when the host steps forward by hand', async () => {
    vi.useFakeTimers();
    const room = await warRoom();
    expect(room.cursor.playing).toBe(true);

    vi.advanceTimersByTime(400);
    room.warControl('host', 'next');
    const afterManualStep = room.cursor.eventIndex;

    // 700ms of the restarted 1000ms interval: the event must still be on screen.
    vi.advanceTimersByTime(700);
    expect(room.cursor.eventIndex).toBe(afterManualStep);

    // The interval the manual step restarted then elapses.
    vi.advanceTimersByTime(400);
    expect(room.cursor.eventIndex).toBeGreaterThan(afterManualStep);
  });

  it('pauses playback once the host reaches the end of the war', async () => {
    vi.useFakeTimers();
    const room = await warRoom();
    room.warControl('host', 'jump', 100_000);
    expect(room.cursor.playing).toBe(true);

    room.warControl('host', 'next');
    expect(room.cursor.playing).toBe(false);
    expect(room.phase).toBe('RESULTS');
  });
});
