/**
 * Run a full war from the terminal:
 *   npm run sim -- --seed 1 --players 5 [--days 5]
 *   npm run sim -- --style hunger_games --location new-york
 *
 * Profiles come from the Oracle when the network is available, and from the
 * heuristic fallback otherwise, so this always produces a story.
 */
import {
  CLASSES,
  DEFAULT_SETTINGS,
  type NarrationStyle,
  type RoomSettings,
  type Servant,
  type ServantClass,
} from '@hgd/shared';
import { nanoid } from 'nanoid';
import { researchCharacter } from '../research';
import { runSimulation } from '../sim/director';
import { WAR_LOCATION_IDS, warLocationById } from '../sim/locations';
import fallbackRaw from '../data/fallback-characters.json';

interface Args {
  seed: number;
  players: number;
  days: number;
  offline: boolean;
  style: NarrationStyle;
  locationId?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { seed: 1, players: 5, days: 5, offline: false, style: 'templated' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--seed') args.seed = Number(value) || 1;
    else if (flag === '--players') args.players = Math.max(2, Math.min(14, Number(value) || 5));
    else if (flag === '--days') args.days = Math.max(3, Math.min(7, Number(value) || 5));
    else if (flag === '--offline') args.offline = true;
    else if (flag === '--style') {
      if (value === 'templated' || value === 'ai' || value === 'hunger_games' || value === 'fate') {
        args.style = value;
      }
    } else if (flag === '--location') args.locationId = value;
  }
  return args;
}

const FALLBACKS = fallbackRaw as Record<ServantClass, { name: string; source: string }[]>;

async function buildServants(count: number, offline: boolean): Promise<Servant[]> {
  const servants: Servant[] = [];
  for (let i = 0; i < count; i++) {
    const cls = CLASSES[i % CLASSES.length];
    const pool = FALLBACKS[cls] ?? [];
    const choice = pool[Math.floor(Math.random() * pool.length)];
    const character = {
      key: `demo:${choice.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: choice.name,
      source: choice.source,
      provider: 'fallback' as const,
      imageUrl: '',
      submittedBy: `p${i}`,
    };
    servants.push({
      id: nanoid(8),
      playerId: `p${i}`,
      masterName: `Master ${String.fromCharCode(65 + i)}`,
      cls: cls as ServantClass,
      character,
    });
  }

  if (offline) return servants;

  process.stdout.write('Consulting the Throne of Heroes');
  for (const servant of servants) {
    try {
      servant.profile = await researchCharacter(servant.character);
      process.stdout.write('.');
    } catch {
      process.stdout.write('x');
    }
  }
  process.stdout.write('\n\n');
  return servants;
}

function settingsFor(days: number, style: NarrationStyle): RoomSettings {
  return {
    ...DEFAULT_SETTINGS,
    war: { ...DEFAULT_SETTINGS.war, days, narration: style },
    debate: { ...DEFAULT_SETTINGS.debate },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const servants = await buildServants(args.players, args.offline);
  const timeline = runSimulation({
    servants,
    settings: settingsFor(args.days, args.style),
    seed: args.seed,
    unsummoned: [],
    warLocation: warLocationById(args.locationId),
  });

  const nameOf = (id: string) => {
    const s = timeline.servants.find((x) => x.id === id);
    if (!s) return id;
    return `${s.character.name} (${s.cls}, Master: ${s.masterName})`;
  };

  console.log(`=== HOLY GRAIL WAR #${timeline.seed.toString(16).toUpperCase()} ===`);
  console.log(
    timeline.servants
      .map((s) => `  ${s.cls.padEnd(9)} ${s.character.name} — ${s.profile?.tierPeak ?? '?'} (score ${s.profile?.baseScore ?? '?'})`)
      .join('\n'),
  );
  console.log('');

  for (const day of timeline.days) {
    console.log(`\n--- Day ${day.day}: ${day.title} ---`);
    for (const event of day.events) {
      const text = event.tokens.map((t) => t.v).join('');
      const banner = event.banner ? ` [${event.banner}]` : '';
      console.log(`  ${event.phase.padEnd(9)} ${text}${banner}`);
      if (event.explain) {
        console.log(
          `            why: ${event.explain.a} ${event.explain.ea} vs ${event.explain.b} ${event.explain.eb} → ${event.explain.result}`,
        );
      }
    }
    console.log(`  remaining: ${day.remaining.length}`);
  }

  console.log(`\n=== WINNER: ${nameOf(timeline.winnerId)} ===`);
  console.log(timeline.wish);
  void nameOf;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
