import { describe, expect, it } from 'vitest';
import { fallbackTier } from '../src/research/heuristics';

/*
 * A missing wiki page used to drop every character to 10-C ("historical human
 * baseline"). Fictional characters now floor at 9-C, the keyword ladder knows
 * the archetypes a draft actually produces, and real people keep the historic
 * ladder they always had.
 */

describe('fallbackTier — fictional characters', () => {
  it('floors an unrecognised fighter at street level instead of human baseline', () => {
    expect(fallbackTier('a mysterious wanderer', { fiction: true }).tier).toBe('9-C');
    expect(fallbackTier('a mysterious wanderer').tier).toBe('10-C');
  });

  it('recognises the archetypes', () => {
    expect(fallbackTier('a wandering swordsman', { fiction: true }).tier).toBe('9-B');
    expect(fallbackTier('a young samurai and his blade', { fiction: true }).tier).toBe('9-B');
    expect(fallbackTier('a demon lord from another world', { fiction: true }).tier).toBe('7-A');
    expect(fallbackTier('a pirate captain', { fiction: true }).tier).toBe('9-C');
    expect(fallbackTier('a vampire hunter', { fiction: true }).tier).toBe('9-A');
  });
});

describe('fallbackTier — real people', () => {
  it('keeps the historical ladder', () => {
    expect(fallbackTier('a samurai retainer').tier).toBe('9-B');
    expect(fallbackTier('a soldier of fortune').tier).toBe('10-B');
    expect(fallbackTier('an unknown figure').tier).toBe('10-C');
  });
});
