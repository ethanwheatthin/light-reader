import { Component, Input, inject, OnInit, OnDestroy, ElementRef, ViewChild, signal } from '@angular/core';
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
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_STEP,
  READER_FONTS,
  TocItem,
} from '../../../core/models/document.model';

const STORAGE_KEY = 'epub-reader-settings';

@Component({
  selector: 'app-epub-reader',
  standalone: true,
  imports: [CommonModule, FormsModule, ReadingProgressComponent, UnifiedSettingsPanelComponent],
  templateUrl: './epub-reader.component.html',
  styleUrl: './epub-reader.component.css'
})
export class EpubReaderComponent implements OnInit, OnDestroy {
  @Input() documentId!: string;
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

  // --- Unified panel state ---
  panelOpen = signal<boolean>(false);

  // --- Chapters/TOC ---
  chapters = signal<TocItem[]>([]);
  currentChapterHref = signal<string | null>(null);

  // --- Reading session tracking ---
  private sessionStartTime: Date | null = null;
  private sessionStartPage = 0;
  private currentPageNumber = 0;
  private currentCfi = '';

  // --- Reader settings signals ---
  fontSize = signal<number>(DEFAULT_READER_SETTINGS.fontSize);
  lineHeight = signal<number>(DEFAULT_READER_SETTINGS.lineHeight);
  fontFamily = signal<string>(DEFAULT_READER_SETTINGS.fontFamily);
  theme = signal<ThemeOption>(DEFAULT_READER_SETTINGS.theme);

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
      theme: this.theme()
    };
  }

  async ngOnInit(): Promise<void> {
    this.loadSettings();
    this.startReadingSession();

    try {
      const blob = await this.indexDB.getFile(this.documentId);
      if (blob) {
        const arrayBuffer = await blob.arrayBuffer();
        this.book = ePub(arrayBuffer);

        this.rendition = this.book.renderTo(this.viewer.nativeElement, {
          width: '100%',
          height: '100%',
          spread: 'none',
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

        // Track location changes
        this.rendition.on('relocated', (location: any) => {
          this.updateLocation(location);
        });
      }
    } catch (error) {
      console.error('Error loading EPUB:', error);
    }
  }

  ngOnDestroy(): void {
    this.endReadingSession();
    if (this.rendition) {
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

  // ---------------------------------------------------------------------------
  // Settings change handler from child component
  // ---------------------------------------------------------------------------

  onSettingsChange(newSettings: SettingsState): void {
    // Update local signals
    this.fontSize.set(newSettings.fontSize);
    this.lineHeight.set(newSettings.lineHeight);
    this.fontFamily.set(newSettings.fontFamily);
    this.theme.set(newSettings.theme);

    // Apply to rendition
    if (this.rendition) {
      this.rendition.themes.fontSize(`${newSettings.fontSize}px`);
      this.rendition.themes.select(newSettings.theme);
      this.applyLineHeightAndFont();
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
  }

  /** Re-apply line-height and font-family overrides (needed after theme selection) */
  private applyLineHeightAndFont(): void {
    if (!this.rendition) return;
    this.rendition.themes.override('line-height', `${this.lineHeight()}`);
    this.rendition.themes.override('font-family', this.fontFamily());
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
      }
    } catch {
      console.warn('Could not load reader settings from localStorage');
    }
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

    // Save progress
    if (location.start.displayed.page) {
      this.store.dispatch(
        DocumentsActions.updateReadingProgress({
          id: this.documentId,
          page: location.start.displayed.page,
          cfi: this.currentCfi,
        })
      );
    }
  }
}
