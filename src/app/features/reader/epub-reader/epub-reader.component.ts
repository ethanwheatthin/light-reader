import { Component, Input, Output, EventEmitter, inject, OnInit, OnDestroy, ElementRef, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import ePub from 'epubjs';
import { IndexDBService } from '../../../core/services/indexdb.service';
import { DocumentsActions } from '../../../store/documents/documents.actions';
import { ReadingProgressComponent } from './reading-progress/reading-progress.component';
import { UnifiedSettingsPanelComponent, SettingsState } from './unified-settings-panel/unified-settings-panel.component';
import {
  selectSelectedDocumentBookmarks,
  selectReadingProgress,
  selectEstimatedTimeRemaining,
  selectReadingStats,
  selectReadingGoal,
  selectTodayReadingTime,
} from '../../../store/documents/documents.selectors';
import {
  Bookmark,
  ReadingSession,
  ReaderSettings,
  DEFAULT_READER_SETTINGS,
  ThemeOption,
  FlowMode,
  SpreadMode,
  ZoomLevel,
  PageLayout,
  CustomColorPalette,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_STEP,
  READER_FONTS,
  TocItem,
} from '../../../core/models/document.model';

const STORAGE_KEY = 'epub-reader-settings';
const LOCATIONS_CACHE_PREFIX = 'epub-locations-';

@Component({
  selector: 'app-epub-reader',
  standalone: true,
  imports: [CommonModule, FormsModule, ReadingProgressComponent, UnifiedSettingsPanelComponent],
  templateUrl: './epub-reader.component.html',
  styleUrl: './epub-reader.component.css'
})
export class EpubReaderComponent implements OnInit, OnDestroy {
  @Input() documentId!: string;
  @Output() focusModeChange = new EventEmitter<boolean>();
  @ViewChild('viewer', { static: true }) viewer!: ElementRef;

  private store = inject(Store);
  private indexDB = inject(IndexDBService);
  private book: any;
  private rendition: any;

  currentLocation = '';
  canGoPrev = false;
  canGoNext = true;

  // --- Bookmarks & progress from store ---
  bookmarks$ = this.store.select(selectSelectedDocumentBookmarks);
  readingProgress$ = this.store.select(selectReadingProgress);
  estimatedTimeRemaining$ = this.store.select(selectEstimatedTimeRemaining);
  readingStats$ = this.store.select(selectReadingStats);
  readingGoal$ = this.store.select(selectReadingGoal);
  todayReadingTime$ = this.store.select(selectTodayReadingTime);

  isCurrentLocationBookmarked = signal<boolean>(false);

  // --- Page info toggle ---
  showProgress = signal<boolean>(false);

  // --- Unified panel state ---
  panelOpen = signal<boolean>(false);

  // --- Focus mode temporary controls visibility ---
  focusModeControlsVisible = signal<boolean>(false);
  private focusModeControlsTimeout: any = null;

  // --- Chapters/TOC ---
  chapters = signal<TocItem[]>([]);
  currentChapterHref = signal<string | null>(null);

  // --- Reading session tracking ---
  private sessionStartTime: Date | null = null;
  private sessionStartPage = 0;
  private currentPageNumber = 0;
  private currentCfi = '';
  private locationsReady = false;

  // --- Follow mode tracking ---
  private followModeWords: Array<{ text: string; node: Text; offset: number }> = [];
  private followModeCurrentIndex = 0;
  private followModeTimer: any = null;
  private followModeIsPaused = false;
  private followModeCurrentRange: Range | null = null;
  followModePaused = signal<boolean>(false);

  // --- Reader settings signals ---
  fontSize = signal<number>(DEFAULT_READER_SETTINGS.fontSize);
  lineHeight = signal<number>(DEFAULT_READER_SETTINGS.lineHeight);
  fontFamily = signal<string>(DEFAULT_READER_SETTINGS.fontFamily);
  theme = signal<ThemeOption>(DEFAULT_READER_SETTINGS.theme);
  flowMode = signal<FlowMode>(DEFAULT_READER_SETTINGS.flowMode);
  spreadMode = signal<SpreadMode>(DEFAULT_READER_SETTINGS.spreadMode);
  focusMode = signal<boolean>(DEFAULT_READER_SETTINGS.focusMode);
  followMode = signal<boolean>(DEFAULT_READER_SETTINGS.followMode);
  followModeSpeed = signal<number>(DEFAULT_READER_SETTINGS.followModeSpeed);
  zoomLevel = signal<ZoomLevel>(DEFAULT_READER_SETTINGS.zoomLevel);
  pageLayout = signal<PageLayout>(DEFAULT_READER_SETTINGS.pageLayout);
  letterSpacing = signal<number>(DEFAULT_READER_SETTINGS.letterSpacing);
  wordHighlighting = signal<boolean>(DEFAULT_READER_SETTINGS.wordHighlighting);
  bionicReading = signal<boolean>(DEFAULT_READER_SETTINGS.bionicReading);
  customColorPalette = signal<CustomColorPalette | null>(DEFAULT_READER_SETTINGS.customColorPalette);

  // --- Control constraints ---
  readonly FONT_SIZE_MIN = FONT_SIZE_MIN;
  readonly FONT_SIZE_STEP = FONT_SIZE_STEP;
  readonly LINE_HEIGHT_MIN = LINE_HEIGHT_MIN;
  readonly LINE_HEIGHT_STEP = LINE_HEIGHT_STEP;

  /** Available font families */
  readonly fonts = READER_FONTS;

  /** Predefined theme options */
  readonly themeOptions: { label: string; value: ThemeOption }[] = [
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
    { label: 'Sepia', value: 'sepia' },
  ];

  // Settings state as a computed object for child component
  get currentSettings(): SettingsState {
    return {
      fontSize: this.fontSize(),
      lineHeight: this.lineHeight(),
      fontFamily: this.fontFamily(),
      theme: this.theme(),
      flowMode: this.flowMode(),
      spreadMode: this.spreadMode(),
      focusMode: this.focusMode(),
      followMode: this.followMode(),
      followModeSpeed: this.followModeSpeed(),
      zoomLevel: this.zoomLevel(),
      pageLayout: this.pageLayout(),
      letterSpacing: this.letterSpacing(),
      wordHighlighting: this.wordHighlighting(),
      bionicReading: this.bionicReading(),
      customColorPalette: this.customColorPalette(),
    };
  }

  async ngOnInit(): Promise<void> {
    this.loadSettings();
    this.startReadingSession();
    this.setupKeyboardShortcuts();

    try {
      const blob = await this.indexDB.getFile(this.documentId);
      if (blob) {
        const arrayBuffer = await blob.arrayBuffer();
        this.book = ePub(arrayBuffer);

        this.rendition = this.book.renderTo(this.viewer.nativeElement, {
          width: this.viewer.nativeElement.clientWidth || '100%',
          height: this.viewer.nativeElement.clientHeight || '100%',
          spread: this.spreadFromPageLayout(this.pageLayout()),
          flow: this.flowMode(),
          allowScriptedContent: true,
        });

        // Load table of contents
        await this.loadTableOfContents();

        // Register all themes before displaying so they are ready to use
        this.registerThemes();

        // Resume from saved position if available
        const metadata = await this.indexDB.getMetadata(this.documentId);
        if (metadata?.currentCfi) {
          await this.rendition.display(metadata.currentCfi);
        } else {
          await this.rendition.display();
        }

        // Apply persisted settings once the rendition is ready
        this.applyAllSettings();

        // Dispatch the previously saved progress immediately so the UI
        // shows the last-known percentage without waiting for locations
        if (metadata?.readingProgressPercent != null) {
          this.store.dispatch(
            DocumentsActions.updateReadingProgress({
              id: this.documentId,
              page: metadata.currentPage ?? 0,
              cfi: metadata.currentCfi,
              progressPercent: metadata.readingProgressPercent,
            })
          );
        }

        // Track location changes
        this.rendition.on('relocated', (location: any) => {
          this.updateLocation(location);
        });

        // Attach keyboard listeners to the epub iframe
        this.attachIframeKeyboardListeners();

        // Try to load cached locations for instant progress, otherwise generate
        await this.loadOrGenerateLocations();
      }
    } catch (error) {
      console.error('Error loading EPUB:', error);
    }
  }

  ngOnDestroy(): void {
    this.endReadingSession();
    this.cleanupKeyboardShortcuts();
    this.detachIframeKeyboardListeners();
    this.cleanupFollowMode();
    if (this.focusModeControlsTimeout) {
      clearTimeout(this.focusModeControlsTimeout);
    }
    if (this.rendition) {
      this.rendition.off('rendered', this.bionicRenderedHandler);
      this.rendition.off('rendered', this.wordHighlightRenderedHandler);
      this.rendition.off('rendered', this.customPaletteRenderedHandler);
      this.rendition.destroy();
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  async nextPage(): Promise<void> {
    if (this.rendition) {
      await this.rendition.next();
    }
  }

  async prevPage(): Promise<void> {
    if (this.rendition) {
      await this.rendition.prev();
    }
  }

  // ---------------------------------------------------------------------------
  // Unified panel toggle
  // ---------------------------------------------------------------------------

  togglePanel(): void {
    this.panelOpen.update(open => !open);
  }

  togglePageInfo(): void {
    this.showProgress.update(v => !v);
  }

  onViewerClick(): void {
    if (this.focusMode()) {
      // Temporarily show controls in focus mode
      this.focusModeControlsVisible.set(true);
      
      // Clear existing timeout
      if (this.focusModeControlsTimeout) {
        clearTimeout(this.focusModeControlsTimeout);
      }
      
      // Hide controls after 3 seconds
      this.focusModeControlsTimeout = setTimeout(() => {
        this.focusModeControlsVisible.set(false);
      }, 3000);
    }
  }

  exitFocusMode(): void {
    this.focusMode.set(false);
    this.focusModeControlsVisible.set(false);
    if (this.focusModeControlsTimeout) {
      clearTimeout(this.focusModeControlsTimeout);
    }
    this.focusModeChange.emit(false);
    this.saveSettings();
  }

  // ---------------------------------------------------------------------------
  // Settings change handler from child component
  // ---------------------------------------------------------------------------

  onSettingsChange(newSettings: SettingsState): void {
    const needsRecreate = 
      this.flowMode() !== newSettings.flowMode || 
      this.spreadMode() !== newSettings.spreadMode ||
      this.pageLayout() !== newSettings.pageLayout;

    // Map pageLayout to epub.js spread mode
    const mappedSpread = this.spreadFromPageLayout(newSettings.pageLayout);
    newSettings = { ...newSettings, spreadMode: mappedSpread };

    // Update local signals
    this.fontSize.set(newSettings.fontSize);
    this.lineHeight.set(newSettings.lineHeight);
    this.fontFamily.set(newSettings.fontFamily);
    this.theme.set(newSettings.theme);
    this.flowMode.set(newSettings.flowMode);
    this.spreadMode.set(newSettings.spreadMode);
    const focusModeChanged = this.focusMode() !== newSettings.focusMode;
    this.focusMode.set(newSettings.focusMode);
    const followModeChanged = this.followMode() !== newSettings.followMode;
    this.followMode.set(newSettings.followMode);
    const followSpeedChanged = this.followModeSpeed() !== newSettings.followModeSpeed;
    this.followModeSpeed.set(newSettings.followModeSpeed);
    const zoomChanged = this.zoomLevel() !== newSettings.zoomLevel;
    this.zoomLevel.set(newSettings.zoomLevel);
    this.pageLayout.set(newSettings.pageLayout);

    // Accessibility settings
    const letterSpacingChanged = this.letterSpacing() !== newSettings.letterSpacing;
    this.letterSpacing.set(newSettings.letterSpacing);
    const wordHighlightingChanged = this.wordHighlighting() !== newSettings.wordHighlighting;
    this.wordHighlighting.set(newSettings.wordHighlighting);
    const bionicReadingChanged = this.bionicReading() !== newSettings.bionicReading;
    this.bionicReading.set(newSettings.bionicReading);
    const customPaletteChanged =
      JSON.stringify(this.customColorPalette()) !== JSON.stringify(newSettings.customColorPalette);
    this.customColorPalette.set(newSettings.customColorPalette);

    if (focusModeChanged) {
      this.focusModeChange.emit(newSettings.focusMode);
    }

    if (needsRecreate) {
      // Flow/spread/pageLayout changes require recreating the rendition
      this.recreateRendition();
    } else if (this.rendition) {
      // Apply other settings without recreating
      this.rendition.themes.fontSize(`${newSettings.fontSize}px`);
      this.rendition.themes.select(newSettings.theme);
      this.applyLineHeightAndFont();
    }

    // Apply zoom independently (CSS-based, no rendition recreation needed)
    if (zoomChanged) {
      this.applyZoom();
    }

    // Apply letter spacing
    if (letterSpacingChanged) {
      this.applyLetterSpacing();
    }

    // Apply bionic reading
    if (bionicReadingChanged) {
      this.applyBionicReading();
    }

    // Apply word highlighting
    if (wordHighlightingChanged) {
      this.applyWordHighlighting();
    }

    // Apply custom color palette
    if (customPaletteChanged) {
      this.applyCustomColorPalette();
    }

    // Handle follow mode toggle or speed change
    if (followModeChanged) {
      if (newSettings.followMode) {
        this.startFollowMode();
      } else {
        this.cleanupFollowMode();
      }
    } else if (followSpeedChanged && this.followMode()) {
      // Speed changed while follow mode is active - restart timer with new speed
      this.restartFollowModeTimer();
    }

    this.applyHostTheme(newSettings.theme);
    this.saveSettings();
  }



  // ---------------------------------------------------------------------------
  // epub.js theme registration
  // ---------------------------------------------------------------------------

  /**
   * Register all three reader themes with epub.js.
   * Each theme supplies body-level styles that control background, text colour,
   * and line height so the book content matches the selected theme.
   */
  private registerThemes(): void {
    if (!this.rendition) return;

    const lh = this.lineHeight();

    this.rendition.themes.register('light', {
      body: {
        background: '#ffffff',
        color: '#000000',
        'line-height': `${lh}`,
      },
    });

    this.rendition.themes.register('dark', {
      body: {
        background: '#1a1a1a',
        color: '#e0e0e0',
        'line-height': `${lh}`,
      },
    });

    this.rendition.themes.register('sepia', {
      body: {
        background: '#f4f1ea',
        color: '#5f4b32',
        'line-height': `${lh}`,
      },
    });

    this.rendition.themes.register('high-contrast-light', {
      body: {
        background: '#ffffff',
        color: '#000000',
        'line-height': `${lh}`,
        'letter-spacing': '0.05em',
      },
      'a, a:link, a:visited': {
        color: '#0000ee !important',
        'text-decoration': 'underline !important',
      },
    });

    this.rendition.themes.register('high-contrast-dark', {
      body: {
        background: '#000000',
        color: '#ffffff',
        'line-height': `${lh}`,
        'letter-spacing': '0.05em',
      },
      'a, a:link, a:visited': {
        color: '#ffff00 !important',
        'text-decoration': 'underline !important',
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Applying settings
  // ---------------------------------------------------------------------------

  /** Apply all persisted settings to the rendition at once */
  private applyAllSettings(): void {
    if (!this.rendition) return;

    this.rendition.themes.fontSize(`${this.fontSize()}px`);
    this.rendition.themes.select(this.theme());
    this.applyLineHeightAndFont();
    this.applyHostTheme(this.theme());
    this.applyZoom();
    this.applyLetterSpacing();
    this.applyBionicReading();
    this.applyWordHighlighting();
    this.applyCustomColorPalette();
  }

  /** Re-apply line-height and font-family overrides (needed after theme selection) */
  private applyLineHeightAndFont(): void {
    if (!this.rendition) return;
    this.rendition.themes.override('line-height', `${this.lineHeight()}`);
    this.rendition.themes.override('font-family', this.fontFamily());
    this.rendition.themes.override('letter-spacing', `${this.letterSpacing()}em`);
  }

  /**
   * Mirror the chosen theme onto the host element so that the surrounding
   * chrome (controls, background) can adapt via CSS.
   */
  private applyHostTheme(value: ThemeOption): void {
    const el = this.viewer?.nativeElement?.parentElement;
    if (el) {
      el.setAttribute('data-theme', value);
    }
  }

  /**
   * Apply the selected zoom level via CSS transform on the viewer element.
   * Percentage-based zooms scale the content while fit modes reset to default.
   */
  private applyZoom(): void {
    const container = this.viewer?.nativeElement as HTMLElement;
    if (!container) return;

    const zoom = this.zoomLevel();
    // Wrap the epub-viewer in a scrollable context for zoomed content
    const parent = container.parentElement;

    switch (zoom) {
      case 'fit-width':
        container.style.transform = '';
        container.style.transformOrigin = '';
        container.style.maxWidth = '100%';
        container.style.width = '100%';
        if (parent) parent.style.overflow = '';
        break;
      case 'fit-screen':
        container.style.transform = '';
        container.style.transformOrigin = '';
        container.style.maxWidth = '';
        container.style.width = '';
        if (parent) parent.style.overflow = '';
        break;
      case '100':
        container.style.transform = 'scale(1)';
        container.style.transformOrigin = 'top center';
        container.style.maxWidth = '';
        container.style.width = '';
        if (parent) parent.style.overflow = 'auto';
        break;
      case '200':
        container.style.transform = 'scale(2)';
        container.style.transformOrigin = 'top center';
        container.style.maxWidth = '';
        container.style.width = '';
        if (parent) parent.style.overflow = 'auto';
        break;
      case '300':
        container.style.transform = 'scale(3)';
        container.style.transformOrigin = 'top center';
        container.style.maxWidth = '';
        container.style.width = '';
        if (parent) parent.style.overflow = 'auto';
        break;
    }
  }

  /**
   * Map the UI PageLayout value to an epub.js SpreadMode.
   */
  private spreadFromPageLayout(layout: PageLayout): SpreadMode {
    switch (layout) {
      case 'automatic': return 'auto';
      case 'two-page':  return 'always';
      case 'one-page':  return 'none';
    }
  }

  // ---------------------------------------------------------------------------
  // Accessibility: Letter spacing
  // ---------------------------------------------------------------------------

  /** Apply letter spacing override to the epub rendition */
  private applyLetterSpacing(): void {
    if (!this.rendition) return;
    this.rendition.themes.override('letter-spacing', `${this.letterSpacing()}em`);
  }

  // ---------------------------------------------------------------------------
  // Accessibility: Bionic reading
  // ---------------------------------------------------------------------------

  /**
   * Apply or remove bionic reading mode. Bionic reading bolds the first
   * portion of each word so the brain can "auto-complete" the rest.
   */
  private applyBionicReading(): void {
    if (!this.rendition) return;

    try {
      const contents = this.rendition.getContents();
      if (!contents || contents.length === 0) return;

      const iframe = contents[0];
      const doc = iframe.document as Document;
      if (!doc) return;

      if (this.bionicReading()) {
        this.injectBionicReading(doc);
      } else {
        this.removeBionicReading(doc);
      }
    } catch (error) {
      console.warn('Could not apply bionic reading:', error);
    }

    // Re-apply on page changes
    if (this.bionicReading()) {
      this.rendition.off('rendered', this.bionicRenderedHandler);
      this.rendition.on('rendered', this.bionicRenderedHandler);
    } else {
      this.rendition.off('rendered', this.bionicRenderedHandler);
    }
  }

  private bionicRenderedHandler = () => {
    if (!this.bionicReading() || !this.rendition) return;
    try {
      const contents = this.rendition.getContents();
      if (contents && contents.length > 0) {
        const doc = contents[0].document as Document;
        if (doc) this.injectBionicReading(doc);
      }
    } catch {
      // Silently ignore
    }
  };

  /**
   * Walk through all text nodes and wrap the first portion of each word
   * in a `<b class="bionic-bold">` element.
   */
  private injectBionicReading(doc: Document): void {
    // Remove existing bionic markup first
    this.removeBionicReading(doc);

    const walker = doc.createTreeWalker(
      doc.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (['SCRIPT', 'STYLE', 'B'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (parent.classList.contains('bionic-bold')) return NodeFilter.FILTER_REJECT;
          return node.textContent && node.textContent.trim().length > 0
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      }
    );

    const textNodes: Text[] = [];
    let currentNode: Node | null;
    while ((currentNode = walker.nextNode())) {
      textNodes.push(currentNode as Text);
    }

    for (const textNode of textNodes) {
      const text = textNode.textContent || '';
      const fragment = doc.createDocumentFragment();

      // Split by word boundaries while preserving whitespace
      const parts = text.split(/(\s+)/);
      for (const part of parts) {
        if (/^\s+$/.test(part)) {
          fragment.appendChild(doc.createTextNode(part));
        } else if (part.length > 0) {
          // Bold the first ~half of the word (min 1 char)
          const boldLen = Math.max(1, Math.ceil(part.length * 0.5));
          const boldPart = part.slice(0, boldLen);
          const restPart = part.slice(boldLen);

          const b = doc.createElement('b');
          b.className = 'bionic-bold';
          b.style.fontWeight = '700';
          b.textContent = boldPart;
          fragment.appendChild(b);

          if (restPart) {
            fragment.appendChild(doc.createTextNode(restPart));
          }
        }
      }

      textNode.parentNode?.replaceChild(fragment, textNode);
    }
  }

  /** Remove all bionic reading markup from the document */
  private removeBionicReading(doc: Document): void {
    const bolds = doc.querySelectorAll('b.bionic-bold');
    bolds.forEach((b) => {
      const parent = b.parentNode;
      if (parent) {
        parent.replaceChild(doc.createTextNode(b.textContent || ''), b);
        parent.normalize(); // Merge adjacent text nodes
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Accessibility: Word (sentence) highlighting during reading
  // ---------------------------------------------------------------------------

  /**
   * Toggle sentence-level highlighting on page content.
   * When enabled, the current sentence is highlighted as the user reads.
   */
  private applyWordHighlighting(): void {
    if (!this.rendition) return;

    if (this.wordHighlighting()) {
      this.rendition.off('rendered', this.wordHighlightRenderedHandler);
      this.rendition.on('rendered', this.wordHighlightRenderedHandler);
      this.injectWordHighlightStyles();
    } else {
      this.rendition.off('rendered', this.wordHighlightRenderedHandler);
      this.removeWordHighlightStyles();
    }
  }

  private wordHighlightRenderedHandler = () => {
    if (!this.wordHighlighting() || !this.rendition) return;
    this.injectWordHighlightStyles();
  };

  /**
   * Inject CSS-based sentence highlighting into the epub iframe.
   * Uses a hover-like effect to highlight the sentence the user is reading.
   */
  private injectWordHighlightStyles(): void {
    if (!this.rendition) return;

    try {
      const contents = this.rendition.getContents();
      if (!contents || contents.length === 0) return;

      const doc = contents[0].document as Document;
      if (!doc) return;

      // Remove existing style if any
      const existing = doc.getElementById('word-highlight-style');
      if (existing) existing.remove();

      const style = doc.createElement('style');
      style.id = 'word-highlight-style';

      const isHighContrast =
        this.theme() === 'high-contrast-light' || this.theme() === 'high-contrast-dark';
      const isDark = this.theme() === 'dark' || this.theme() === 'high-contrast-dark';

      let highlightBg: string;
      let highlightOutline: string;
      if (isHighContrast && isDark) {
        highlightBg = 'rgba(255, 255, 0, 0.25)';
        highlightOutline = '2px solid rgba(255, 255, 0, 0.5)';
      } else if (isHighContrast) {
        highlightBg = 'rgba(0, 0, 238, 0.12)';
        highlightOutline = '2px solid rgba(0, 0, 238, 0.3)';
      } else if (isDark) {
        highlightBg = 'rgba(79, 172, 254, 0.15)';
        highlightOutline = 'none';
      } else {
        highlightBg = 'rgba(79, 172, 254, 0.12)';
        highlightOutline = 'none';
      }

      style.textContent = `
        p:hover, li:hover, span:hover, blockquote:hover, h1:hover, h2:hover, h3:hover, h4:hover, h5:hover, h6:hover {
          background: ${highlightBg} !important;
          outline: ${highlightOutline};
          outline-offset: 2px;
          border-radius: 3px;
          transition: background 0.15s ease;
        }
      `;

      doc.head.appendChild(style);
    } catch (error) {
      console.warn('Could not inject word highlight styles:', error);
    }
  }

  /** Remove sentence highlight styles from the epub iframe */
  private removeWordHighlightStyles(): void {
    if (!this.rendition) return;

    try {
      const contents = this.rendition.getContents();
      if (!contents || contents.length === 0) return;

      const doc = contents[0].document as Document;
      if (!doc) return;

      const existing = doc.getElementById('word-highlight-style');
      if (existing) existing.remove();
    } catch {
      // Silently ignore
    }
  }

  // ---------------------------------------------------------------------------
  // Accessibility: Custom color palette
  // ---------------------------------------------------------------------------

  /**
   * Apply a custom color palette to the epub rendition.
   * Overrides the theme colors with user-specified values.
   */
  private applyCustomColorPalette(): void {
    if (!this.rendition) return;

    const palette = this.customColorPalette();

    if (palette) {
      this.rendition.themes.override('background', palette.background);
      this.rendition.themes.override('color', palette.text);

      // Also inject link color overrides
      try {
        const contents = this.rendition.getContents();
        if (contents && contents.length > 0) {
          const doc = contents[0].document as Document;
          if (doc) {
            const existing = doc.getElementById('custom-palette-style');
            if (existing) existing.remove();

            const style = doc.createElement('style');
            style.id = 'custom-palette-style';
            style.textContent = `
              body { background: ${palette.background} !important; color: ${palette.text} !important; }
              a, a:link, a:visited { color: ${palette.link} !important; }
            `;
            doc.head.appendChild(style);
          }
        }
      } catch {
        // Silently ignore
      }

      // Re-apply on page changes
      this.rendition.off('rendered', this.customPaletteRenderedHandler);
      this.rendition.on('rendered', this.customPaletteRenderedHandler);
    } else {
      // Remove custom palette overrides — re-select the current theme
      this.rendition.off('rendered', this.customPaletteRenderedHandler);
      this.rendition.themes.select(this.theme());
      this.removeCustomPaletteStyles();
    }
  }

  private customPaletteRenderedHandler = () => {
    if (!this.customColorPalette() || !this.rendition) return;
    const palette = this.customColorPalette()!;
    try {
      const contents = this.rendition.getContents();
      if (contents && contents.length > 0) {
        const doc = contents[0].document as Document;
        if (doc) {
          const existing = doc.getElementById('custom-palette-style');
          if (existing) existing.remove();

          const style = doc.createElement('style');
          style.id = 'custom-palette-style';
          style.textContent = `
            body { background: ${palette.background} !important; color: ${palette.text} !important; }
            a, a:link, a:visited { color: ${palette.link} !important; }
          `;
          doc.head.appendChild(style);
        }
      }
    } catch {
      // Silently ignore
    }
  };

  /** Remove custom palette styles from the epub iframe */
  private removeCustomPaletteStyles(): void {
    if (!this.rendition) return;
    try {
      const contents = this.rendition.getContents();
      if (contents && contents.length > 0) {
        const doc = contents[0].document as Document;
        if (doc) {
          const existing = doc.getElementById('custom-palette-style');
          if (existing) existing.remove();
        }
      }
    } catch {
      // Silently ignore
    }
  }

  // ---------------------------------------------------------------------------
  // Persistence helpers
  // ---------------------------------------------------------------------------

  /** Save the current signal values to localStorage */
  private saveSettings(): void {
    const settings: ReaderSettings = {
      fontSize: this.fontSize(),
      lineHeight: this.lineHeight(),
      fontFamily: this.fontFamily(),
      theme: this.theme(),
      flowMode: this.flowMode(),
      spreadMode: this.spreadMode(),
      focusMode: this.focusMode(),
      followMode: this.followMode(),
      followModeSpeed: this.followModeSpeed(),
      zoomLevel: this.zoomLevel(),
      pageLayout: this.pageLayout(),
      letterSpacing: this.letterSpacing(),
      wordHighlighting: this.wordHighlighting(),
      bionicReading: this.bionicReading(),
      customColorPalette: this.customColorPalette(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      console.warn('Could not persist reader settings to localStorage');
    }
  }

  /** Load persisted settings from localStorage into signals */
  private loadSettings(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved: Partial<ReaderSettings> = JSON.parse(raw);
        if (saved.fontSize) this.fontSize.set(saved.fontSize);
        if (saved.lineHeight) this.lineHeight.set(saved.lineHeight);
        if (saved.fontFamily) this.fontFamily.set(saved.fontFamily);
        if (saved.theme) this.theme.set(saved.theme);
        if (saved.flowMode) this.flowMode.set(saved.flowMode);
        if (saved.spreadMode) this.spreadMode.set(saved.spreadMode);
        if (saved.focusMode != null) this.focusMode.set(saved.focusMode);
        if (saved.followMode != null) this.followMode.set(saved.followMode);
        if (saved.followModeSpeed) this.followModeSpeed.set(saved.followModeSpeed);
        if (saved.zoomLevel) this.zoomLevel.set(saved.zoomLevel);
        if (saved.pageLayout) this.pageLayout.set(saved.pageLayout);
        if (saved.letterSpacing != null) this.letterSpacing.set(saved.letterSpacing);
        if (saved.wordHighlighting != null) this.wordHighlighting.set(saved.wordHighlighting);
        if (saved.bionicReading != null) this.bionicReading.set(saved.bionicReading);
        if (saved.customColorPalette !== undefined) this.customColorPalette.set(saved.customColorPalette);
      }
    } catch {
      console.warn('Could not load reader settings from localStorage');
    }
    // Emit initial focus mode state after loading settings
    this.focusModeChange.emit(this.focusMode());
  }

  // ---------------------------------------------------------------------------
  // Bookmarks
  // ---------------------------------------------------------------------------

  private async loadTableOfContents(): Promise<void> {
    if (!this.book) return;
    try {
      const navigation = await this.book.loaded.navigation;
      const tocItems: TocItem[] = navigation.toc.map((item: any) => ({
        id: item.id || crypto.randomUUID(),
        label: item.label,
        href: item.href,
        subitems: item.subitems?.map((sub: any) => ({
          id: sub.id || crypto.randomUUID(),
          label: sub.label,
          href: sub.href,
          parent: item.id,
        })),
      }));
      this.chapters.set(tocItems);
    } catch (error) {
      console.warn('Could not load table of contents:', error);
      this.chapters.set([]);
    }
  }

  /**
   * Load cached locations from localStorage or generate them.
   * Caching avoids the expensive ~5 s generation on every book open.
   */
  private async loadOrGenerateLocations(): Promise<void> {
    if (!this.book) return;

    const cacheKey = LOCATIONS_CACHE_PREFIX + this.documentId;

    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        this.book.locations.load(cached);
        this.locationsReady = true;
        // Re-dispatch progress now that locations are available
        const loc = this.rendition?.currentLocation();
        if (loc) this.updateLocation(loc);
        return;
      }
    } catch {
      // Cache miss or corrupt — fall through to generate
    }

    // Generate in the background (increased granularity for speed)
    this.book.locations.generate(1600).then(() => {
      this.locationsReady = true;
      // Cache for next time
      try {
        localStorage.setItem(cacheKey, this.book.locations.save());
      } catch {
        // localStorage full — non-critical
      }
      // Re-dispatch with accurate progress
      const loc = this.rendition?.currentLocation();
      if (loc) this.updateLocation(loc);
    });
  }

  onChapterSelect(chapter: TocItem): void {
    if (this.rendition) {
      this.rendition.display(chapter.href);
      // Panel stays open for easier navigation
    }
  }

  toggleBookmarkAtCurrentLocation(): void {
    if (!this.currentCfi) return;

    // Check if already bookmarked
    let alreadyBookmarked = false;
    let existingBookmarkId = '';
    this.bookmarks$.subscribe((bookmarks) => {
      const existing = bookmarks.find((b) => b.location === this.currentCfi);
      if (existing) {
        alreadyBookmarked = true;
        existingBookmarkId = existing.id;
      }
    }).unsubscribe();

    if (alreadyBookmarked) {
      this.store.dispatch(
        DocumentsActions.removeBookmark({ id: this.documentId, bookmarkId: existingBookmarkId })
      );
      this.isCurrentLocationBookmarked.set(false);
    } else {
      const bookmark: Bookmark = {
        id: crypto.randomUUID(),
        location: this.currentCfi,
        label: this.currentLocation || 'Bookmark',
        createdAt: new Date(),
      };
      this.store.dispatch(DocumentsActions.addBookmark({ id: this.documentId, bookmark }));
      this.isCurrentLocationBookmarked.set(true);
    }
  }

  jumpToBookmark(bookmark: Bookmark): void {
    if (this.rendition) {
      this.rendition.display(bookmark.location);
      // Panel stays open for easier navigation
    }
  }

  removeBookmark(bookmarkId: string): void {
    this.store.dispatch(
      DocumentsActions.removeBookmark({ id: this.documentId, bookmarkId })
    );
  }

  // ---------------------------------------------------------------------------
  // Reading session tracking
  // ---------------------------------------------------------------------------

  private startReadingSession(): void {
    this.sessionStartTime = new Date();
    this.sessionStartPage = this.currentPageNumber;
    this.store.dispatch(DocumentsActions.startReadingSession({ id: this.documentId }));
  }

  private endReadingSession(): void {
    if (!this.sessionStartTime) return;
    const now = new Date();
    const duration = now.getTime() - this.sessionStartTime.getTime();
    // Only record sessions > 5 seconds
    if (duration < 5000) return;

    const session: ReadingSession = {
      startedAt: this.sessionStartTime,
      endedAt: now,
      duration,
      pagesRead: Math.max(0, this.currentPageNumber - this.sessionStartPage),
    };
    this.store.dispatch(DocumentsActions.endReadingSession({ id: this.documentId, session }));
    this.sessionStartTime = null;
  }

  /** Format milliseconds into a human-readable duration */
  formatDuration(ms: number): string {
    const totalMinutes = Math.floor(ms / 60000);
    if (totalMinutes < 60) return `${totalMinutes}m`;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}h ${mins}m`;
  }

  // ---------------------------------------------------------------------------
  // Location tracking (existing)
  // ---------------------------------------------------------------------------

  private updateLocation(location: any): void {
    this.currentLocation = location.start.displayed.page
      ? `Page ${location.start.displayed.page} of ${location.start.displayed.total}`
      : 'Reading...';

    this.canGoPrev = !location.atStart;
    this.canGoNext = !location.atEnd;

    // Track CFI and page for bookmarks / session
    this.currentCfi = location.start.cfi ?? '';
    if (location.start.displayed.page) {
      this.currentPageNumber = location.start.displayed.page;
    }

    // Update current chapter based on href
    if (location.start.href) {
      this.currentChapterHref.set(location.start.href);
    }

    // Check if current location is bookmarked
    this.bookmarks$.subscribe((bookmarks) => {
      this.isCurrentLocationBookmarked.set(
        bookmarks.some((b) => b.location === this.currentCfi)
      );
    }).unsubscribe();

    // Calculate overall book progress percentage
    let progressPercent: number | undefined;
    if (this.locationsReady && this.book?.locations?.length() > 0 && this.currentCfi) {
      progressPercent = Math.round(
        this.book.locations.percentageFromCfi(this.currentCfi) * 100
      );
    } else if (location.start.percentage != null) {
      // Spine-based percentage — available instantly from epub.js
      progressPercent = Math.round(location.start.percentage * 100);
    }

    // Save progress
    if (location.start.displayed.page) {
      this.store.dispatch(
        DocumentsActions.updateReadingProgress({
          id: this.documentId,
          page: location.start.displayed.page,
          cfi: this.currentCfi,
          progressPercent,
        })
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------

  private keyboardHandler = (event: KeyboardEvent) => {
    const isInputActive = document.activeElement?.tagName === 'INPUT' || 
                          document.activeElement?.tagName === 'TEXTAREA';

    // Focus mode toggle: F key
    if (event.key === 'f' || event.key === 'F') {
      if (!isInputActive) {
        event.preventDefault();
        this.focusMode.update(v => !v);
        this.focusModeChange.emit(this.focusMode());
        this.saveSettings();
      }
    }

    // Follow mode controls
    if (this.followMode()) {
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        this.toggleFollowModePause();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.advanceFollowMode();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.retreatFollowMode();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.followMode.set(false);
        this.cleanupFollowMode();
        this.saveSettings();
      }
      return; // Don't process other shortcuts in follow mode
    }

    // Page navigation and other shortcuts (when NOT in follow mode and NOT in input)
    if (!isInputActive) {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.nextPage();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.prevPage();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.increaseFontSize();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.decreaseFontSize();
      } else if (event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        this.nextPage();
      } else if (event.key === 'a' || event.key === 'A') {
        event.preventDefault();
        this.prevPage();
      } else if (event.key === 'b' || event.key === 'B') {
        event.preventDefault();
        this.toggleBookmarkAtCurrentLocation();
      } else if (event.key === 'o' || event.key === 'O') {
        event.preventDefault();
        this.togglePanel();
      }
    }
  };

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', this.keyboardHandler);
  }

  private cleanupKeyboardShortcuts(): void {
    document.removeEventListener('keydown', this.keyboardHandler);
  }

  private increaseFontSize(): void {
    const newSize = this.fontSize() + this.FONT_SIZE_STEP;
    this.fontSize.set(newSize);
    if (this.rendition) {
      this.rendition.themes.fontSize(`${newSize}px`);
    }
    this.saveSettings();
  }

  private decreaseFontSize(): void {
    const currentSize = this.fontSize();
    if (currentSize > this.FONT_SIZE_MIN) {
      const newSize = Math.max(this.FONT_SIZE_MIN, currentSize - this.FONT_SIZE_STEP);
      this.fontSize.set(newSize);
      if (this.rendition) {
        this.rendition.themes.fontSize(`${newSize}px`);
      }
      this.saveSettings();
    }
  }

  /**
   * Attach keyboard event listeners to the epub.js iframe so shortcuts
   * work when the user is focused on the book content.
   */
  private attachIframeKeyboardListeners(): void {
    if (!this.rendition) return;

    try {
      const contents = this.rendition.getContents();
      if (contents && contents.length > 0) {
        contents.forEach((content: any) => {
          const iframeDoc = content.document;
          if (iframeDoc) {
            iframeDoc.addEventListener('keydown', this.keyboardHandler);
          }
        });
      }
    } catch (error) {
      console.warn('Could not attach iframe keyboard listeners:', error);
    }
  }

  /**
   * Remove keyboard event listeners from the epub.js iframe.
   */
  private detachIframeKeyboardListeners(): void {
    if (!this.rendition) return;

    try {
      const contents = this.rendition.getContents();
      if (contents && contents.length > 0) {
        contents.forEach((content: any) => {
          const iframeDoc = content.document;
          if (iframeDoc) {
            iframeDoc.removeEventListener('keydown', this.keyboardHandler);
          }
        });
      }
    } catch (error) {
      // Silently ignore cleanup errors
    }
  }

  // ---------------------------------------------------------------------------
  // Rendition recreation (for flow/spread changes)
  // ---------------------------------------------------------------------------

  private async recreateRendition(): Promise<void> {
    if (!this.book || !this.rendition) return;

    const currentCfi = this.currentCfi;
    
    // Destroy old rendition and clear DOM to prevent stale content overlap
    this.rendition.destroy();
    this.viewer.nativeElement.innerHTML = '';

    // Wait a frame so the container has its final layout dimensions
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    const rect = this.viewer.nativeElement.getBoundingClientRect();

    // Create new rendition with explicit pixel dimensions
    this.rendition = this.book.renderTo(this.viewer.nativeElement, {
      width: rect.width,
      height: rect.height,
      spread: this.spreadFromPageLayout(this.pageLayout()),
      flow: this.flowMode(),
      allowScriptedContent: true,
    });

    // Re-register themes
    this.registerThemes();

    // Apply all settings
    this.applyAllSettings();

    // Restore position
    if (currentCfi) {
      await this.rendition.display(currentCfi);
    } else {
      await this.rendition.display();
    }

    // Re-attach location tracking
    this.rendition.on('relocated', (location: any) => {
      this.updateLocation(location);
    });

    // Re-attach keyboard listeners to the new iframe
    this.attachIframeKeyboardListeners();
  }

  // ---------------------------------------------------------------------------
  // Follow mode (word-by-word auto-highlighting)
  // ---------------------------------------------------------------------------

  private startFollowMode(): void {
    if (!this.rendition) return;

    try {
      // Stop any existing timer
      this.cleanupFollowMode();
      
      // Get the current page's text content
      const contents = this.rendition.getContents();
      if (contents && contents.length > 0) {
        const iframe = contents[0];
        const doc = iframe.document;
        
        if (doc && doc.body) {
          // Extract all text nodes and their words
          this.followModeWords = this.extractWordsFromDocument(doc);
          this.followModeCurrentIndex = 0;
          this.followModeIsPaused = false;
          
          if (this.followModeWords.length > 0) {
            this.highlightCurrentWord();
            this.followModePaused.set(false);
            this.startFollowModeTimer();
          }
        }
      }
    } catch (error) {
      console.warn('Could not initialize follow mode:', error);
    }
  }

  private startFollowModeTimer(): void {
    if (this.followModeTimer) {
      clearTimeout(this.followModeTimer);
    }
    
    if (this.followModeIsPaused) return;
    
    // Calculate delay based on WPM: delay = (60,000 ms/min) / (WPM)
    const delayMs = (60000 / this.followModeSpeed());
    
    this.followModeTimer = setTimeout(() => {
      this.advanceFollowMode();
    }, delayMs);
  }

  private restartFollowModeTimer(): void {
    // Called when speed changes - restart with new timing
    if (this.followMode() && !this.followModeIsPaused) {
      this.startFollowModeTimer();
    }
  }

  private toggleFollowModePause(): void {
    this.followModeIsPaused = !this.followModeIsPaused;
    this.followModePaused.set(this.followModeIsPaused);
    
    if (this.followModeIsPaused) {
      // Pause - clear timer
      if (this.followModeTimer) {
        clearTimeout(this.followModeTimer);
        this.followModeTimer = null;
      }
    } else {
      // Resume - restart timer
      this.startFollowModeTimer();
    }
  }

  /**
   * Extract words with their text node references for accurate highlighting
   */
  private extractWordsFromDocument(doc: Document): Array<{ text: string; node: Text; offset: number }> {
    const words: Array<{ text: string; node: Text; offset: number }> = [];
    
    const walker = doc.createTreeWalker(
      doc.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip script and style tags
          const parent = node.parentElement;
          if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
            return NodeFilter.FILTER_REJECT;
          }
          // Accept nodes with actual text content
          return node.textContent && node.textContent.trim().length > 0
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    let currentNode: Node | null;
    while (currentNode = walker.nextNode()) {
      const textNode = currentNode as Text;
      const text = textNode.textContent || '';
      
      // Split into words while tracking their position in the text node
      const wordMatches = text.matchAll(/\S+/g);
      for (const match of wordMatches) {
        const word = match[0];
        const offset = match.index!;
        words.push({ text: word, node: textNode, offset });
      }
    }
    
    return words;
  }

  private highlightCurrentWord(): void {
    if (!this.rendition || this.followModeWords.length === 0) return;
    if (this.followModeCurrentIndex >= this.followModeWords.length) return;

    try {
      const contents = this.rendition.getContents();
      if (!contents || contents.length === 0) return;
      
      const iframe = contents[0];
      const doc = iframe.document;
      
      if (!doc) return;

      // Remove previous highlight
      this.removeCurrentHighlight(doc);

      // Get current word info
      const wordInfo = this.followModeWords[this.followModeCurrentIndex];
      
      // Create a range for the current word
      const range = doc.createRange();
      range.setStart(wordInfo.node, wordInfo.offset);
      range.setEnd(wordInfo.node, wordInfo.offset + wordInfo.text.length);
      
      // Save the range for cleanup
      this.followModeCurrentRange = range;
      
      // Create highlight span
      const highlight = doc.createElement('span');
      highlight.className = 'follow-mode-highlight';
      highlight.style.cssText = `
        background-color: rgba(255, 215, 0, 0.5);
        border-radius: 3px;
        padding: 2px 0;
        transition: background-color 0.2s ease;
        box-shadow: 0 0 8px rgba(255, 215, 0, 0.3);
      `;
      
      try {
        range.surroundContents(highlight);
        
        // Scroll the highlighted word into view smoothly
        highlight.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'nearest'
        });
      } catch (e) {
        // If surroundContents fails (e.g., range spans multiple elements),
        // just mark the word without wrapping
        console.warn('Could not wrap word, range may span elements:', e);
      }
    } catch (error) {
      console.warn('Error highlighting word:', error);
    }
  }

  private removeCurrentHighlight(doc: Document): void {
    // Remove all existing follow mode highlights
    const existingHighlights = doc.querySelectorAll('.follow-mode-highlight');
    existingHighlights.forEach(highlight => {
      const parent = highlight.parentNode;
      if (parent) {
        // Move children out of the highlight span
        while (highlight.firstChild) {
          parent.insertBefore(highlight.firstChild, highlight);
        }
        parent.removeChild(highlight);
      }
    });
    
    this.followModeCurrentRange = null;
  }

  private advanceFollowMode(): void {
    if (this.followModeCurrentIndex < this.followModeWords.length - 1) {
      this.followModeCurrentIndex++;
      this.highlightCurrentWord();
      if (!this.followModeIsPaused) {
        this.startFollowModeTimer();
      }
    } else {
      // End of current page - move to next page
      this.followModeIsPaused = true; // Pause during page transition
      this.nextPage().then(() => {
        setTimeout(() => {
          // Re-initialize follow mode on the new page
          if (this.followMode()) {
            this.startFollowMode();
          }
        }, 300); // Small delay to ensure page is rendered
      });
    }
  }

  private retreatFollowMode(): void {
    if (this.followModeCurrentIndex > 0) {
      this.followModeCurrentIndex--;
      this.highlightCurrentWord();
      // Manual control - pause auto-advance
      if (!this.followModeIsPaused) {
        this.toggleFollowModePause();
      }
    }
  }

  private cleanupFollowMode(): void {
    // Clear timer
    if (this.followModeTimer) {
      clearTimeout(this.followModeTimer);
      this.followModeTimer = null;
    }
    
    // Remove highlights
    if (this.rendition) {
      try {
        const contents = this.rendition.getContents();
        if (contents && contents.length > 0) {
          const iframe = contents[0];
          const doc = iframe.document;
          if (doc) {
            this.removeCurrentHighlight(doc);
          }
        }
      } catch (error) {
        // Silently ignore cleanup errors
      }
    }
    
    // Reset state
    this.followModeWords = [];
    this.followModeCurrentIndex = 0;
    this.followModeCurrentRange = null;
    this.followModePaused.set(false);
    this.followModeIsPaused = false;
  }
}

