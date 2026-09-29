/**
 * Narration "voices" for the war.
 *
 * Four styles ship:
 *  - `templated`      the default five-act template corpus (no extra framing)
 *  - `ai`             templates + optional LLM rewrite (handled in Room)
 *  - `hunger_games`   the war told like the Hunger Games: tributes, sponsors,
 *                     the Cornucopia, and a cannon for every death
 *  - `fate`           the war told the way the Fate franchise tells it: the
 *                     Grail, Command Seals, Spirit Origins, the Throne of Heroes
 *
 * Every style is also flavoured by where the war is being fought, so an arena
 * in New York City reads differently from one in Kathmandu.
 */
import type { NarrationStyle, Token, WarLocation } from '@hgd/shared';

export type Rng = () => number;

function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

function text(v: string): Token {
  return { t: 'text', v };
}

function name(servantId: string, v: string): Token {
  return { t: 'name', servantId, v };
}

/** Join a list of names into tokens: "A, B and C". */
function nameList(items: { id: string; name: string }[]): Token[] {
  const out: Token[] = [];
  items.forEach((item, i) => {
    if (i > 0) out.push(text(i === items.length - 1 ? (items.length > 2 ? ', and ' : ' and ') : ', '));
    out.push(name(item.id, item.name));
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Location flavour                                                    */
/* ------------------------------------------------------------------ */

interface KindFlavor {
  prologue: string[];
  vantage: string[];
}

const KIND_FLAVOR: Record<string, KindFlavor> = {
  megacity: {
    prologue: [
      'Skyscrapers, subways, eight million witnesses who will never see a thing.',
      'Glass towers and endless traffic — the perfect place to hide a war.',
      'The city swallows everything, including whatever happens tonight.',
    ],
    vantage: [
      '{A} takes the high ground, using the glass towers of {L} to watch every street at once.',
      '{A} works the rooftops, tracking movement across {L} like a map.',
      '{A} vanishes into the crowd, one face among millions in {L}.',
    ],
  },
  coastal: {
    prologue: [
      'Sea wind, salt, and a harbor that never quite sleeps.',
      'The water keeps the war contained — and the exits few.',
      'Fog rolls off the bay and the whole city looks like it is hiding something.',
    ],
    vantage: [
      '{A} keeps to the waterfront, reading the harbor of {L} for anyone moving in or out.',
      '{A} watches the bridge traffic over {L}, waiting for a pattern to break.',
      '{A} listens to the tide, using the sound of the sea to mask their approach.',
    ],
  },
  historic: {
    prologue: [
      'Old stone streets, older grudges, and a city that has seen worse than this.',
      'A place like this remembers every war that came before. It will remember this one too.',
      'Cathedrals, plazas and alleys that were built for ambushes.',
    ],
    vantage: [
      '{A} disappears into the old quarter, where the narrow streets of {L} make every approach a trap.',
      '{A} climbs the bell tower, looking down over the plazas of {L}.',
      '{A} waits in the shadow of an old wall, letting {L} hide them.',
    ],
  },
  mountain: {
    prologue: [
      'Thin air, long sight lines, and a cold that gets into magic as easily as bone.',
      'The peaks cut the city off from the world. Nobody is coming to help.',
      'Every road in and out can be watched from above.',
    ],
    vantage: [
      '{A} climbs above {L}, where the thin air and long sight lines favour a patient hunter.',
      '{A} takes a ridge and watches the switchbacks below, counting anyone foolish enough to move.',
      '{A} uses the fog on the slopes of {L} to come and go unseen.',
    ],
  },
  desert: {
    prologue: [
      'Heat haze, dust, and no cover for a hundred kilometres.',
      'The desert strips a battle down to whoever can last longer.',
      'By noon the sand is hot enough to leave footprints glowing.',
    ],
    vantage: [
      '{A} waits out the heat in the shade, watching the approaches to {L} shimmer and betray movement.',
      '{A} reads the dust on the horizon, tracking engines long before they arrive.',
      '{A} moves at night, when the cold of {L} hides everything.',
    ],
  },
  island: {
    prologue: [
      'An island arena: finite ground, finite exits, and nowhere to run.',
      'The sea is a wall. The war has a shoreline and it ends there.',
      'Tourists in the day, something else entirely after dark.',
    ],
    vantage: [
      '{A} uses the water as a wall, charting the few ways on and off {L}.',
      '{A} watches the harbor lights of {L}, where every arrival is visible.',
      '{A} takes the cliffs, where a fall ends more fights than any blade.',
    ],
  },
  winter: {
    prologue: [
      'Snow, short days, and a cold that never lets anyone forget where they are.',
      'Footprints in fresh snow are the worst intelligence leak in any war.',
      'Every breath hangs in the air and every fight is a fight against the weather too.',
    ],
    vantage: [
      '{A} lets the cold do the work, tracking footprints through the snows of {L}.',
      '{A} uses the long nights of {L} to move while everyone else huddles.',
      '{A} stops at a frozen river, listening to the ice carry sound for miles.',
    ],
  },
  river: {
    prologue: [
      'Two banks, a dozen bridges, and a river that carries every secret downstream.',
      'The water splits the city in half and makes a maze of the crossings.',
      'Barges, bridges and boats — more ways to move than anyone can watch.',
    ],
    vantage: [
      '{A} moves along the water, using the bridges and barges of {L} as cover and vantage both.',
      '{A} watches the crossings, where anyone chasing them must funnel through.',
      '{A} lets the fog on the river hide the approach to {L}.',
    ],
  },
};

const DEFAULT_FLAVOR: KindFlavor = KIND_FLAVOR.megacity;

function flavorFor(kind: string | undefined): KindFlavor {
  return KIND_FLAVOR[kind ?? ''] ?? DEFAULT_FLAVOR;
}

/** One location-aware sentence, e.g. "…using the glass towers of New York City." */
export function vantageTokens(
  rng: Rng,
  location: WarLocation | null | undefined,
  actor: { id: string; name: string },
): Token[] {
  if (!location) return [];
  const template = pick(rng, flavorFor(location.kind).vantage);
  const parts = template.replace(/\{L\}/g, location.name).split('{A}');
  const out: Token[] = [];
  out.push(text(parts[0] ?? ''));
  out.push(name(actor.id, actor.name));
  out.push(text(parts[1] ?? ''));
  return out;
}

/* ------------------------------------------------------------------ */
/* Prologue                                                            */
/* ------------------------------------------------------------------ */

const HUNGER_PROLOGUE = [
  'The Cornucopia rises over {L}, and the tributes are already counting each other. Only one of them is walking out of this alive.',
  'Welcome to the Holy Grail Games. May the odds be ever in your favour — they rarely are. {F}',
  'Somewhere in {L} a cannon sits loaded and waiting. Sponsors are already picking their favourites. {F}',
  'The arena gates have closed around {L}. Supplies at the centre, killers at the edges, and no way home but first place. {F}',
  'Sealed inside {L}, the Masters watch their tributes scatter and start doing what the Games always make them do: calculate. {F}',
];

const FATE_PROLOGUE = [
  'The ritual is complete. In {L}, seven Masters kneel over a circle of light and the Throne of Heroes answers. {F}',
  'The Holy Grail has chosen its battlefield. Every Command Seal in {L} burns at once, and the war begins. {F}',
  'A Lesser Grail stirs beneath {L}. Servants of legend open their eyes, and the Overseer falls silent. {F}',
  'The Grail War descends on {L}: seven classes, seven wishes, one Servant left standing. {F}',
  'Masters and Servants alike feel it the moment it starts. The Grail has opened in {L}, and it will not close until only one remains. {F}',
];

export function prologueTokens(
  style: NarrationStyle,
  rng: Rng,
  location: WarLocation | null | undefined,
): Token[] | null {
  if (style !== 'hunger_games' && style !== 'fate') return null;
  const pool = style === 'hunger_games' ? HUNGER_PROLOGUE : FATE_PROLOGUE;
  const place = location?.name ?? 'the city';
  const flavor = pick(rng, flavorFor(location?.kind).prologue);
  const line = pick(rng, pool).replace(/\{L\}/g, place).replace('{F}', flavor);
  return [text(line)];
}

/* ------------------------------------------------------------------ */
/* Death notices                                                       */
/* ------------------------------------------------------------------ */

const HUNGER_DEATH = [
  'High above the arena, a cannon booms.',
  'A cannon sounds — one fewer tribute.',
  'The cannon marks the kill, and the arena goes very quiet.',
  'Somewhere in the stands, a sponsor crosses a name off.',
];

const FATE_DEATH = [
  'Their Spirit Origin comes apart, and golden motes of mana scatter on the wind.',
  'The Servant dissolves in a burst of light, leaving only scorched ground.',
  'The Grail drinks the fading mana, and the Command Seal on their Master goes dark.',
  'Their legend ends here, unmourned and unrecorded.',
];

export function deathNoticeTokens(style: NarrationStyle, rng: Rng, fallen: number): Token[] | null {
  if (!fallen) return null;
  if (style !== 'hunger_games' && style !== 'fate') return null;
  const pool = style === 'hunger_games' ? HUNGER_DEATH : FATE_DEATH;
  const lead = fallen > 1 ? 'Cannons answer one another. ' : '';
  return [text(' '), text(lead + pick(rng, pool))];
}

/* ------------------------------------------------------------------ */
/* Nightfall                                                           */
/* ------------------------------------------------------------------ */

export function nightfallTokens(
  style: NarrationStyle,
  rng: Rng,
  fallen: { id: string; name: string }[],
  remaining: number,
  day: number,
  location: WarLocation | null | undefined,
): Token[] {
  const place = location?.name ?? 'the city';

  if (style === 'hunger_games') {
    const out: Token[] = [];
    const tributes = `${remaining} tribute${remaining === 1 ? '' : 's'}`;
    if (!fallen.length) {
      out.push(text(`Day ${day} ends in ${place} with no cannons. ${tributes} still breathing.`));
      return out;
    }
    out.push(text('The cannon sounds for '));
    out.push(...nameList(fallen));
    out.push(
      text(
        `. ${tributes} ${remaining === 1 ? 'remains' : 'remain'}, and the arena in ${place} settles in for the night.`,
      ),
    );
    return out;
  }

  if (style === 'fate') {
    const out: Token[] = [];
    if (!fallen.length) {
      out.push(text(`Day ${day} closes over ${place} with no Servant lost. ${remaining} still stand.`));
      return out;
    }
    out.push(text('The Grail takes '));
    out.push(...nameList(fallen));
    out.push(
      text(
        ` — Spirit Origin extinguished. ${remaining} Servant${remaining === 1 ? ' remains' : 's remain'} in the war for ${place}.`,
      ),
    );
    return out;
  }

  // Default wording, kept identical to the original templated nightfall.
  if (!fallen.length) {
    return [text(`No one fell today. ${remaining} Servants remain in the war.`)];
  }
  const out: Token[] = [text(`Fallen on Day ${day}: `)];
  out.push(...nameList(fallen));
  out.push(text(`. ${remaining} Servant${remaining === 1 ? '' : 's'} remain in the war.`));
  return out;
}

/* ------------------------------------------------------------------ */
/* Wish / victory                                                      */
/* ------------------------------------------------------------------ */

export function wishLine(style: NarrationStyle, rng: Rng, winnerName: string, wish: string): string {
  if (style === 'hunger_games') {
    const line = pick(rng, [
      'The cannon falls silent. The Games crown one tribute, and the prize is theirs.',
      'The arena is theirs. One tribute left standing, one wish granted.',
    ]);
    return `${line} ${winnerName} asks for ${wish}.`;
  }
  if (style === 'fate') {
    const line = pick(rng, [
      'The Grail opens and pours out its power.',
      'The Greater Grail manifests, and the wish will be written into the world.',
    ]);
    return `${line} ${winnerName} claims it and wishes for ${wish}.`;
  }
  return `${winnerName} wishes for ${wish}.`;
}
