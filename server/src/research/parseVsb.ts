import * as cheerio from 'cheerio';
import { parseTierTokens, TIERS } from './tiers';

export const VSB_LABELS = [
  'Tier',
  'Name',
  'Origin',
  'Gender',
  'Age',
  'Classification',
  'Powers and Abilities',
  'Attack Potency',
  'Speed',
  'Lifting Strength',
  'Striking Strength',
  'Durability',
  'Stamina',
  'Range',
  'Standard Equipment',
  'Intelligence',
  'Weaknesses',
  'Key',
  'Notable Attacks/Techniques',
  'Notable Victories',
] as const;

export type VsBLabel = (typeof VSB_LABELS)[number];

export interface VsBStats {
  title: string;
  fields: Partial<Record<VsBLabel, string>>;
  categories: string[];
  imageUrl?: string;
  /** true when the page has no recognisable stat block at all */
  empty: boolean;
}

const MAX_FIELD_CHARS = 6000;
const MAX_FIELD_LINES = 60;

/** Convert wiki HTML into trimmed text lines, preserving block boundaries. */
const MARKUP_RE = /<[^>]*>/g;
const ATTR_RE = /\b(?:style|src|srcset|class|width|height|data-[\w-]+|alt|loading)\s*=\s*(?:"[^"]*"|'[^']*')/gi;

/** Strip any markup that survived HTML parsing inside a text field. */
function stripMarkup(line: string): string {
  return line.replace(MARKUP_RE, ' ').replace(ATTR_RE, ' ').replace(/\s+/g, ' ').trim();
}

/** Convert wiki HTML into trimmed text lines, preserving block boundaries. */
export function htmlToLines(html: string): string[] {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|dd|dt|h1|h2|h3|h4|h5|h6|section|table|gallery|figure)>/gi, '\n')
    .replace(/<(p|div|li|tr|dd|dt|h1|h2|h3|h4|h5|h6|section|table|gallery|figure)\b[^>]*>/gi, '\n');
  const $ = cheerio.load(`<div id="hgd-root">${withBreaks}</div>`);
  // Elements that never contribute character prose — but do leak captions,
  // file names and raw markup into the flattened text.
  $(
    '#hgd-root script, #hgd-root style, #hgd-root sup.reference, #hgd-root gallery, ' +
      '#hgd-root figure, #hgd-root img, #hgd-root audio, #hgd-root video, ' +
      '#hgd-root .navbox, #hgd-root .toc, #hgd-root .reference, #hgd-root .mw-collapsible-toggle',
  ).remove();
  return $('#hgd-root')
    .text()
    .split('\n')
    .map(stripMarkup)
    // Keep only lines carrying real words, so tag leftovers never become stats.
    .filter((line) => /[A-Za-z]{2,}/.test(line));
}

const LABEL_SET = new Set<string>(VSB_LABELS.map((l) => l.toLowerCase()));

/**
 * Flatten a page into a label→value map.
 *
 * VS Battles pages render stats as bold labels followed by their value; we scan
 * the flattened text for "<Label>: <value>" and join continuation lines until the
 * next label or a section heading appears.
 */
export function extractFields(lines: string[]): Partial<Record<VsBLabel, string>> {
  const fields: Partial<Record<VsBLabel, string>> = {};
  let current: VsBLabel | null = null;
  let buffer: string[] = [];
  let lineCount = 0;

  const flush = () => {
    if (current && buffer.length) {
      const joined = buffer.join(' ').trim();
      if (joined) {
        const existing = fields[current];
        fields[current] = ((existing ? `${existing} ` : '') + joined).slice(0, MAX_FIELD_CHARS);
      }
    }
    buffer = [];
    lineCount = 0;
  };

  for (const line of lines) {
    const match = line.match(/^([A-Za-z][A-Za-z /'-]{1,40}?)\s*:\s*(.*)$/);
    if (match) {
      const label = match[1].trim().toLowerCase();
      if (LABEL_SET.has(label)) {
        flush();
        current = (VSB_LABELS.find((l) => l.toLowerCase() === label) ?? null) as VsBLabel | null;
        if (match[2].trim()) buffer.push(match[2].trim());
        lineCount = 1;
        continue;
      }
    }
    if (!current) continue;
    // A bare heading matching a known label ends the current value.
    if (LABEL_SET.has(line.toLowerCase())) {
      flush();
      current = null;
      continue;
    }
    if (lineCount >= MAX_FIELD_LINES) continue;
    buffer.push(line);
    lineCount++;
  }
  flush();
  return fields;
}

export function parseVsbPage(html: string, title = '', categories: string[] = []): VsBStats {
  const $ = cheerio.load(html);
  const content = $('.mw-parser-output').length ? $('.mw-parser-output').html() ?? '' : $('body').html() ?? '';
  const lines = htmlToLines(content);
  const fields = extractFields(lines);

  let imageUrl: string | undefined;
  const infobox = $('.infobox img, .pi-image-thumbnail, figure img').first();
  const src = infobox.attr('src') ?? infobox.attr('data-src');
  if (src) imageUrl = src.startsWith('//') ? `https:${src}` : src;

  const pageTitle = title || $('h1.firstHeading').text().trim() || $('#firstHeading').text().trim();

  return {
    title: pageTitle,
    fields,
    categories,
    imageUrl,
    empty: !fields.Tier && !fields['Attack Potency'] && !fields['Powers and Abilities'],
  };
}

export interface VsBSearchHit {
  title: string;
  pageId: number;
  snippet: string;
}

/** Normalise a MediaWiki search payload. */
export function parseVsbSearch(payload: unknown): VsBSearchHit[] {
  const results = (payload as any)?.query?.search;
  if (!Array.isArray(results)) return [];
  return results
    .map((r: any) => ({
      title: String(r?.title ?? '').trim(),
      pageId: Number(r?.pageid ?? 0),
      snippet: String(r?.snippet ?? '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    }))
    .filter((r) => r.title.length > 0);
}

/**
 * Characters often have several tiers listed ("At least 5-B, likely 4-C").
 * Return the highest accepted token so we scale on peak feats.
 */
export function highestTierToken(text: string): { label: string; index: number } | null {
  const tokens = parseTierTokens(text).filter((t) => !t.ignored);
  if (!tokens.length) return null;
  let best = tokens[0];
  for (const t of tokens) if (t.index > best.index) best = t;
  return { label: best.text, index: best.index };
}

/** Does the tier text mention any tier at all (even an ignored/uncertain one)? */
export function mentionsAnyTier(text: string): boolean {
  return /\b\d{1,2}-[ABC]\b/.test(text) || /\bHigh 1-A\b/.test(text) || TIERS.some((t) => text.includes(t));
}
