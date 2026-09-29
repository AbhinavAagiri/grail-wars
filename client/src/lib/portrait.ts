import type { Character } from '@hgd/shared';
import { generatedAvatar } from './avatar';

/** Best portrait for a character, always non-empty. */
export function portraitFor(character: Character | undefined, name: string): string {
  return character?.imageUrl || generatedAvatar(name);
}
