import { Injectable, inject, signal } from '@angular/core';
import { TtsApiService } from '../../../../core/services/tts-api.service';
import { TtsSettingsService } from '../../../../core/services/tts-settings.service';
import { splitSentences } from './sentence-splitter';

export type TtsState = 'idle' | 'loading' | 'playing' | 'paused';

interface LiveSentence {
  text: string;
  ranges: Range[];
}

const PREFETCH_AHEAD = 2;
const HIGHLIGHT_NAME = 'tts-sentence';
const STYLE_ID = 'tts-highlight-style';
const NAV_GRACE_MS = 800;
const BLOCK_SELECTOR =
  'p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre,tr,td,th,section,article,figcaption,dt,dd,body';
const SKIP_SELECTOR = 'script,style,noscript,svg,[hidden]';

/**
 * Reads the current epub section aloud via a Speaches server, one sentence at a
 * time, highlighting the sentence being spoken and turning pages as needed.
 * Provided at the component level; call `setRendition()` after epub.js renders.
 */
@Injectable()
export class EpubTtsService {
  private api = inject(TtsApiService);
  private cfg = inject(TtsSettingsService);

  state = signal<TtsState>('idle');
  error = signal<string | null>(null);

  private rendition: any = null;
  private contents: any = null;
  private doc: Document | null = null;
  private sentences: LiveSentence[] = [];
  private index = 0;
  private runId = 0;
  private audio: HTMLAudioElement | null = null;
  private cache = new Map<number, Promise<string>>();
  private abort: AbortController | null = null;
  private userPaused = false;
  private resumeWaiter: (() => void) | null = null;
  private endCurrent: (() => void) | null = null;
  private pendingJump: number | null = null;
  private navigating = false;
  private navGraceUntil = 0;

  setRendition(rendition: any): void {
    if (this.rendition && this.rendition !== rendition) this.stop();
    this.rendition = rendition;
  }

  /** Begin reading from the first sentence on the visible page. */
  async start(): Promise<void> {
    if (!this.rendition) return;
    if (!this.cfg.serverUrl().trim()) {
      this.error.set('Set your TTS server URL under Settings → Read aloud.');
      return;
    }
    this.halt();
    const run = this.runId;
    this.error.set(null);
    this.userPaused = false;
    this.state.set('loading');
    this.abort = new AbortController();
    try {
      this.loadSection(true);
      await this.playLoop(run);
    } catch (e) {
      if (run === this.runId) this.fail(e);
    }
  }

  pause(): void {
    if (this.state() === 'idle' || this.userPaused) return;
    this.userPaused = true;
    this.audio?.pause();
    this.state.set('paused');
  }

  resume(): void {
    if (!this.userPaused) return;
    this.userPaused = false;
    if (this.audio) {
      this.state.set('playing');
      this.audio.play().catch((e) => this.fail(e));
    } else {
      this.state.set('loading');
    }
    this.resumeWaiter?.();
  }

  toggle(): void {
    if (this.state() === 'idle') void this.start();
    else if (this.userPaused) this.resume();
    else this.pause();
  }

  /** Jump forward (+1) or back (-1) by sentences. */
  skip(delta: number): void {
    if (this.state() === 'idle') return;
    this.pendingJump = Math.max(0, this.index + delta);
    this.endCurrent?.();
    this.resumeWaiter?.();
  }

  stop(): void {
    this.halt();
    this.state.set('idle');
  }

  /** Call from the reader's relocated handler; restarts when the user turns pages manually. */
  onRelocated(): void {
    if (this.state() === 'idle') return;
    if (this.navigating || Date.now() < this.navGraceUntil) return;
    const wasPaused = this.userPaused;
    void this.start().then(() => {
      if (wasPaused) this.pause();
    });
  }

  // ---------------------------------------------------------------------------
  // Playback loop
  // ---------------------------------------------------------------------------

  private async playLoop(run: number): Promise<void> {
    let emptySections = 0;
    while (run === this.runId) {
      if (this.index >= this.sentences.length) {
        emptySections = this.sentences.length === 0 ? emptySections + 1 : 0;
        if (emptySections > 30) break;
        this.clearHighlight();
        const moved = await this.advanceSection();
        if (run !== this.runId) return;
        if (!moved) break;
        this.loadSection(false);
        continue;
      }

      await this.speak(this.index, run);
      if (run !== this.runId) return;

      if (this.pendingJump !== null) {
        this.index = Math.min(this.pendingJump, this.sentences.length);
        this.pendingJump = null;
      } else {
        this.index++;
      }
    }
    if (run === this.runId) this.stop();
  }

