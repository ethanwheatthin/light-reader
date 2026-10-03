import { describe, it, expect } from 'vitest';
import { splitSentences } from './sentence-splitter';

describe('splitSentences', () => {
  it('splits one text part into sentences with offsets', () => {
    const text = 'Hello there. How are you?';
    const out = splitSentences([{ text, blockKey: 'a' }]);
    expect(out.map((s) => s.text)).toEqual(['Hello there.', 'How are you?']);
    const seg = out[1].segments[0];
    expect(text.slice(seg.start, seg.end)).toBe('How are you?');
  });

  it('joins a sentence broken across inline nodes in the same block', () => {
    const out = splitSentences([
      { text: 'This is ', blockKey: 'p' },
      { text: 'bold', blockKey: 'p' },
      { text: ' text.', blockKey: 'p' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('This is bold text.');
    expect(out[0].segments.map((s) => s.part)).toEqual([0, 1, 2]);
  });

  it('never joins text from different blocks', () => {
    const out = splitSentences([
      { text: 'Chapter One', blockKey: 'h1' },
      { text: 'It was a dark night.', blockKey: 'p' },
    ]);
    expect(out.map((s) => s.text)).toEqual(['Chapter One', 'It was a dark night.']);
  });

  it('does not split after titles or initials', () => {
    const text = 'Mr. Dursley was fine. Mrs. Dursley and Dr. J. K. Smith agreed. So did I. Done.';
    const out = splitSentences([{ text, blockKey: 'p' }]);
    expect(out.map((s) => s.text)).toEqual([
      'Mr. Dursley was fine.',
      'Mrs. Dursley and Dr. J. K. Smith agreed.',
      'So did I.',
      'Done.',
    ]);
  });

  it('does not merge an abbreviation across blocks', () => {
    const out = splitSentences([
      { text: 'See Mr.', blockKey: 'a' },
      { text: 'Next paragraph.', blockKey: 'b' },
    ]);
    expect(out).toHaveLength(2);
  });

  it('skips segments without letters or digits', () => {
    const out = splitSentences([{ text: '* * *', blockKey: 'p' }]);
    expect(out).toEqual([]);
  });
});
