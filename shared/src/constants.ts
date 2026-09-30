/**
 * Shared constants for Grail Wars.
 * Imported by both the server and the client — keep this file free of runtime deps.
 */

/** Every Servant class the game knows about, in canonical display order. */
export const CLASSES = [
  'saber',
  'archer',
  'lancer',
  'rider',
  'caster',
  'assassin',
  'berserker',
  'shielder',
  'ruler',
  'avenger',
] as const;

export type ServantClass = (typeof CLASSES)[number];

/**
 * The seven standard classes, drafted by default. Shielder / Ruler / Avenger
 * are the "extra" classes a host can switch on in the lobby.
 */
export const DEFAULT_CLASSES: ServantClass[] = [
  'saber',
  'archer',
  'lancer',
  'rider',
  'caster',
  'assassin',
  'berserker',
];
interface ClassMeta {
  label: string;
  color: string;
  icon: string;
  flavor: string;
  /** who the class accepts, shown in the draft so picks are not a guess */
  qualifies: string;
  /** shown in the in-draft info popup */
  description: string;
}

export const CLASS_META: Record<ServantClass, ClassMeta> = {
  saber: {
    label: 'Saber',
    color: '#4f8cff',
    icon: '⚔️',
    flavor: 'The knight. Balanced, honorable, or just really good with a sword.',
    qualifies: 'Swordsmen and swordswomen — anyone whose legend is built on a blade.',
    description:
      'The knight class, and usually the strongest in a straight fight. Sabers are heroes whose legend is built on swordplay, with high stats across the board and a famous blade as their Noble Phantasm.',
  },
  archer: {
    label: 'Archer',
    color: '#ef6a3c',
    icon: '🏹',
    flavor: 'Range is power. Marksmen, gunslingers, and arrogant heroes.',
    qualifies: 'Marksmen, archers, snipers and gunslingers — anyone who fights at range.',
    description:
      'Marksmen, snipers and projectile legends. Archery is not required — anything that strikes from a distance counts. They can attack from anywhere, but tend to be prideful and fragile up close.',
  },
  lancer: {
    label: 'Lancer',
    color: '#2fbf71',
    icon: '🔱',
    flavor: 'Speed and reach. Spears, polearms, and fast fighters.',
    qualifies: 'Spear and polearm wielders — and the legends written about them.',
    description:
      'Spear-wielders with the best speed and reach in the war. Lancers strike first, strike fast, and are famously unlucky — a running joke in the Fate franchise.',
  },
  rider: {
    label: 'Rider',
    color: '#f5b301',
    icon: '🐎',
    flavor: 'Mounts, vehicles, conquerors, and legends who never walk.',
    qualifies: 'Riders, cavalry, sailors, pilots and conquerors who command a mount or army.',
    description:
      'Riders command a mount, vehicle or army no one else can. Their Noble Phantasm is whatever they ride. They win through mobility and battlefield control rather than raw power.',
  },
  caster: {
    label: 'Caster',
    color: '#a855f7',
    icon: '🔮',
    flavor: 'Magic, science, tricks. The brains of the war.',
    qualifies: 'Mages, sorcerers and scientists — anyone whose power is knowledge or magic.',
    description:
      'Magicians, scientists and schemers. Physically the weakest class, Casters win by preparing the battlefield — territory creation, traps, and reality-bending magecraft.',
  },
  assassin: {
    label: 'Assassin',
    color: '#7c8aa0',
    icon: '🗡️',
    flavor: 'Stealth, poison, and surprise. Cowards or professionals.',
    qualifies: 'Assassins, ninja, spies and poisoners — anyone who kills from the shadows.',
    description:
      'The class of stealth and murder. Assassins excel at killing Masters and striking from the shadows, but they almost never win an open, honest duel.',
  },
  berserker: {
    label: 'Berserker',
    color: '#b3283d',
    icon: '💢',
    flavor: 'Rage, monsters, and raw power. Sanity optional.',
    qualifies: 'Monsters, brawlers and warriors who fight with rage or raw strength.',
    description:
      'Heroes driven mad in exchange for power. Berserkers have enormous strength and endurance but cannot be reasoned with, controlled, or persuaded to retreat.',
  },
  shielder: {
    label: 'Shielder',
    color: '#4aa3df',
    icon: '🛡️',
    flavor: 'The guardian. Nothing gets past the shield.',
    qualifies: 'Shield-bearers, guardians and bodyguards — anyone defined by defence.',
    description:
      'A guardian class defined entirely by defence. Shielders protect their Master and their allies, absorbing blows that would kill anyone else — but they struggle to finish a fight.',
  },
  ruler: {
    label: 'Ruler',
    color: '#d9c27a',
    icon: '⚖️',
    flavor: 'The overseer. Neutral, absolute, and above the rules.',
    qualifies: 'Kings, queens, judges and saints — figures of authority placed above the war.',
    description:
      'An impartial overseer summoned to keep the Grail War honest. Rulers are neutral, extremely powerful, and hold authority over the aberrant classes themselves.',
  },
  avenger: {
    label: 'Avenger',
    color: '#8e3b6e',
    icon: '😈',
    flavor: 'Born from grudges. The more you hurt them, the stronger they get.',
    qualifies: 'The wronged, the vengeful and the cursed — anyone fuelled by a grudge.',
    description:
      'Servants born from hatred and resentment. Avengers grow more dangerous the more they are wronged — vengeance itself is their fuel, and the Grail loves to grant it.',
  },
};