  private async speak(i: number, run: number): Promise<void> {
    const url = await this.ensure(i);
    if (run !== this.runId) return;
    for (let j = 1; j <= PREFETCH_AHEAD; j++) void this.ensure(i + j);

    while (this.userPaused && run === this.runId && this.pendingJump === null) {
      await new Promise<void>((resolve) => (this.resumeWaiter = resolve));
      this.resumeWaiter = null;
    }
    if (run !== this.runId || this.pendingJump !== null) return;

    this.highlight(this.sentences[i]);
    await this.ensureVisible(this.sentences[i]);
    if (run !== this.runId) return;

    await new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      this.audio = audio;
      this.endCurrent = resolve;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('Audio playback failed.'));
      audio.play().then(() => {
        if (run === this.runId && !this.userPaused) this.state.set('playing');
      }, reject);
    });
    this.audio = null;
    this.endCurrent = null;
    this.release(i);
  }

  private ensure(i: number): Promise<string> {
    const existing = this.cache.get(i);
    if (existing) return existing;
    const sentence = this.sentences[i];
    if (!sentence) return new Promise(() => undefined);
    const p = this.api
      .synthesize(
        this.cfg.serverUrl(),
        {
          model: this.cfg.model(),
          voice: this.cfg.voice(),
          speed: this.cfg.speed(),
          input: sentence.text,
        },
        this.abort?.signal,
      )
      .then((blob) => URL.createObjectURL(blob));
    p.catch(() => undefined);
    this.cache.set(i, p);
    return p;
  }

  private release(i: number): void {
    const p = this.cache.get(i);
    this.cache.delete(i);
    p?.then((u) => URL.revokeObjectURL(u), () => undefined);
  }

  private halt(): void {
    this.runId++;
    this.abort?.abort();
    this.abort = null;
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio = null;
    }
    for (const p of this.cache.values()) p.then((u) => URL.revokeObjectURL(u), () => undefined);
    this.cache.clear();
    this.endCurrent?.();
    this.endCurrent = null;
    this.resumeWaiter?.();
    this.resumeWaiter = null;
    this.pendingJump = null;
    this.userPaused = false;
    this.clearHighlight();
    this.sentences = [];
    this.index = 0;
  }

  private fail(e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    const unreachable = e instanceof TypeError;
    this.halt();
    this.state.set('idle');
    this.error.set(
      unreachable ? 'Could not reach the TTS server. Check the URL under Settings → Read aloud.' : message,
    );
  }

  // ---------------------------------------------------------------------------
  // Section / DOM handling
  // ---------------------------------------------------------------------------

  private loadSection(fromVisible: boolean): void {
    const list: any[] = this.rendition.getContents() ?? [];
    const startIndex = this.rendition.currentLocation()?.start?.index;
    const contents = list.find((c) => c.sectionIndex === startIndex) ?? list[0];
    const doc: Document | undefined = contents?.document;
    this.contents = contents;
    this.doc = doc ?? null;
    this.sentences = [];
    this.index = 0;
    if (!doc?.body) return;

    const nodes: Text[] = [];
    const keys: Element[] = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.parentElement?.closest(SKIP_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const text = n as Text;
      nodes.push(text);
      keys.push(text.parentElement?.closest(BLOCK_SELECTOR) ?? doc.body);
    }

    const parts = nodes.map((node, i) => ({ text: node.data, blockKey: keys[i] }));
    const lang = doc.documentElement.lang || 'en';
    this.sentences = splitSentences(parts, lang).map((s) => ({
      text: s.text,
      ranges: s.segments.map((seg) => {
        const r = doc.createRange();
        r.setStart(nodes[seg.part], seg.start);
        r.setEnd(nodes[seg.part], seg.end);
        return r;
      }),
    }));

    if (fromVisible) this.index = this.firstVisibleIndex();
  }

  private firstVisibleIndex(): number {
    try {
      const startCfi = this.rendition.currentLocation()?.start?.cfi;
      if (!startCfi) return 0;
      const startRange: Range = this.contents.range(startCfi);
      const i = this.sentences.findIndex((s) => {
        const last = s.ranges[s.ranges.length - 1];
        return last.compareBoundaryPoints(Range.END_TO_START, startRange) > 0;
      });
      return i === -1 ? 0 : i;
    } catch {
      return 0;
    }
  }

  /** Turn the page if the sentence ends beyond what is currently visible. */
  private async ensureVisible(sentence: LiveSentence): Promise<void> {
    try {
      const loc = this.rendition.currentLocation();
      if (!loc?.end?.cfi || loc.end.index !== this.contents.sectionIndex) return;
      const endRange: Range = this.contents.range(loc.end.cfi);
      const last = sentence.ranges[sentence.ranges.length - 1];
      if (last.compareBoundaryPoints(Range.END_TO_END, endRange) <= 0) return;
      const cfi = this.contents.cfiFromRange(sentence.ranges[0]);
      await this.navigate(() => this.rendition.display(cfi));
    } catch (e) {
      console.warn('TTS: could not scroll to sentence', e);
    }
  }

  /** Move to the next section, returns false at the end of the book. */
  private async advanceSection(): Promise<boolean> {
    const before = this.rendition.currentLocation();
    const beforeIndex = before?.start?.index;
    for (let i = 0; i < 50; i++) {
      const prev = this.rendition.currentLocation()?.start?.cfi;
      await this.navigate(() => this.rendition.next());
      const loc = this.rendition.currentLocation();
      if (!loc?.start?.cfi || loc.start.cfi === prev) return false;
      if (loc.start.index !== beforeIndex) return true;
    }
    return false;
  }

  private async navigate(fn: () => Promise<unknown>): Promise<void> {
    this.navigating = true;
    try {
      await fn();
      await new Promise((r) => setTimeout(r, 100));
    } finally {
      this.navigating = false;
      this.navGraceUntil = Date.now() + NAV_GRACE_MS;
    }
  }

  // ---------------------------------------------------------------------------
  // Highlighting (CSS Custom Highlight API, no DOM mutation)
  // ---------------------------------------------------------------------------

  private highlight(sentence: LiveSentence): void {
    const doc = this.doc;
    const win = doc?.defaultView as any;
    if (!doc || !win?.CSS?.highlights || !win.Highlight) return;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `::highlight(${HIGHLIGHT_NAME}) { background-color: rgba(255, 200, 0, 0.4); }`;
      doc.head.appendChild(style);
    }
    win.CSS.highlights.set(HIGHLIGHT_NAME, new win.Highlight(...sentence.ranges));
  }

  private clearHighlight(): void {
    try {
      (this.doc?.defaultView as any)?.CSS?.highlights?.delete(HIGHLIGHT_NAME);
    } catch {
      // iframe may already be gone
    }
  }
}
