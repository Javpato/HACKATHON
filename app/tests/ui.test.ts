import { describe, expect, it } from 'vitest';
import { insertAtSelection, SNIPPETS } from '../src/editor/snippets';

describe('local snippet editor', () => {
  it('inserts at the caret without discarding surrounding text', () => {
    const result = insertAtSelection('before\nafter', SNIPPETS[0].text, 7, 7);
    expect(result.text.startsWith('before\n# Tema')).toBe(true);
    expect(result.text.endsWith('after')).toBe(true);
    expect(result.text.slice(result.caret)).toBe('after');
  });

  it('replaces an explicit selection', () => {
    const result = insertAtSelection('one two three', 'dos', 4, 7);
    expect(result.text).toBe('one \ndos three');
  });
});
