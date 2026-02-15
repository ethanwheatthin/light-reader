import { Component, Input, Output, EventEmitter, inject, OnInit, OnDestroy, ElementRef, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import ePub from 'epubjs';
import * as pdfjsLib from 'pdfjs-dist';
import { IndexDBService } from '../../../core/services/indexdb.service';
import { DocumentsActions } from '../../../store/documents/documents.actions';
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
  ThemeOption,
  SpreadMode,
  ZoomLevel,
  PageLayout,
  TocItem,
} from '../../../core/models/document.model';
import { EpubReaderSettingsService } from './services/epub-reader-settings.service';
import { EpubAccessibilityService } from './services/epub-accessibility.service';
import { EpubFollowModeService } from './services/epub-follow-mode.service';

const LOCATIONS_CACHE_PREFIX = 'epub-locations-';

@Component({
  selector: 'app-epub-reader',
  standalone: true,
  imports: [CommonModule, FormsModule, UnifiedSettingsPanelComponent],
  providers: [EpubReaderSettingsService, EpubAccessibilityService, EpubFollowModeService],
  templateUrl: './epub-reader.component.html',
  styleUrl: './epub-reader.component.css'
})
export class EpubReaderComponent implements OnInit, OnDestroy {
  @Input() documentId!: string;
  @Input() documentType: 'epub' | 'pdf' = 'epub';
  @Output() focusModeChange = new EventEmitter<boolean>();
  @ViewChild('viewer', { static: true }) viewer!: ElementRef;
  @ViewChild('zoomWrapper', { static: true }) zoomWrapper!: ElementRef;

  private store = inject(Store);
  private router = inject(Router);
  private indexDB = inject(IndexDBService);
  protected settings = inject(EpubReaderSettingsService);
  private accessibility = inject(EpubAccessibilityService);
  private followModeService = inject(EpubFollowModeService);
  private book: any;
  private rendition: any;

  // --- Document title for display ---
  documentTitle = '';

  // --- Fullscreen state ---
  isFullscreen = signal<boolean>(false);

  // --- PDF-specific state ---
  private pdfDoc: any;
  private pdfCanvas: HTMLCanvasElement | null = null;
  pdfCurrentPage = 1;
  pdfTotalPages = 0;
  private pdfScale = 1.5;

  /** Whether the current document is a PDF */
  get isPdf(): boolean {
    return this.documentType === 'pdf';
  }

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

  // --- Focus mode pull-tab swipe gesture ---
  private pullTabTouchStartY = 0;
  private pullTabSwiping = false;

  // --- Touch swipe page navigation ---
  private swipeTouchStartX = 0;
  private swipeTouchStartY = 0;
  private swipeTouchStartTime = 0;
  private swipeActive = false;

  // --- Chapters/TOC ---
  chapters = signal<TocItem[]>([]);
  currentChapterHref = signal<string | null>(null);

  // --- Reading session tracking ---
  private sessionStartTime: Date | null = null;
  private sessionStartPage = 0;
  private currentPageNumber = 0;
  private currentCfi = '';
  private locationsReady = false;

  // --- Resize observer for responsive layout ---
  private resizeObserver: ResizeObserver | null = null;
  private resizeDebounceTimer: any = null;

  // Delegate convenience accessors used by the template
  get fontSize() { return this.settings.fontSize; }
  get lineHeight() { return this.settings.lineHeight; }
  get fontFamily() { return this.settings.fontFamily; }
  get theme() { return this.settings.theme; }
  get flowMode() { return this.settings.flowMode; }
  get spreadMode() { return this.settings.spreadMode; }
  get focusMode() { return this.settings.focusMode; }
  get followMode() { return this.settings.followMode; }
  get followModeSpeed() { return this.settings.followModeSpeed; }
  get zoomLevel() { return this.settings.zoomLevel; }
  get pageLayout() { return this.settings.pageLayout; }
  get followModePaused() { return this.followModeService.paused; }
  get currentSettings(): SettingsState { return this.settings.currentSettings; }

  async ngOnInit(): Promise<void> {
    this.settings.loadSettings();
    this.focusModeChange.emit(this.settings.focusMode());
    this.startReadingSession();
    this.setupKeyboardShortcuts();

    // Configure follow mode service (epub only, but safe to configure for both)
    this.followModeService.configure(
      () => this.nextPage(),
      () => this.settings.followMode(),
      this.settings.followModeSpeed(),
    );

    try {
      const blob = await this.indexDB.getFile(this.documentId);
      if (blob) {
        if (this.isPdf) {
          await this.initPdfReader(blob);
        } else {
          await this.initEpubReader(blob);
        }
      }
    } catch (error) {
      console.error(`Error loading ${this.documentType.toUpperCase()}:`, error);
    }
  }