/** Classes a room actually drafts: the enabled subset, kept in canonical order. */
export function enabledClasses(classes?: readonly ServantClass[]): ServantClass[] {
  const enabled = new Set(classes && classes.length ? classes : DEFAULT_CLASSES);
  const ordered = CLASSES.filter((cls) => enabled.has(cls));
  return ordered.length ? ordered : [...DEFAULT_CLASSES];
}

/** The roster buckets the AI-Chooses dropdown offers, in display order. */
export const AI_POOLS = ['anime', 'history', 'mixed'] as const;

export const LIMITS = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS_DEFAULT: 7,
  MAX_PLAYERS_EXTENDED: 14,
  NAME_MAX: 24,
  CHAT_MAX: 300,
  CHARACTER_NAME_MAX: 80,
  UPLOAD_MAX_BYTES: 3 * 1024 * 1024,
  IMAGE_PROXY_MAX_BYTES: 5 * 1024 * 1024,
  ROOM_IDLE_TTL_MS: 4 * 60 * 60 * 1000,
  RECONNECT_GRACE_MS: 60_000,
} as const;

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O
export const ROOM_CODE_LENGTH = 4;

/** Fixed avatar palette for player chips. */
export const PLAYER_COLORS = [
  '#4f8cff',
  '#2fbf71',
  '#f5b301',
  '#a855f7',
  '#ef6a3c',
  '#3fb27f',
  '#e0a3c8',
  '#7c8aa0',
  '#c9a45c',
  '#b3283d',
  '#5ac8d8',
  '#8f7237',
  '#9d7bd6',
  '#d98b4a',
] as const;

export const DEFAULT_SETTINGS = {
  mode: 'WAR',
  maxPlayers: LIMITS.MAX_PLAYERS_DEFAULT,
  extendedWar: false,
  draftTimerSec: 0,
  avoidOwnPick: true,
  allowSpectators: true,
  /** which servant classes take part in the draft and war */
  classes: DEFAULT_CLASSES,
  /** when on, the game deals 25 characters per class instead of free search */
  aiChooses: false,
  /** which roster AI-Chooses draws from; ignored while aiChooses is off */
  aiPool: 'mixed',
  war: {
    days: 5,
    minEventsPerDay: 5,
    maxEventsPerDay: 7,
    narration: 'templated',
    /** how the Grail War's real-world location is chosen */
    locationMode: 'ai',
    autoplayMs: 7000,
    classAdvantage: true,
    commandSpellRescues: true,
    goreLevel: 'standard',
  },
  debate: {
    argueSec: 90,
    voteSec: 20,
    tieBreak: 'host',
    ownersVote: false,
    showOracleCards: true,
  },
} as const;

export const WISH_TEMPLATES: Record<'good' | 'neutral' | 'evil', string[]> = {
  good: [
    'a world where no one has to be summoned again',
    'the chance to go home and see the people they left behind',
    'a second life for everyone they failed to save',
    'an end to the war itself',
    'peace for the ones who never asked to fight',
  ],
  neutral: [
    'nothing more than a look at what the Grail really does',
    'a long rest and a quiet place to spend it',
    'answers to a question they never said out loud',
    'the memory of everything that happened here',
    'one more match against a worthy opponent',
  ],
  evil: [
    'a world reshaped to their design',
    'the power to never lose again',
    'every rival erased from the record',
    'a crown, and everyone else kneeling',
    'the Grail itself, and everything it can grant',
  ],
};
