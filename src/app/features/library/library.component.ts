import { Component, inject, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, map, combineLatest, BehaviorSubject, Subscription } from 'rxjs';
import { CdkDragDrop, CdkDragStart, CdkDragEnd, DragDropModule } from '@angular/cdk/drag-drop';
import { MatDialog } from '@angular/material/dialog';
import { Actions, ofType } from '@ngrx/effects';
import { Document, BookMetadata } from '../../core/models/document.model';
import { AutoBackupService } from '../../core/services/auto-backup.service';
import { Shelf } from '../../core/models/shelf.model';
import { selectAllDocuments, selectLoading } from '../../store/documents/documents.selectors';
import { selectAllShelves, selectSelectedShelfId } from '../../store/shelves/shelves.selectors';
import { DocumentsActions } from '../../store/documents/documents.actions';
import { ShelvesActions } from '../../store/shelves/shelves.actions';
import { UiActions } from '../../store/ui/ui.actions';
import { selectSidebarOpen } from '../../store/ui/ui.selectors';
import { UploadComponent } from '../upload/upload.component';
import { EditBookModalComponent } from './edit-book-modal/edit-book-modal.component';
import { CreateShelfModalComponent } from './create-shelf-modal/create-shelf-modal.component';
import { TopBarComponent } from './components/top-bar/top-bar.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { BookCardComponent } from './components/book-card/book-card.component';

