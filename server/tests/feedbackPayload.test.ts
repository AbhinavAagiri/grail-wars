import { describe, expect, it } from 'vitest';
import { buildWebhookPayload } from '../src/api/feedback';

/*
 * The visitor's optional email used to reach no one: the recipe read `data.email`
 * while the server only sent `replyTo`, so the owner got a message "from
 * themselves" with no way to reply. Both keys are sent now.
 */

describe('the feedback webhook payload', () => {
  it('carries the visitor address under both keys a recipe may read', () => {
    const payload = buildWebhookPayload(
      { topic: 'bug', name: 'Ada', email: 'ada@example.com', message: 'Day 3 skipped a fight.' },
      'owner@example.com',
    );
    expect(payload.to).toBe('owner@example.com');
    expect(payload.subject).toBe('Grail Wars feedback (bug)');
    expect(payload.name).toBe('Ada');
    expect(payload.email).toBe('ada@example.com');
    expect(payload.replyTo).toBe('ada@example.com');
    expect(payload.message).toBe('Day 3 skipped a fight.');
    expect(payload.site).toBe('Grail Wars');
  });

  it('omits the address when the visitor left the field empty', () => {
    const payload = buildWebhookPayload(
      { topic: 'other', name: '', email: '', message: 'Love the game.' },
      'owner@example.com',
    );
    expect(payload.name).toBe('Anonymous');
    expect(payload.email).toBeUndefined();
    expect(payload.replyTo).toBeUndefined();
  });
});