  // ---------------------------------------------------------------------------
  // PDF initialization & rendering
  // ---------------------------------------------------------------------------

  private async initPdfReader(blob: Blob): Promise<void> {
    // Set pdf.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

    const arrayBuffer = await blob.arrayBuffer();
    this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    this.pdfTotalPages = this.pdfDoc.numPages;

    // Create a canvas inside the viewer div
    this.pdfCanvas = document.createElement('canvas');
    this.pdfCanvas.classList.add('pdf-canvas');
    this.viewer.nativeElement.appendChild(this.pdfCanvas);

    // Load saved page or start at page 1
    const metadata = await this.indexDB.getMetadata(this.documentId);
    if (metadata) {
      this.documentTitle = metadata.title || 'PDF Document';
      if (metadata.currentPage && metadata.currentPage >= 1) {
        this.pdfCurrentPage = metadata.currentPage;
      }
    }

    await this.renderPdfPage(this.pdfCurrentPage);
    this.updatePdfLocation();

    // Dispatch previously saved progress
    if (metadata?.readingProgressPercent != null) {
      this.store.dispatch(
        DocumentsActions.updateReadingProgress({
          id: this.documentId,
          page: metadata.currentPage ?? this.pdfCurrentPage,
          progressPercent: metadata.readingProgressPercent,
        })
      );
    }

    // Apply host theme
    this.applyHostTheme(this.settings.theme());

    // Set up resize observer
    this.setupResizeObserver();
  }

  private async renderPdfPage(pageNum: number): Promise<void> {
    if (!this.pdfDoc || !this.pdfCanvas) return;
    try {
      const page = await this.pdfDoc.getPage(pageNum);

      // Compute scale to fit the wrapper width
      const wrapper = this.zoomWrapper?.nativeElement as HTMLElement;
      const availableWidth = wrapper ? wrapper.clientWidth - 40 : 600; // 40px padding
      const defaultViewport = page.getViewport({ scale: 1 });
      const fitScale = availableWidth / defaultViewport.width;

      // Apply zoom on top of fit scale
      const zoom = this.settings.zoomLevel();
      const zoomMultiplier = this.zoomScaleFactor(zoom);
      this.pdfScale = fitScale * zoomMultiplier;

      const viewport = page.getViewport({ scale: this.pdfScale });
      const context = this.pdfCanvas.getContext('2d')!;

      this.pdfCanvas.height = viewport.height;
      this.pdfCanvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;
    } catch (error) {
      console.error('Error rendering PDF page:', error);
    }
  }

  private updatePdfLocation(): void {
    this.currentLocation = `Page ${this.pdfCurrentPage} of ${this.pdfTotalPages}`;
    this.canGoPrev = this.pdfCurrentPage > 1;
    this.canGoNext = this.pdfCurrentPage < this.pdfTotalPages;
    this.currentPageNumber = this.pdfCurrentPage;

    // Calculate progress
    const progressPercent =
      this.pdfTotalPages > 0
        ? Math.round((this.pdfCurrentPage / this.pdfTotalPages) * 100)
        : 0;

    // Check if current page is bookmarked
    const pageStr = String(this.pdfCurrentPage);
    this.bookmarks$.subscribe((bookmarks) => {
      this.isCurrentLocationBookmarked.set(bookmarks.some((b) => b.location === pageStr));
    }).unsubscribe();

    // Save progress to store
    this.store.dispatch(
      DocumentsActions.updateReadingProgress({
        id: this.documentId,
        page: this.pdfCurrentPage,
        progressPercent,
      })
    );
  }

  // ---------------------------------------------------------------------------
  // EPUB initialization
  // ---------------------------------------------------------------------------

