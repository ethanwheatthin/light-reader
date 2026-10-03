export interface TextPart {
  text: string;
  /** Parts with different keys are never joined into one sentence. */
  blockKey: unknown;
}

export interface SentenceSegment {
  part: number;
  start: number;
  end: number;
}

export interface Sentence {
  text: string;
  segments: SentenceSegment[];
}

const ABBREVIATION =
  /(?:^|[\s("'“‘[])(?:Mr|Mrs|Ms|Mx|Dr|Prof|Sr|Jr|St|Mt|Ft|Gen|Col|Capt|Cpt|Lt|Sgt|Maj|Cmdr|Adm|Rev|Hon|Sen|Rep|Gov|Pres|Messrs|Mmes|Mme|Mlle|vs|cf|e\.g|i\.e)\.$/i;
/** Single capital plus period ("J." in "J. K. Rowling"); "I." is excluded as the pronoun. */
const INITIAL = /(?:^|[\s("'“‘[])[A-HJ-Z]\.$/;

type RawSegment = { index: number; segment: string };

/** The segmenter breaks after "Mr. " before a capital; glue those pieces back together. */
function mergeAbbreviationBreaks(full: string, raw: RawSegment[]): RawSegment[] {
  const merged: RawSegment[] = [];
  for (let i = 0; i < raw.length; i++) {
    const { index } = raw[i];
    let segment = raw[i].segment;
    for (;;) {
      const trimmed = segment.trimEnd();
      const crossesBlock = segment.slice(trimmed.length).includes('\n');
      if (i + 1 >= raw.length || crossesBlock) break;
      if (!ABBREVIATION.test(trimmed) && !INITIAL.test(trimmed)) break;
      i++;
      segment = full.slice(index, raw[i].index + raw[i].segment.length);
    }
    merged.push({ index, segment });
  }
  return merged;
}

/** Split text parts (e.g. DOM text nodes) into sentences, keeping their source offsets. */
export function splitSentences(parts: TextPart[], locale = 'en'): Sentence[] {
  let full = '';
  const spans: { part: number; start: number; end: number }[] = [];
  parts.forEach((p, i) => {
    if (i > 0 && parts[i - 1].blockKey !== p.blockKey) full += '\n';
    spans.push({ part: i, start: full.length, end: full.length + p.text.length });
    full += p.text;
  });

  let segmenter: Intl.Segmenter;
  try {
    segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
  } catch {
    segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  }

  const sentences: Sentence[] = [];
  const raw = Array.from(segmenter.segment(full), (s) => ({ index: s.index, segment: s.segment }));
  for (const { index, segment } of mergeAbbreviationBreaks(full, raw)) {
    const trimmed = segment.trim();
    if (!/[\p{L}\p{N}]/u.test(trimmed)) continue;
    const start = index + (segment.length - segment.trimStart().length);
    const end = start + trimmed.length;

    const segments: SentenceSegment[] = [];
    for (const span of spans) {
      if (span.end <= start) continue;
      if (span.start >= end) break;
      const s = Math.max(start, span.start);
      const e = Math.min(end, span.end);
      if (e > s) segments.push({ part: span.part, start: s - span.start, end: e - span.start });
    }
    sentences.push({ text: trimmed.replace(/\s+/g, ' '), segments });
  }
  return sentences;
}
