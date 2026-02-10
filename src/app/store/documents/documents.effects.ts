import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { map, mergeMap, catchError } from 'rxjs/operators';
import { of, from } from 'rxjs';
import { DocumentsActions } from './documents.actions';
import { IndexDBService } from '../../core/services/indexdb.service';
import { EpubService } from '../../core/services/epub.service';
import { PdfService } from '../../core/services/pdf.service';
import { OpenLibraryService } from '../../core/services/open-library.service';
import { Document } from '../../core/models/document.model';
import { ShelvesActions } from '../shelves/shelves.actions';

@Injectable()
export class DocumentsEffects {
  private actions$ = inject(Actions);
  private indexDB = inject(IndexDBService);
  private epubService = inject(EpubService);
  private pdfService = inject(PdfService);
  private openLibraryService = inject(OpenLibraryService);
  private store = inject(Store);

  uploadDocument$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.uploadDocument),
      mergeMap(({ file }) =>
        from(this.processUpload(file)).pipe(
          map((document) => DocumentsActions.uploadDocumentSuccess({ document })),
          catchError((error) =>
            of(DocumentsActions.uploadDocumentFailure({ error: error.message }))
          )
        )
      )
    )
  );

  // Bulk upload multiple files concurrently
  uploadDocuments$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.uploadDocuments),
      mergeMap(({ files }) =>
        from(Promise.all(files.map((f) => this.processUpload(f)))).pipe(
          mergeMap((documents) =>
            // Save metadata for all documents
            from(Promise.all(documents.map((d) => this.indexDB.saveMetadata(d)))).pipe(
              map(() => DocumentsActions.uploadDocumentsSuccess({ documents }))
            )
          ),
          catchError((error) => of(DocumentsActions.uploadDocumentsFailure({ error: error?.message || String(error) })))
        )
      )
    )
  );

  // Export metadata to a JSON file and trigger download
  exportMetadata$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.exportMetadata),
      mergeMap(() =>
        from(this.indexDB.getAllMetadata()).pipe(
          map((metadata) => {
            const json = JSON.stringify(metadata, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const filename = `library-metadata-${new Date().toISOString().slice(0,10)}.json`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            return DocumentsActions.exportMetadataSuccess({ fileName: filename });
          }),
          catchError((error) => of(DocumentsActions.exportMetadataFailure({ error: error?.message || String(error) })))
        )
      )
    )
  );

  // Create a full library backup (metadata + files) and trigger download
  backupLibrary$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.backupLibrary),
      mergeMap(() =>
        from(this.indexDB.exportLibrary()).pipe(
          map((blob) => {
            const filename = `library-backup-${new Date().toISOString().slice(0,10)}.json`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            return DocumentsActions.backupLibrarySuccess({ fileName: filename });
          }),
          catchError((error) => of(DocumentsActions.backupLibraryFailure({ error: error?.message || String(error) })))
        )
      )
    )
  );

  // Restore library from an exported backup file
  restoreLibrary$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.restoreLibrary),
      mergeMap(({ file }) =>
        from(this.readFileAsText(file)).pipe(
          mergeMap(async (text) => {
            try {
              const payload = JSON.parse(text);
              await this.indexDB.importLibrary(payload);
              // reload metadata and shelves from storage so store is in sync
              this.store.dispatch(DocumentsActions.loadDocuments());
              this.store.dispatch(ShelvesActions.loadShelves());
              return DocumentsActions.restoreLibrarySuccess();
            } catch (e: any) {
              return DocumentsActions.restoreLibraryFailure({ error: e?.message || String(e) });
            }
          }),
          catchError((error) => of(DocumentsActions.restoreLibraryFailure({ error: error?.message || String(error) })))
        )
      )
    )
  );

  uploadDocumentSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.uploadDocumentSuccess),
      mergeMap(({ document }) =>
        from(this.indexDB.saveMetadata(document)).pipe(
          map(() => ({ type: 'NO_ACTION' as const }))
        )
      )
    ),
    { dispatch: false }
  );

  loadDocuments$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.loadDocuments),
      mergeMap(() => from(this.loadStoredDocuments()).pipe(
        map((documents) => DocumentsActions.loadDocumentsSuccess({ documents }))
      ))
    )
  );

  deleteDocument$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.deleteDocument),
      mergeMap(({ id }) =>
        from(this.indexDB.deleteFile(id)).pipe(
          map(() => DocumentsActions.deleteDocumentSuccess({ id }))
        )
      )
    )
  );

  updateReadingProgress$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.updateReadingProgress),
      mergeMap(({ id, page, cfi, progressPercent }) =>
        from(this.updateMetadata(id, { currentPage: page, ...(cfi ? { currentCfi: cfi } : {}), ...(progressPercent != null ? { readingProgressPercent: progressPercent } : {}) })).pipe(
          map(() => ({ type: 'NO_ACTION' as const }))
        )
      )
    ),
    { dispatch: false }
  );

  // --- Bookmark persistence ---

  addBookmark$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.addBookmark),
      mergeMap(({ id, bookmark }) =>
        from(this.persistBookmarks(id)).pipe(
          map(() => ({ type: 'NO_ACTION' as const }))
        )
      )
    ),
    { dispatch: false }
  );

  removeBookmark$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.removeBookmark),
      mergeMap(({ id }) =>
        from(this.persistBookmarks(id)).pipe(
          map(() => ({ type: 'NO_ACTION' as const }))
        )
      )
    ),
    { dispatch: false }
  );

  updateBookmark$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.updateBookmark),
      mergeMap(({ id }) =>
        from(this.persistBookmarks(id)).pipe(
          map(() => ({ type: 'NO_ACTION' as const }))
        )
      )
    ),
    { dispatch: false }
  );

  // --- Reading session persistence ---

  endReadingSession$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.endReadingSession),
      mergeMap(({ id }) =>
        from(this.persistReadingStats(id)).pipe(
          map(() => ({ type: 'NO_ACTION' as const }))
        )
      )
    ),
    { dispatch: false }
  );

  // --- Reading goal persistence ---

  setReadingGoal$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.setReadingGoal),
      mergeMap(({ id }) =>
        from(this.persistReadingGoal(id)).pipe(
          map(() => ({ type: 'NO_ACTION' as const }))
        )
      )
    ),
    { dispatch: false }
  );

  updateReadingStreak$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.updateReadingStreak),
      mergeMap(({ id }) =>
        from(this.persistReadingGoal(id)).pipe(
          map(() => ({ type: 'NO_ACTION' as const }))
        )
      )
    ),
    { dispatch: false }
  );

  // --- Metadata actions ---

  updateBookMetadata$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.updateBookMetadata),
      mergeMap(({ id }) =>
        from(this.persistMetadata(id)).pipe(
          map(() => ({ type: 'NO_ACTION' as const }))
        )
      )
    ),
    { dispatch: false }
  );

  fetchMetadataFromOpenLibrary$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.fetchMetadataFromOpenLibrary),
      mergeMap(({ id, title }) =>
        this.openLibraryService.searchByTitle(title).pipe(
          map((results) => {
            if (results.length > 0) {
              return DocumentsActions.fetchMetadataSuccess({ id, metadata: results[0] });
            }
            return { type: 'NO_ACTION' as const };
          }),
          catchError(() => of({ type: 'NO_ACTION' as const }))
        )
      )
    )
  );

  fetchMetadataSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.fetchMetadataSuccess),
      mergeMap(({ id }) =>
        from(this.persistMetadata(id)).pipe(
          map(() => ({ type: 'NO_ACTION' as const }))
        )
      )
    ),
    { dispatch: false }
  );

  private async processUpload(file: File): Promise<Document> {
    const id = crypto.randomUUID();
    const type = file.name.endsWith('.epub') ? 'epub' : 'pdf';
    
    let metadata: { title: string; totalPages?: number };
    
    if (type === 'epub') {
      metadata = await this.epubService.extractMetadata(file);
    } else {
      metadata = await this.pdfService.extractMetadata(file);
    }

    const document: Document = {
      id,
      title: metadata.title,
      type,
      fileSize: file.size,
      uploadDate: new Date(),
      totalPages: metadata.totalPages,
      bookmarks: [],
      readingStats: { totalReadingTime: 0, sessions: [] },
    };

    await this.indexDB.saveFile(id, file);
    
    return document;
  }

  private async loadStoredDocuments(): Promise<Document[]> {
    const docs = await this.indexDB.getAllMetadata();
    // Migrate older documents that lack new fields
    return docs.map((doc) => ({
      ...doc,
      bookmarks: doc.bookmarks ?? [],
      readingStats: doc.readingStats ?? { totalReadingTime: 0, sessions: [] },
    }));
  }

  private async updateMetadata(id: string, changes: Partial<Document>): Promise<void> {
    const document = await this.indexDB.getMetadata(id);
    if (document) {
      Object.assign(document, changes, { lastOpened: new Date() });
      await this.indexDB.saveMetadata(document);
    }
  }

  private async persistBookmarks(id: string): Promise<void> {
    // We need a small delay for the reducer to apply first
    const document = await this.indexDB.getMetadata(id);
    if (!document) return;
    // Re-read from store is tricky in effects, so we update via current metadata
    // The reducer has already updated the entity; we use selectSnapshot pattern
    await this.syncDocumentField(id, 'bookmarks');
  }

  private async persistReadingStats(id: string): Promise<void> {
    await this.syncDocumentField(id, 'readingStats');
  }

  private async persistReadingGoal(id: string): Promise<void> {
    await this.syncDocumentField(id, 'readingGoal');
  }

  private async persistMetadata(id: string): Promise<void> {
    // Persist both metadata and title so changes made via UpdateBookMetadata
    // (which may include a title) are saved to IndexedDB.
    return new Promise((resolve) => {
      this.store.select((state: any) => state.documents.entities[id]).subscribe(async (entity: Document | undefined) => {
        if (entity) {
          const persisted = await this.indexDB.getMetadata(id);
          if (persisted) {
            persisted.metadata = entity.metadata;
            persisted.title = entity.title;
            await this.indexDB.saveMetadata(persisted);
          }
        }
        resolve();
      }).unsubscribe();
    });
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsText(file);
    });
  }

  /**
   * Read the current entity from the store and persist the given field to IndexedDB.
   */
  private syncDocumentField(id: string, field: keyof Document): Promise<void> {
    return new Promise((resolve) => {
      this.store.select((state: any) => state.documents.entities[id]).subscribe(async (entity: Document | undefined) => {
        if (entity) {
          const persisted = await this.indexDB.getMetadata(id);
          if (persisted) {
            (persisted as any)[field] = (entity as any)[field];
            await this.indexDB.saveMetadata(persisted);
          }
        }
        resolve();
      }).unsubscribe();
    });
  }
}