  private async initEpubReader(blob: Blob): Promise<void> {
    const arrayBuffer = await blob.arrayBuffer();
    this.book = ePub(arrayBuffer);

    // Wait a frame so the flex layout has computed final dimensions
    // for the zoom-wrapper before epub.js measures the container.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const wrapperEl = this.zoomWrapper.nativeElement as HTMLElement;
    const padBottom = parseFloat(getComputedStyle(wrapperEl).paddingBottom) || 0;
    const initWidth = Math.floor(wrapperEl.clientWidth) || 600;
    const initHeight = Math.floor(wrapperEl.clientHeight - padBottom) || 400;

    this.rendition = this.book.renderTo(this.viewer.nativeElement, {
      width: initWidth,
      height: initHeight,
      spread: this.spreadFromPageLayout(this.settings.pageLayout()),
      flow: this.settings.flowMode(),
      allowScriptedContent: true,
    });

    // Wire up services that depend on the rendition
    this.accessibility.setRendition(this.rendition);
    this.followModeService.setRendition(this.rendition);

    // Load table of contents
    await this.loadTableOfContents();

    // Register all themes before displaying so they are ready to use
    this.registerThemes();

    // Resume from saved position if available
    const metadata = await this.indexDB.getMetadata(this.documentId);
    if (metadata) {
      this.documentTitle = metadata.title || 'EPUB Document';
      if (metadata.currentCfi) {
        await this.rendition.display(metadata.currentCfi);
      } else {
        await this.rendition.display();
      }
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

    // Attach keyboard listeners to the epub iframe (and re-attach on page turns)
    this.attachIframeKeyboardListeners();
    this.rendition.on('rendered', this.keyboardRenderedHandler);

    // Attach touch swipe listeners to the epub iframe (and re-attach on page turns)
    this.attachIframeSwipeListeners();
    this.rendition.on('rendered', this.swipeRenderedHandler);

    // Try to load cached locations for instant progress, otherwise generate
    await this.loadOrGenerateLocations();

    // Set up resize observer so content flexes with screen size
    this.setupResizeObserver();
  }

  ngOnDestroy(): void {
    this.endReadingSession();
    this.cleanupKeyboardShortcuts();
    this.detachIframeKeyboardListeners();
    this.followModeService.cleanup();
    this.teardownResizeObserver();
    if (this.focusModeControlsTimeout) {
      clearTimeout(this.focusModeControlsTimeout);
    }
    if (this.rendition) {
      this.accessibility.destroy();
      this.rendition.off('rendered', this.keyboardRenderedHandler);
      this.rendition.off('rendered', this.swipeRenderedHandler);
      this.detachIframeSwipeListeners();
      this.rendition.destroy();
    }
    if (this.pdfDoc) {
      this.pdfDoc.destroy();
      this.pdfDoc = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  async nextPage(): Promise<void> {
    if (this.isPdf) {
      if (this.pdfCurrentPage < this.pdfTotalPages) {
        this.pdfCurrentPage++;
        await this.renderPdfPage(this.pdfCurrentPage);
        this.updatePdfLocation();
      }
    } else if (this.rendition) {
      await this.rendition.next();
    }
  }

  async prevPage(): Promise<void> {
    if (this.isPdf) {
      if (this.pdfCurrentPage > 1) {
        this.pdfCurrentPage--;
        await this.renderPdfPage(this.pdfCurrentPage);
        this.updatePdfLocation();
      }
    } else if (this.rendition) {
      await this.rendition.prev();
    }
  }

  // ---------------------------------------------------------------------------
  // Touch swipe navigation (template-bound wrappers)
  // ---------------------------------------------------------------------------

  onSwipeTouchStart(event: TouchEvent): void {
    this.swipeTouchStart(event);
  }

  onSwipeTouchEnd(event: TouchEvent): void {
    this.swipeTouchEnd(event);
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

  // ---------------------------------------------------------------------------
  // Navigation and UI controls
  // ---------------------------------------------------------------------------

  goBack(): void {
    this.router.navigate(['/library']);
  }

  toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        this.isFullscreen.set(true);
      }).catch(() => {
        console.warn('Could not enter fullscreen mode');
      });
    } else {
      document.exitFullscreen().then(() => {
        this.isFullscreen.set(false);
      }).catch(() => {
        console.warn('Could not exit fullscreen mode');
      });
    }
  }

  switchToChaptersTab(): void {
    // The panel handles the tab state internally, but we ensure it opens to chapters
    if (!this.panelOpen()) {
      this.panelOpen.set(true);
    }
  }

  onProgressSliderChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const percent = parseInt(target.value, 10);
    
