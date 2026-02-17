import { Component, Input, inject, OnInit, OnDestroy, ElementRef, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs';
import { firstValueFrom } from 'rxjs';
import { DocumentApiService } from '../../../core/services/document-api.service';
import { DocumentsActions } from '../../../store/documents/documents.actions';
import {
  selectSelectedDocumentBookmarks,
  selectReadingProgress,
  selectEstimatedTimeRemaining,
  selectReadingStats,
  selectReadingGoal,
  selectTodayReadingTime,
} from '../../../store/documents/documents.selectors';
import { Bookmark, ReadingSession } from '../../../core/models/document.model';
import { PagesPanelComponent, PdfOutlineItem } from './pages-panel/pages-panel.component';

@Component({
  selector: 'app-pdf-reader',
  standalone: true,
  imports: [CommonModule, FormsModule, PagesPanelComponent],
  templateUrl: './pdf-reader.component.html',
  styleUrl: './pdf-reader.component.css'
})
export class PdfReaderComponent implements OnInit, OnDestroy {
  @Input() documentId!: string;
  @ViewChild('pdfCanvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  
  private store = inject(Store);
  private documentApi = inject(DocumentApiService);
  pdfDoc: any;
  
  currentPage = 1;
  totalPages = 0;
  scale = 1.5;

  // --- Bookmarks & progress from store ---
  bookmarks$ = this.store.select(selectSelectedDocumentBookmarks);
  readingProgress$ = this.store.select(selectReadingProgress);
  estimatedTimeRemaining$ = this.store.select(selectEstimatedTimeRemaining);
  readingStats$ = this.store.select(selectReadingStats);
  readingGoal$ = this.store.select(selectReadingGoal);
  todayReadingTime$ = this.store.select(selectTodayReadingTime);

  bookmarksOpen = signal<boolean>(false);
  isCurrentPageBookmarked = signal<boolean>(false);

  // --- Pages panel ---
  pagesPanelOpen = signal<boolean>(false);
  pdfOutline = signal<PdfOutlineItem[]>([]);
  bookmarksList = signal<Bookmark[]>([]);

  // --- Reading session tracking ---
  private sessionStartTime: Date | null = null;
  private sessionStartPage = 0;

  async ngOnInit(): Promise<void> {
    // Set worker from bundled npm package instead of CDN
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
    this.startReadingSession();
    
    try {
      const blob = await firstValueFrom(this.documentApi.getDocumentFile(this.documentId));
      if (blob) {
        const arrayBuffer = await blob.arrayBuffer();
        this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        this.totalPages = this.pdfDoc.numPages;
        
        // Load saved page or start at page 1
        const metadata = await firstValueFrom(this.documentApi.getDocument(this.documentId)).catch(() => null);
        if (metadata?.currentPage) {
          this.currentPage = metadata.currentPage;
        }
        
        await this.renderPage(this.currentPage);
        this.checkBookmarkState();
        await this.loadOutline();
        this.subscribeBookmarks();
      }
    } catch (error) {
      console.error('Error loading PDF:', error);
    }
  }

  ngOnDestroy(): void {
    this.endReadingSession();
    if (this.pdfDoc) {
      this.pdfDoc.destroy();
    }
  }

  async renderPage(pageNum: number): Promise<void> {
    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: this.scale });
      const canvas = this.canvas.nativeElement;
      const context = canvas.getContext('2d')!;
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      await page.render({ canvasContext: context, viewport }).promise;
    } catch (error) {
      console.error('Error rendering page:', error);
    }
  }

  async nextPage(): Promise<void> {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      await this.renderPage(this.currentPage);
      this.updateProgress();
      this.checkBookmarkState();
    }
  }

  async prevPage(): Promise<void> {
    if (this.currentPage > 1) {
      this.currentPage--;
      await this.renderPage(this.currentPage);
      this.updateProgress();
      this.checkBookmarkState();
    }
  }

  async onScaleChange(): Promise<void> {
    await this.renderPage(this.currentPage);
  }

  private updateProgress(): void {
    const progressPercent =
      this.totalPages > 0
        ? Math.round((this.currentPage / this.totalPages) * 100)
        : undefined;
    this.store.dispatch(
      DocumentsActions.updateReadingProgress({
        id: this.documentId,
        page: this.currentPage,
        progressPercent,
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Bookmarks
  // ---------------------------------------------------------------------------

  toggleBookmarksPanel(): void {
    this.bookmarksOpen.update((open) => !open);
  }

  // ---------------------------------------------------------------------------
  // Pages / Chapters panel
  // ---------------------------------------------------------------------------

  togglePagesPanel(): void {
    this.pagesPanelOpen.update((open) => !open);
  }

  async onPanelPageSelect(page: number): Promise<void> {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      await this.renderPage(page);
      this.updateProgress();
      this.checkBookmarkState();
    }
  }

  async onPanelOutlineSelect(item: PdfOutlineItem): Promise<void> {
    if (!this.pdfDoc || !item.dest) return;
    try {
      let dest = item.dest;
      if (typeof dest === 'string') {
        dest = await this.pdfDoc.getDestination(dest);
      }
      if (dest) {
        const ref = dest[0];
        const pageIndex = await this.pdfDoc.getPageIndex(ref);
        await this.onPanelPageSelect(pageIndex + 1);
      }
    } catch {
      // fallback — ignore navigation errors
    }
  }

  onPanelBookmarkRemove(bookmarkId: string): void {
    this.store.dispatch(
      DocumentsActions.removeBookmark({ id: this.documentId, bookmarkId })
    );
    this.checkBookmarkState();
  }

  private async loadOutline(): Promise<void> {
    if (!this.pdfDoc) return;
    try {
      const outline = await this.pdfDoc.getOutline();
      this.pdfOutline.set(outline ?? []);
    } catch {
      this.pdfOutline.set([]);
    }
  }

  private subscribeBookmarks(): void {
    this.bookmarks$.subscribe((bms) => this.bookmarksList.set(bms));
  }

  toggleBookmarkAtCurrentPage(): void {
    const pageStr = String(this.currentPage);
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
      this.isCurrentPageBookmarked.set(false);
    } else {
      const bookmark: Bookmark = {
        id: crypto.randomUUID(),
        location: pageStr,
        label: `Page ${this.currentPage}`,
        createdAt: new Date(),
      };
      this.store.dispatch(DocumentsActions.addBookmark({ id: this.documentId, bookmark }));
      this.isCurrentPageBookmarked.set(true);
    }
  }

  async jumpToBookmark(bookmark: Bookmark): Promise<void> {
    const page = parseInt(bookmark.location, 10);
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      await this.renderPage(page);
      this.updateProgress();
      this.checkBookmarkState();
      this.bookmarksOpen.set(false);
    }
  }

  removeBookmark(bookmarkId: string, event: Event): void {
    event.stopPropagation();
    this.store.dispatch(
      DocumentsActions.removeBookmark({ id: this.documentId, bookmarkId })
    );
    this.checkBookmarkState();
  }

  private checkBookmarkState(): void {
    const pageStr = String(this.currentPage);
    this.bookmarks$.subscribe((bookmarks) => {
      this.isCurrentPageBookmarked.set(bookmarks.some((b) => b.location === pageStr));
    }).unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Reading session tracking
  // ---------------------------------------------------------------------------

  private startReadingSession(): void {
    this.sessionStartTime = new Date();
    this.sessionStartPage = this.currentPage;
    this.store.dispatch(DocumentsActions.startReadingSession({ id: this.documentId }));
  }

  private endReadingSession(): void {
    if (!this.sessionStartTime) return;
    const now = new Date();
    const duration = now.getTime() - this.sessionStartTime.getTime();
    if (duration < 5000) return;

    const session: ReadingSession = {
      startedAt: this.sessionStartTime,
      endedAt: now,
      duration,
      pagesRead: Math.max(0, this.currentPage - this.sessionStartPage),
    };
    this.store.dispatch(DocumentsActions.endReadingSession({ id: this.documentId, session }));
    this.sessionStartTime = null;
  }

  formatDuration(ms: number): string {
    const totalMinutes = Math.floor(ms / 60000);
    if (totalMinutes < 60) return `${totalMinutes}m`;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}h ${mins}m`;
  }
}