@Component({
  selector: 'app-library',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    UploadComponent,
    EditBookModalComponent,
    TopBarComponent,
    SidebarComponent,
    BookCardComponent,
    // Import/Export modal
    // (loaded via MatDialog)
  ],
  templateUrl: './library.component.html',
  styleUrl: './library.component.css'
})
export class LibraryComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private actions$ = inject(Actions);
  private autoBackupService = inject(AutoBackupService);
  private backupActionsSub: Subscription | null = null;
  private backupTimestamp: ReturnType<typeof setTimeout> | null = null;
  
  documents$: Observable<Document[]> = this.store.select(selectAllDocuments);
  loading$: Observable<boolean> = this.store.select(selectLoading);
  shelves$: Observable<Shelf[]> = this.store.select(selectAllShelves);
  selectedShelfId$: Observable<string | null> = this.store.select(selectSelectedShelfId);
  
  editingDocument: Document | null = null;

  /** Temporary "Updated" badge timestamp shown after auto-backup */
  lastBackupTime: string | null = null;
  
  // New UI state
  searchQuery = '';
  viewMode: 'grid' | 'list' = 'grid';
  sortBy: 'recent' | 'progress' = 'recent';
  sortOrder: 'desc' | 'asc' = 'desc';
  // Expose as subjects so the list recomputes when sort settings change
  private sortBy$ = new BehaviorSubject<'recent' | 'progress'>(this.sortBy);
  private sortOrder$ = new BehaviorSubject<'desc' | 'asc'>(this.sortOrder);

  // Which sort dropdown is open (null | 'recent' | 'progress')
  openSortMenu: 'recent' | 'progress' | null = null;

  shelvesExpanded = true;
  openMenuId: string | null = null;

  // Mobile sidebar state (driven by NgRx UI state)
  sidebarOpen$ = this.store.select(selectSidebarOpen);
  
  private searchQuery$ = new BehaviorSubject<string>('');

  // File upload drag-and-drop zone
  fileDragOver = false;
  private fileDragCounter = 0;

  // Runtime caches used for drag-drop fallback
  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private currentDraggingDocId: string | null = null;
  private currentDocuments: Document[] = [];
  
  filteredDocuments$: Observable<Document[]> = combineLatest([
    this.documents$,
    this.searchQuery$,
    this.selectedShelfId$,
    this.sortBy$,
    this.sortOrder$
  ]).pipe(
    map(([docs, query, selectedShelfId, sortBy, sortOrder]) => {
      let filtered = docs;
      
      // Filter by selected shelf
      if (selectedShelfId) {
        filtered = filtered.filter(d => d.shelfId === selectedShelfId);
      } else if (selectedShelfId === null) {
        // Show only unshelved documents when "Unshelved" is selected
        filtered = filtered.filter(d => !d.shelfId);
      }
      
      // Filter by search query
      if (query.trim()) {
        const q = query.toLowerCase();
        filtered = filtered.filter(d => 
          d.title.toLowerCase().includes(q) ||
          (d.metadata?.author?.toLowerCase().includes(q))
        );
      }

      // Sort according to UI selection
      filtered = filtered.slice().sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'recent') {
          const ta = (a.lastOpened ?? a.uploadDate)?.valueOf() ?? 0;
          const tb = (b.lastOpened ?? b.uploadDate)?.valueOf() ?? 0;
          cmp = ta - tb;
        } else if (sortBy === 'progress') {
          cmp = this.getProgress(a) - this.getProgress(b);
        }
        return sortOrder === 'asc' ? cmp : -cmp;
      });
      
      return filtered;
    })
  );

  @HostListener('document:click')
  onDocumentClick(): void {
    this.openMenuId = null;
    this.openSortMenu = null;
  }

  toggleSortMenu(menu: 'recent' | 'progress', event: Event): void {
    event.stopPropagation();
    this.openMenuId = null; // close other menus
    this.openSortMenu = this.openSortMenu === menu ? null : menu;
    this.sortBy = menu;
    this.sortBy$.next(this.sortBy);
  }

  setSort(sort: 'recent' | 'progress', order: 'asc' | 'desc'): void {
    this.sortBy = sort;
    this.sortOrder = order;
    this.sortBy$.next(this.sortBy);
    this.sortOrder$.next(this.sortOrder);
    this.openSortMenu = null;
  }

  ngOnInit(): void {
    // Load documents and shelves on component init
    this.store.dispatch(DocumentsActions.loadDocuments());
    this.store.dispatch(ShelvesActions.loadShelves());

    // Keep a small in-memory cache of documents to be able to perform
    // drag-drop fallback updates without requiring an async selector read.
    this.documents$.subscribe(docs => (this.currentDocuments = docs));

    // Auto-backup when a book is edited or deleted
    this.backupActionsSub = this.actions$
      .pipe(
        ofType(
          DocumentsActions.deleteDocumentSuccess,
          DocumentsActions.updateBookMetadata,
          DocumentsActions.fetchMetadataSuccess
        )
      )
      .subscribe(() => this.triggerAutoBackup());
  }

  ngOnDestroy(): void {
    this.backupActionsSub?.unsubscribe();
    if (this.backupTimestamp) clearTimeout(this.backupTimestamp);
  }

  private async triggerAutoBackup(): Promise<void> {
    await this.autoBackupService.runBackup();
    this.lastBackupTime = new Date().toLocaleTimeString();
    if (this.backupTimestamp) clearTimeout(this.backupTimestamp);
    this.backupTimestamp = setTimeout(() => {
      this.lastBackupTime = null;
    }, 5000);
  }

  onSearchChange(): void {
    this.searchQuery$.next(this.searchQuery);
  }

  toggleMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.openMenuId = this.openMenuId === id ? null : id;
  }

  // When a drag finishes, a click event is still emitted on the dragged element.
  // Use a short-lived flag to ignore clicks that immediately follow a drag/drop.
  private recentlyDragged = false;

  openDocument(id: string): void {
    // Ignore clicks that immediately follow a drag to prevent opening while dropping
    if (this.recentlyDragged) return;
    this.router.navigate(['/reader', id]);
  }

  onDragStarted(docId: string): void {
    this.recentlyDragged = true;
    this.isDragging = true;
    this.currentDraggingDocId = docId;
  }

  onDragEnded(docId: string): void {
    // Keep the flag set briefly to swallow the click event fired on release
    setTimeout(() => (this.recentlyDragged = false), 150);
    this.isDragging = false;

    // Fallback: if the CDK drop wasn't triggered (no onBookDrop), detect if the
    // user released over a shelf and dispatch the move action directly.
    try {
      const el = document.elementFromPoint(this.lastPointerX, this.lastPointerY) as HTMLElement | null;
      const shelfEl = el ? el.closest('.shelf-item') as HTMLElement | null : null;

      if (shelfEl && this.currentDraggingDocId) {
        const shelfIdAttr = shelfEl.getAttribute('data-shelf-id');
        const targetShelfId = shelfIdAttr && shelfIdAttr.length > 0 ? shelfIdAttr : null;

        const doc = this.currentDocuments.find(d => d.id === this.currentDraggingDocId);
        if (doc) {
          const fromShelfId = doc.shelfId || null;
          if (fromShelfId !== targetShelfId) {            console.log('onDragEnded fallback: moving', { documentId: this.currentDraggingDocId, fromShelfId, targetShelfId });            this.store.dispatch(
              ShelvesActions.moveDocumentToShelf({
                documentId: this.currentDraggingDocId,
                fromShelfId,
                toShelfId: targetShelfId
              })
            );
          }
        }
      }
    } catch (e) {
      // elementFromPoint can throw in some testing environments; ignore.
    }

    this.currentDraggingDocId = null;
  }

  deleteDocument(id: string): void {
    if (confirm('Are you sure you want to delete this document?')) {
      this.store.dispatch(DocumentsActions.deleteDocument({ id }));
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString();
  }

  getProgress(doc: Document): number {
    if (doc.readingProgressPercent != null) return doc.readingProgressPercent;
    if (!doc.currentPage || !doc.totalPages || doc.totalPages === 0) return 0;
    return Math.round((doc.currentPage / doc.totalPages) * 100);
  }

  formatDuration(ms: number): string {
    const totalMinutes = Math.floor(ms / 60000);
    if (totalMinutes < 60) return `${totalMinutes}m`;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}h ${mins}m`;
  }

  openEditModal(doc: Document, event: Event): void {
    event.stopPropagation();
    this.editingDocument = doc;
  }

  closeEditModal(): void {
    this.editingDocument = null;
  }

  saveMetadata(metadata: BookMetadata): void {
    if (this.editingDocument) {
      this.store.dispatch(DocumentsActions.updateBookMetadata({ 
        id: this.editingDocument.id, 
        metadata 
      }));
      this.editingDocument = null;
    }
  }

  fetchMetadata(doc: Document, event: Event): void {
    event.stopPropagation();
    this.store.dispatch(DocumentsActions.fetchMetadataFromOpenLibrary({ 
      id: doc.id, 
      title: doc.title 
    }));
  }

  getCoverImage(doc: Document): string | null {
    return doc.metadata?.coverUrl || null;
  }

  getAuthor(doc: Document): string {
    return doc.metadata?.author || 'Unknown Author';
  }

  // Shelf management methods
  openCreateShelfModal(): void {
    const dialogRef = this.dialog.open(CreateShelfModalComponent, {
      width: '500px',
      disableClose: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.store.dispatch(ShelvesActions.createShelf({ name: result.name, color: result.color }));
      }
    });
  }

  openImportExportModal(): void {
    const comp = (window as any).ImportExportModalComponent;
    if (comp) {
      this.dialog.open(comp, { width: '600px', disableClose: false });
    } else {
      import('./import-export-modal/import-export-modal.component').then(m => {
        (window as any).ImportExportModalComponent = m.ImportExportModalComponent;
        this.dialog.open(m.ImportExportModalComponent, { width: '600px', disableClose: false });
      });
    }
  }

  // Close the mobile sidebar via NgRx
  closeMobileSidebar(): void {
    this.store.dispatch(UiActions.closeSidebar());
  }

  selectShelf(shelfId: string | null): void {
    this.store.dispatch(ShelvesActions.selectShelf({ id: shelfId }));
  }

  deleteShelf(shelfId: string, event: Event): void {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this shelf? Books will be moved to Unshelved.')) {
      this.store.dispatch(ShelvesActions.deleteShelf({ id: shelfId }));
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(e: MouseEvent): void {
    if (this.isDragging) {
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    }
  }

  @HostListener('document:touchmove', ['$event'])
  onDocumentTouchMove(e: TouchEvent): void {
    if (this.isDragging && e.touches && e.touches.length > 0) {
      this.lastPointerX = e.touches[0].clientX;
      this.lastPointerY = e.touches[0].clientY;
    }
  }

  getShelfDocumentCount(shelf: Shelf, documents: Document[]): number {
    return documents.filter(d => d.shelfId === shelf.id).length;
  }

  getUnshelvedCount(documents: Document[]): number {
    return documents.filter(d => !d.shelfId).length;
  }

  // Drag and drop handling
  onBookDrop(event: CdkDragDrop<any>, targetShelfId: string | null): void {
    const documentId = event.item.data;
    console.log('onBookDrop', { targetShelfId, documentId, previousContainer: event.previousContainer.id, container: event.container.id });

    const document = event.previousContainer.data.find((d: Document) => d.id === documentId);
    
    if (!document) return;
    
    const fromShelfId = document.shelfId || null;
    
    if (fromShelfId !== targetShelfId) {
      this.store.dispatch(
        ShelvesActions.moveDocumentToShelf({
          documentId,
          fromShelfId,
          toShelfId: targetShelfId
        })
      );
    }
  }



  onMainListDropped(event: CdkDragDrop<any>): void {
    // Currently we don't allow reordering in the main list; drops here are no-ops.
    // Future: implement reordering via DocumentsActions.updateOrder
    return;
  }

  // ---- File upload drop zone ----

  onFileDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onFileDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.fileDragCounter++;
    if (event.dataTransfer?.types?.includes('Files')) {
      this.fileDragOver = true;
    }
  }

  onFileDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.fileDragCounter--;
    if (this.fileDragCounter <= 0) {
      this.fileDragCounter = 0;
      this.fileDragOver = false;
    }
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.fileDragOver = false;
    this.fileDragCounter = 0;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const accepted = Array.from(files).filter(
        f => f.name.endsWith('.epub') || f.name.endsWith('.pdf')
      );
      if (accepted.length > 0) {
        this.store.dispatch(DocumentsActions.uploadDocuments({ files: accepted }));
      }
    }
  }
}
