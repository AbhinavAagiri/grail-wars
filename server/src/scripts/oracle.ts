/**
 * Live Oracle probe.
 *
 * Runs the power-scaling engine against real, well-known characters and prints
 * what it extracted, with a loose sanity check on the peak tier. This is the
 * fastest way to notice when the VS Battles parser drifts from the real pages.
 *
 *   npm run oracle
 *   npm run oracle -- "Goku|Dragon Ball" "John Wick|John Wick"
 *   npm run oracle -- --images "Goku|Dragon Ball"
 *
 * Results are cached for a week, so by default the probe clears the profile
 * cache first — otherwise it would just reprint whatever the previous parser
 * version produced. Pass --cached to keep the cache (and be fast).
 *
 * It hits the network, so it is a manual QA tool, not part of `npm test`.
 */
import type { Character } from '@hgd/shared';
import { buildImageCandidates, researchCharacter } from '../research';
import { clearCache } from '../research/cache';
import { TIERS } from '../research/tiers';
import { generatedAvatar } from '../util/imageUrl';
import { canonicalKey } from '../util/text';

interface Expectation {
  name: string;
  source: string;
  /** minimum acceptable index into TIERS */
  min?: number;
  /** maximum acceptable index into TIERS */
  max?: number;
}

/**
 * Deliberately generous bounds. These only catch gross parser failures — a
 * character landing somewhere inside the band still needs a human eyeball.
 */
const DEFAULTS: Expectation[] = [
  { name: 'Goku', source: 'Dragon Ball', min: 27 }, // 2-C or higher at peak
  { name: 'Saitama', source: 'One Punch Man', min: 22 }, // 4-B or higher
  { name: 'Naruto Uzumaki', source: 'Naruto', min: 16 }, // 6-B or higher
  { name: 'Monkey D. Luffy', source: 'One Piece', min: 16 },
  { name: 'Ichigo Kurosaki', source: 'Bleach', min: 16 },
  // Gojo has no bound: the wiki's own number is the best available answer, and
  // inventing an expectation here would only create a false failure.
  { name: 'Satoru Gojo', source: 'Jujutsu Kaisen' },
  { name: 'John Wick', source: 'John Wick', max: 12 },
  { name: 'Sherlock Holmes', source: 'Sherlock Holmes', max: 12 },
  { name: 'Frodo Baggins', source: 'The Lord of the Rings', max: 12 },
];

function parseTarget(raw: string): Expectation {
  const [name = '', source = ''] = raw.split('|').map((s) => s.trim());
  return { name, source: source || 'Unknown' };
}

function tierLabel(index: number): string {
  const rounded = Math.max(0, Math.min(TIERS.length - 1, Math.round(index)));
  return TIERS[rounded]!;
}

function classify(index: number, expectation: Expectation): { ok: boolean; note: string } {
  const { min, max } = expectation;
  if (min !== undefined && index < min) {
    return { ok: false, note: `below expectation (wanted >= ${tierLabel(min)})` };
  }
  if (max !== undefined && index > max) {
    return { ok: false, note: `above expectation (wanted <= ${tierLabel(max)})` };
  }
  if (min === undefined && max === undefined) {
    return { ok: true, note: 'no expectation recorded' };
  }
  const bound = min !== undefined ? `>= ${tierLabel(min)}` : `<= ${tierLabel(max!)}`;
  return { ok: true, note: `within expectation (${bound})` };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const withImages = process.argv.includes('--images');
  const targets = args.length ? args.map(parseTarget) : DEFAULTS;

  if (!process.argv.includes('--cached')) clearCache();

  process.stdout.write(`Consulting the Throne of Heroes for ${targets.length} characters…\n\n`);

  let passed = 0;
  for (const target of targets) {
    const character: Character = {
      key: canonicalKey('custom', undefined, target.name, target.source),
      name: target.name,
      source: target.source,
      provider: 'custom',
      imageUrl: generatedAvatar(target.name),
      submittedBy: 'probe',
    };

    const started = Date.now();
    let profile;
    try {
      profile = await researchCharacter(character);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stdout.write(`✗ ${target.name} — research threw: ${message}\n\n`);
      continue;
    }
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const verdict = classify(profile.tierIndex, target);
    if (verdict.ok) passed += 1;

    const reliability = profile.sources.some((s) => s.label === 'VS Battles Wiki')
      ? 'vsb'
      : profile.sources[0]?.label ?? 'heuristics';

    process.stdout.write(
      [
        `${verdict.ok ? '✓' : '✗'} ${target.name} — ${target.source}  [${elapsed}s, ${reliability}]`,
        `    peak tier   ${profile.tierPeak}   (index ${profile.tierIndex.toFixed(2)} = ${tierLabel(profile.tierIndex)})`,
        `    speed       ${profile.speed}`,
        `    durability  ${profile.durability}`,
        `    range       ${profile.range}`,
        `    intel       ${profile.intelligence}   hax ${profile.haxScore.toFixed(0)}   score ${profile.baseScore.toFixed(1)}   confidence ${profile.confidence}`,
        `    abilities   ${profile.abilities.length ? profile.abilities.join(', ') : '(none found)'}`,
        `    key move    ${profile.keyAbilityName}`,
        `    tags        ${profile.tags.join(', ')}   archetype ${profile.archetype}   alignment ${profile.alignment}`,
        `    sources     ${profile.sources.map((s) => s.label).join(', ') || '(none)'}`,
        `    ${verdict.note}`,
      ].join('\n') + '\n',
    );

    if (withImages) {
      const images = await buildImageCandidates(character);
      process.stdout.write(`    images      ${images.length} candidate(s)\n`);
      for (const [i, url] of images.entries()) {
        process.stdout.write(`      [${i}] ${url.slice(0, 120)}\n`);
      }
    }
    process.stdout.write('\n');
  }

  process.stdout.write(`${passed}/${targets.length} within expectation.\n`);
  if (passed < targets.length) process.exitCode = 1;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`oracle probe failed: ${message}\n`);
  process.exitCode = 1;
});