    if (this.isPdf && this.pdfTotalPages > 0) {
      // For PDF: navigate to the page corresponding to this percentage
      const targetPage = Math.max(1, Math.round((percent / 100) * this.pdfTotalPages));
      this.pdfCurrentPage = targetPage;
      this.renderPdfPage(this.pdfCurrentPage);
      this.updatePdfLocation();
    } else if (this.book && this.locationsReady) {
      // For EPUB: navigate to the CFI corresponding to this percentage
      const locations = this.book.locations;
      if (locations && locations.length()) {
        const cfi = locations.cfiFromPercentage(percent / 100);
        if (cfi) {
          this.rendition.display(cfi);
        }
      }
    }
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
    this.settings.focusMode.set(false);
    this.focusModeControlsVisible.set(false);
    if (this.focusModeControlsTimeout) {
      clearTimeout(this.focusModeControlsTimeout);
    }
    this.focusModeChange.emit(false);
    this.settings.saveSettings();
  }

  // ---------------------------------------------------------------------------
  // Focus mode pull-tab swipe gesture (mobile)
  // ---------------------------------------------------------------------------

  onPullTabTouchStart(event: TouchEvent): void {
    this.pullTabTouchStartY = event.touches[0].clientY;
    this.pullTabSwiping = true;
  }

  onPullTabTouchMove(event: TouchEvent): void {
    if (!this.pullTabSwiping) return;
    // Prevent page scroll while swiping the pull tab
    event.preventDefault();
  }

  onPullTabTouchEnd(event: TouchEvent): void {
    if (!this.pullTabSwiping) return;
    this.pullTabSwiping = false;

    const endY = event.changedTouches[0].clientY;
    const deltaY = this.pullTabTouchStartY - endY;

    // Swipe up threshold: 40px is enough to feel intentional
    if (deltaY > 40) {
      this.panelOpen.set(true);
    }
  }

  // ---------------------------------------------------------------------------
  // Settings change handler from child component
  // ---------------------------------------------------------------------------

  onSettingsChange(newSettings: SettingsState): void {
    const needsRecreate =
      !this.isPdf && (
        this.settings.flowMode() !== newSettings.flowMode ||
        this.settings.spreadMode() !== newSettings.spreadMode ||
        this.settings.pageLayout() !== newSettings.pageLayout
      );

    // Detect per-feature changes before applying
    const focusModeChanged = this.settings.focusMode() !== newSettings.focusMode;
    const followModeChanged = this.settings.followMode() !== newSettings.followMode;
    const followSpeedChanged = this.settings.followModeSpeed() !== newSettings.followModeSpeed;
    const zoomChanged = this.settings.zoomLevel() !== newSettings.zoomLevel;
    const letterSpacingChanged = this.settings.letterSpacing() !== newSettings.letterSpacing;
    const wordHighlightingChanged = this.settings.wordHighlighting() !== newSettings.wordHighlighting;
    const bionicReadingChanged = this.settings.bionicReading() !== newSettings.bionicReading;
    const customPaletteChanged =
      JSON.stringify(this.settings.customColorPalette()) !== JSON.stringify(newSettings.customColorPalette);

    // Map pageLayout to epub.js spread mode
    const mappedSpread = this.spreadFromPageLayout(newSettings.pageLayout);
    newSettings = { ...newSettings, spreadMode: mappedSpread };

    // Batch-update all signals via the settings service
    this.settings.applySettingsState(newSettings);

    if (focusModeChanged) {
      this.focusModeChange.emit(newSettings.focusMode);
    }

    if (this.isPdf) {
      // For PDF: only zoom and theme changes matter
      if (zoomChanged) {
        this.renderPdfPage(this.pdfCurrentPage);
      }
    } else {
      if (needsRecreate) {
        this.recreateRendition();
      } else if (this.rendition) {
        this.rendition.themes.fontSize(`${newSettings.fontSize}px`);
        this.rendition.themes.select(newSettings.theme);
        this.applyLineHeightAndFont();
      }

      if (zoomChanged) this.applyZoom();
      if (letterSpacingChanged) this.accessibility.applyLetterSpacing();
      if (bionicReadingChanged) this.accessibility.applyBionicReading();
      if (wordHighlightingChanged) this.accessibility.applyWordHighlighting();
      if (customPaletteChanged) this.accessibility.applyCustomColorPalette();
    }

    // Handle follow mode toggle or speed change
    if (followModeChanged) {
      if (newSettings.followMode) {
        this.followModeService.setSpeed(newSettings.followModeSpeed);
        this.followModeService.start();
      } else {
        this.followModeService.cleanup();
      }
    } else if (followSpeedChanged && this.settings.followMode()) {
      this.followModeService.setSpeed(newSettings.followModeSpeed);
      this.followModeService.restartTimer();
    }

    this.applyHostTheme(newSettings.theme);
    this.settings.saveSettings();
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

    const lh = this.settings.lineHeight();

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

    this.rendition.themes.fontSize(`${this.settings.fontSize()}px`);
    this.rendition.themes.select(this.settings.theme());
    this.applyLineHeightAndFont();
    this.applyHostTheme(this.settings.theme());
    this.applyZoom();
    this.accessibility.applyLetterSpacing();
    this.accessibility.applyBionicReading();
    this.accessibility.applyWordHighlighting();
    this.accessibility.applyCustomColorPalette();
  }

  /** Re-apply line-height and font-family overrides (needed after theme selection) */
  private applyLineHeightAndFont(): void {
    if (!this.rendition) return;
    this.rendition.themes.override('line-height', `${this.settings.lineHeight()}`);
    this.rendition.themes.override('font-family', this.settings.fontFamily());
    this.rendition.themes.override('letter-spacing', `${this.settings.letterSpacing()}em`);
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
  // Resize observer — makes content flex with screen size
  // ---------------------------------------------------------------------------

  private setupResizeObserver(): void {
    const wrapper = this.zoomWrapper?.nativeElement as HTMLElement;
    if (!wrapper) return;

    this.resizeObserver = new ResizeObserver(() => {
      // Debounce to avoid excessive resize calls during drag/animation
      if (this.resizeDebounceTimer) clearTimeout(this.resizeDebounceTimer);
      this.resizeDebounceTimer = setTimeout(() => this.handleContainerResize(), 150);
    });
    this.resizeObserver.observe(wrapper);
  }

  private teardownResizeObserver(): void {
    if (this.resizeDebounceTimer) clearTimeout(this.resizeDebounceTimer);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  /**
   * Called when the zoom-wrapper element is resized (e.g. window resize,
   * panel open/close). Recalculates the rendition size so epub.js content
   * fills the available space at the current zoom level.
   */
  private handleContainerResize(): void {
    if (this.isPdf) {
      // For PDF, re-render the current page at the new container size
      this.renderPdfPage(this.pdfCurrentPage);
      return;
    }

    if (!this.rendition) return;

    const wrapper = this.zoomWrapper?.nativeElement as HTMLElement;
    if (!wrapper) return;

    const zoom = this.settings.zoomLevel();
    const scale = this.zoomScaleFactor(zoom);

    // Use clientWidth/clientHeight which represent the content box
    // (excluding scrollbar but including padding). Subtract the
    // bottom padding reserved for the controls bar overlay.
    const paddingBottom = parseFloat(getComputedStyle(wrapper).paddingBottom) || 0;
    const contentWidth = wrapper.clientWidth;
    const contentHeight = wrapper.clientHeight - paddingBottom;

    // Tell epub.js how large its rendering area is.
    // For percentage zooms the viewer is scaled up via CSS transform,
    // so the rendition should be sized to the *unscaled* wrapper.
    const renditionWidth = Math.floor(contentWidth / scale);
    const renditionHeight = Math.floor(contentHeight / scale);

    this.rendition.resize(renditionWidth, renditionHeight);
  }

  /**
   * Apply the selected zoom level. Fit modes let the content fill the
   * wrapper naturally. Percentage modes use CSS transform to scale the
   * epub.js iframe and wrap it in a scrollable container.
   */
  private applyZoom(): void {
    // For PDF, re-render at the new zoom — canvas sizing is handled inside renderPdfPage
    if (this.isPdf) {
      this.renderPdfPage(this.pdfCurrentPage);
      return;
    }

    const viewer = this.viewer?.nativeElement as HTMLElement;
    const wrapper = this.zoomWrapper?.nativeElement as HTMLElement;
    if (!viewer || !wrapper) return;

    const zoom = this.settings.zoomLevel();
    const scale = this.zoomScaleFactor(zoom);
    const isFit = zoom === 'fit-width' || zoom === 'fit-screen';

    if (isFit) {
      // Reset transform — content fills the wrapper naturally
      viewer.style.transform = '';
      viewer.style.transformOrigin = '';
      viewer.style.width = '100%';
      viewer.style.height = '100%';
      wrapper.classList.remove('zoom-scrollable');

      if (zoom === 'fit-width') {
        viewer.style.maxWidth = '100%';
      } else {
        viewer.style.maxWidth = '';
      }
    } else {
      // Percentage zoom — scale via CSS transform
      viewer.style.transform = `scale(${scale})`;
      viewer.style.transformOrigin = 'top left';
      // Size the viewer at 100% of wrapper; the transform handles magnification
      viewer.style.width = '100%';
      viewer.style.height = '100%';
      viewer.style.maxWidth = '';
      wrapper.classList.add('zoom-scrollable');
    }

    // Re-sync epub.js rendition dimensions after zoom change
    this.handleContainerResize();
  }

  /** Convert a ZoomLevel token to a numeric scale factor. */
  private zoomScaleFactor(zoom: ZoomLevel): number {
    switch (zoom) {
      case '100': return 1;
      case '200': return 2;
      case '300': return 3;
      default:    return 1; // fit modes are unscaled
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
    if (this.isPdf) {
      // PDF bookmarks use page number as location
      const pageStr = String(this.pdfCurrentPage);
      let alreadyBookmarked = false;
      let existingBookmarkId = '';
      this.bookmarks$.subscribe((bookmarks) => {
        const existing = bookmarks.find((b) => b.location === pageStr);
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
          location: pageStr,
          label: `Page ${this.pdfCurrentPage}`,
          createdAt: new Date(),
        };
        this.store.dispatch(DocumentsActions.addBookmark({ id: this.documentId, bookmark }));
        this.isCurrentLocationBookmarked.set(true);
      }
      return;
    }

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
    if (this.isPdf) {
      const page = parseInt(bookmark.location, 10);
      if (page >= 1 && page <= this.pdfTotalPages) {
        this.pdfCurrentPage = page;
        this.renderPdfPage(page);
        this.updatePdfLocation();
      }
    } else if (this.rendition) {
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
        this.settings.focusMode.update(v => !v);
        this.focusModeChange.emit(this.settings.focusMode());
        this.settings.saveSettings();
      }
    }

    // Follow mode controls
    if (this.settings.followMode()) {
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        this.followModeService.togglePause();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.followModeService.advance();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.followModeService.retreat();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.settings.followMode.set(false);
        this.followModeService.cleanup();
        this.settings.saveSettings();
      }
      return; // Don't process other shortcuts in follow mode
    }

    // Page navigation and other shortcuts (when NOT in follow mode and NOT in input)
    if (!isInputActive) {
      if (event.key === 'Escape' && this.settings.focusMode()) {
        event.preventDefault();
        this.exitFocusMode();
      } else if (event.key === 'ArrowRight') {
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
    const newSize = this.settings.fontSize() + this.settings.FONT_SIZE_STEP;
    this.settings.fontSize.set(newSize);
    if (this.rendition) {
      this.rendition.themes.fontSize(`${newSize}px`);
    }
    this.settings.saveSettings();
  }

  private decreaseFontSize(): void {
    const currentSize = this.settings.fontSize();
    if (currentSize > this.settings.FONT_SIZE_MIN) {
      const newSize = Math.max(this.settings.FONT_SIZE_MIN, currentSize - this.settings.FONT_SIZE_STEP);
      this.settings.fontSize.set(newSize);
      if (this.rendition) {
        this.rendition.themes.fontSize(`${newSize}px`);
      }
      this.settings.saveSettings();
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
  // Touch swipe page navigation (mobile)
  // ---------------------------------------------------------------------------

  /**
   * Bound touch-start handler for swipe page navigation.
   * Stored as arrow function so it can be added/removed by reference.
   */
  private swipeTouchStart = (event: TouchEvent) => {
    // Don't start a swipe if the settings panel is open
    if (this.panelOpen()) return;

    const touch = event.touches[0];
    this.swipeTouchStartX = touch.clientX;
    this.swipeTouchStartY = touch.clientY;
    this.swipeTouchStartTime = Date.now();
    this.swipeActive = true;
  };

  private swipeTouchEnd = (event: TouchEvent) => {
    if (!this.swipeActive) return;
    this.swipeActive = false;

    // Only handle swipe page navigation in paginated mode (epub) or PDF
    if (!this.isPdf && this.settings.flowMode() !== 'paginated') return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - this.swipeTouchStartX;
    const deltaY = touch.clientY - this.swipeTouchStartY;
    const elapsed = Date.now() - this.swipeTouchStartTime;

    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // Thresholds: minimum 50px horizontal distance, must be more horizontal
    // than vertical (ratio > 1.5), and completed within 500ms
    const MIN_DISTANCE = 50;
    const MAX_TIME = 500;
    const DIRECTION_RATIO = 1.5;

    if (absDeltaX < MIN_DISTANCE || elapsed > MAX_TIME) return;
    if (absDeltaY * DIRECTION_RATIO > absDeltaX) return; // too vertical

    if (deltaX < 0) {
      // Swiped left → next page
      this.nextPage();
    } else {
      // Swiped right → previous page
      this.prevPage();
    }
  };

  /**
   * Attach touch listeners to the epub.js iframe document for swipe detection.
   * Called after initial render and again via the `rendered` event callback.
   */
  private attachIframeSwipeListeners(): void {
    if (!this.rendition) return;

    try {
      const contents = this.rendition.getContents();
      if (contents && contents.length > 0) {
        contents.forEach((content: any) => {
          const iframeDoc = content.document as Document;
          if (iframeDoc) {
            iframeDoc.addEventListener('touchstart', this.swipeTouchStart, { passive: true });
            iframeDoc.addEventListener('touchend', this.swipeTouchEnd, { passive: true });
          }
        });
      }
    } catch (error) {
      console.warn('Could not attach iframe swipe listeners:', error);
    }
  }

  /**
   * Remove touch listeners from the epub.js iframe documents.
   */
  private detachIframeSwipeListeners(): void {
    if (!this.rendition) return;

    try {
      const contents = this.rendition.getContents();
      if (contents && contents.length > 0) {
        contents.forEach((content: any) => {
          const iframeDoc = content.document as Document;
          if (iframeDoc) {
            iframeDoc.removeEventListener('touchstart', this.swipeTouchStart);
            iframeDoc.removeEventListener('touchend', this.swipeTouchEnd);
          }
        });
      }
    } catch {
      // Silently ignore cleanup errors
    }
  }

  /**
   * Re-attach swipe listeners each time epub.js renders a new section
   * (the iframe content is replaced on page turns).
   */
  private swipeRenderedHandler = () => {
    this.attachIframeSwipeListeners();
  };

  /**
   * Re-attach keyboard listeners each time epub.js renders a new section
   * (the iframe content is replaced on page turns).
   */
  private keyboardRenderedHandler = () => {
    this.attachIframeKeyboardListeners();
  };

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

    // Use the zoom-wrapper for sizing so the viewer inherits the correct
    // available space regardless of the current zoom level.
    const wrapper = this.zoomWrapper?.nativeElement as HTMLElement;
    const wrapperPadBottom = wrapper
      ? parseFloat(getComputedStyle(wrapper).paddingBottom) || 0
      : 0;

    const scale = this.zoomScaleFactor(this.settings.zoomLevel());
    const renditionWidth = wrapper
      ? Math.floor(wrapper.clientWidth / scale)
      : Math.floor(this.viewer.nativeElement.clientWidth / scale);
    const renditionHeight = wrapper
      ? Math.floor((wrapper.clientHeight - wrapperPadBottom) / scale)
      : Math.floor(this.viewer.nativeElement.clientHeight / scale);

    // Create new rendition with explicit pixel dimensions
    this.rendition = this.book.renderTo(this.viewer.nativeElement, {
      width: renditionWidth,
      height: renditionHeight,
      spread: this.spreadFromPageLayout(this.settings.pageLayout()),
      flow: this.settings.flowMode(),
      allowScriptedContent: true,
    });

    // Re-wire services to the new rendition
    this.accessibility.setRendition(this.rendition);
    this.followModeService.setRendition(this.rendition);

    // Re-register themes
    this.registerThemes();

    // Restore position — display() must be called before applyAllSettings()
    // because epub.js initialises its internal manager during display().
    if (currentCfi) {
      await this.rendition.display(currentCfi);
    } else {
      await this.rendition.display();
    }

    // Apply all settings now that the rendition manager is ready
    this.applyAllSettings();

    // Re-attach location tracking
    this.rendition.on('relocated', (location: any) => {
      this.updateLocation(location);
    });

    // Re-attach keyboard listeners to the new iframe
    this.attachIframeKeyboardListeners();
    this.rendition.on('rendered', this.keyboardRenderedHandler);

    // Re-attach swipe listeners to the new iframe
    this.attachIframeSwipeListeners();
    this.rendition.on('rendered', this.swipeRenderedHandler);
  }

}
