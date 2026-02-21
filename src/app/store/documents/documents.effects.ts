import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { map, mergeMap, catchError, switchMap, delay } from 'rxjs/operators';
import { of, from, forkJoin } from 'rxjs';
import { DocumentsActions } from './documents.actions';
import { DocumentApiService } from '../../core/services/document-api.service';
import { BackupApiService } from '../../core/services/backup-api.service';
import { OpenLibraryService } from '../../core/services/open-library.service';
import { Document } from '../../core/models/document.model';
import { ShelvesActions } from '../shelves/shelves.actions';
import { LibrarySourcesActions } from '../library-sources/library-sources.actions';

@Injectable()
export class DocumentsEffects {
  private actions$ = inject(Actions);
  private documentApi = inject(DocumentApiService);
  private backupApi = inject(BackupApiService);
  private openLibraryService = inject(OpenLibraryService);
  private store = inject(Store);

  uploadDocument$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.uploadDocument),
      mergeMap(({ file }) =>
        this.documentApi.uploadDocument(file).pipe(
          map((document) => DocumentsActions.uploadDocumentSuccess({ document })),
          catchError((error) =>
            of(DocumentsActions.uploadDocumentFailure({ error: error?.message || String(error) }))
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
        forkJoin(files.map((f) => this.documentApi.uploadDocument(f))).pipe(
          map((documents) => DocumentsActions.uploadDocumentsSuccess({ documents })),
          catchError((error) =>
            of(DocumentsActions.uploadDocumentsFailure({ error: error?.message || String(error) }))
          )
        )
      )
    )
  );

  // Export metadata to a JSON file and trigger download
  exportMetadata$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.exportMetadata),
      mergeMap(() =>
        this.backupApi.exportMetadata().pipe(
          map((blob) => {
            const filename = `library-metadata-${new Date().toISOString().slice(0, 10)}.json`;
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
          catchError((error) =>
            of(DocumentsActions.exportMetadataFailure({ error: error?.message || String(error) }))
          )
        )
      )
    )
  );

  // Create a full library backup (metadata + files) and trigger download
  backupLibrary$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.backupLibrary),
      mergeMap(() =>
        this.backupApi.backupLibrary().pipe(
          map((blob) => {
            const filename = `library-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
          catchError((error) =>
            of(DocumentsActions.backupLibraryFailure({ error: error?.message || String(error) }))
          )
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
          switchMap((text) => {
            const payload = JSON.parse(text);
            return this.backupApi.restoreLibrary(payload).pipe(
              switchMap(() => {
                // Reload data from backend after restore
                this.store.dispatch(DocumentsActions.loadDocuments());
                this.store.dispatch(ShelvesActions.loadShelves());
                return of(DocumentsActions.restoreLibrarySuccess());
              }),
              catchError((error) =>
                of(DocumentsActions.restoreLibraryFailure({ error: error?.message || String(error) }))
              )
            );
          }),
          catchError((error) =>
            of(DocumentsActions.restoreLibraryFailure({ error: error?.message || String(error) }))
          )
        )
      )
    )
  );

  loadDocuments$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.loadDocuments),
      mergeMap(() =>
        this.documentApi.getAllDocuments().pipe(
          map((documents) =>
            DocumentsActions.loadDocumentsSuccess({
              documents: documents.map((doc) => ({
                ...doc,
                bookmarks: doc.bookmarks ?? [],
                readingStats: doc.readingStats ?? { totalReadingTime: 0, sessions: [] },
              })),
            })
          ),
          catchError((error) => {
            console.error('Failed to load documents from API:', error);
            return of(DocumentsActions.loadDocumentsSuccess({ documents: [] }));
          })
        )
      )
    )
  );

  deleteDocument$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.deleteDocument),
      mergeMap(({ id }) =>
        this.documentApi.deleteDocument(id).pipe(
          map(() => DocumentsActions.deleteDocumentSuccess({ id })),
          catchError((error) => {
            console.error('Failed to delete document:', error);
            return of(DocumentsActions.deleteDocumentSuccess({ id }));
          })
        )
      )
    )
  );

  updateReadingProgress$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(DocumentsActions.updateReadingProgress),
        mergeMap(({ id, page, cfi, progressPercent }) =>
          this.documentApi
            .updateReadingProgress(id, {
              page,
              ...(cfi ? { cfi } : {}),
              ...(progressPercent != null ? { progressPercent } : {}),
            })
            .pipe(catchError(() => of(null)))
        )
      ),
    { dispatch: false }
  );

  // --- Bookmark persistence ---

  addBookmark$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(DocumentsActions.addBookmark),
        mergeMap(({ id, bookmark }) =>
          this.documentApi
            .addBookmark(id, {
              location: bookmark.location,
              label: bookmark.label,
              note: bookmark.note,
              chapter: bookmark.chapter,
            })
            .pipe(catchError(() => of(null)))
        )
      ),
    { dispatch: false }
  );

  removeBookmark$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(DocumentsActions.removeBookmark),
        mergeMap(({ id, bookmarkId }) =>
          this.documentApi.removeBookmark(id, bookmarkId).pipe(catchError(() => of(null)))
        )
      ),
    { dispatch: false }
  );

  updateBookmark$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(DocumentsActions.updateBookmark),
        mergeMap(({ id, bookmarkId, note }) =>
          this.documentApi
            .updateBookmark(id, bookmarkId, { note })
            .pipe(catchError(() => of(null)))
        )
      ),
    { dispatch: false }
  );

  // --- Reading session persistence ---

  endReadingSession$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(DocumentsActions.endReadingSession),
        mergeMap(({ id, session }) =>
          this.documentApi.addReadingSession(id, session).pipe(catchError(() => of(null)))
        )
      ),
    { dispatch: false }
  );

  // --- Reading goal persistence ---

  setReadingGoal$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(DocumentsActions.setReadingGoal),
        mergeMap(({ id, goal }) =>
          this.documentApi.setReadingGoal(id, goal).pipe(catchError(() => of(null)))
        )
      ),
    { dispatch: false }
  );

  updateReadingStreak$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(DocumentsActions.updateReadingStreak),
        mergeMap(({ id }) =>
          this.documentApi.updateReadingStreak(id).pipe(catchError(() => of(null)))
        )
      ),
    { dispatch: false }
  );

  // --- Metadata actions ---

  updateBookMetadata$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(DocumentsActions.updateBookMetadata),
        mergeMap(({ id, metadata }) =>
          this.documentApi.updateBookMetadata(id, metadata).pipe(catchError(() => of(null)))
        )
      ),
    { dispatch: false }
  );

  fetchMetadataFromOpenLibrary$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DocumentsActions.fetchMetadataFromOpenLibrary),
      mergeMap(({ id, title }) => {
        const cleanedTitle = this.cleanSearchTitle(title);
        console.log(`[AutoFetch] Cleaned title: "${title}" → "${cleanedTitle}"`);
        return this.openLibraryService.searchByTitle(cleanedTitle).pipe(
          mergeMap((results) => {
            if (results.length > 0) {
              return of(DocumentsActions.fetchMetadataSuccess({ id, metadata: results[0] }));
            }
            return of({ type: 'NO_ACTION' as const });
          }),
          catchError(() => of({ type: 'NO_ACTION' as const }))
        );
      })
    )
  );

  fetchMetadataSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(DocumentsActions.fetchMetadataSuccess),
        mergeMap(({ id, metadata }) =>
          this.documentApi.updateBookMetadata(id, metadata).pipe(catchError(() => of(null)))
        )
      ),
    { dispatch: false }
  );

  // --- Auto-fetch metadata for newly uploaded / discovered documents ---

  /** Single upload: auto-fetch metadata if the document has no existing metadata */
  autoFetchOnUpload$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(DocumentsActions.uploadDocumentSuccess),
        mergeMap(({ document }) => {
          if (!document.metadata?.openLibraryKey) {
            // Small delay to avoid overwhelming the Open Library API
            return of(
              DocumentsActions.fetchMetadataFromOpenLibrary({
                id: document.id,
                title: document.metadata?.title || document.title,
              })
            ).pipe(delay(500));
          }
          return of({ type: 'NO_ACTION' as const });
        })
      )
  );

  /** Bulk upload: auto-fetch metadata for each document without existing metadata */
  autoFetchOnBulkUpload$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(DocumentsActions.uploadDocumentsSuccess),
        mergeMap(({ documents }) => {
          const docsNeedingMetadata = documents.filter((d) => !d.metadata?.openLibraryKey);
          if (docsNeedingMetadata.length === 0) return of({ type: 'NO_ACTION' as const });
          return from(docsNeedingMetadata).pipe(
            // Stagger requests to avoid rate-limiting (1 second between each)
            mergeMap((doc, index) =>
              of(
                DocumentsActions.fetchMetadataFromOpenLibrary({
                  id: doc.id,
                  title: doc.metadata?.title || doc.title,
                })
              ).pipe(delay(index * 1000))
            )
          );
        })
      )
  );

  /** Library source scan: auto-fetch metadata for each newly imported document */
  autoFetchOnScan$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(LibrarySourcesActions.scanSourceSuccess),
        mergeMap(({ importedDocs }) => {
          if (!importedDocs || importedDocs.length === 0) return of({ type: 'NO_ACTION' as const });
          return from(importedDocs).pipe(
            mergeMap((doc, index) =>
              of(
                DocumentsActions.fetchMetadataFromOpenLibrary({
                  id: doc.id,
                  title: doc.title,
                })
              ).pipe(delay(index * 1000))
            )
          );
        })
      )
  );

  /**
   * Clean a raw document title (often derived from a filename) into a better
   * search query for Open Library.
   *
   * Examples:
   *   "Harry Potter 4 - Harry Potter and the Goblet of Fire - J. K. Rowling & Mary Grandpre"
   *     → "Harry Potter and the Goblet of Fire"
   *   "7th Circle -- Tate James" → "7th Circle"
   *   "The_Great_Gatsby.epub" → "The Great Gatsby"
   */
  private cleanSearchTitle(raw: string): string {
    let title = raw;

    // 1. Remove common file extensions
    title = title.replace(/\.(epub|pdf|mobi|azw3?|fb2|djvu|cbr|cbz)$/i, '');

    // 2. Replace underscores and dots (used as spaces in filenames) with spaces
    title = title.replace(/[_.]/g, ' ');

    // 3. Split on common delimiters: ` - `, ` -- `, ` — `, ` – `, or multiple hyphens
    const segments = title.split(/\s+[-–—]{1,3}\s+/);

    if (segments.length > 1) {
      // Filter out segments that look like author names:
      //   - contains & (multiple authors)
      //   - starts with "by "
      //   - is only 2–4 capitalized words (looks like "Firstname Lastname" / "J. K. Rowling")
      const candidates = segments.filter((s) => {
        const trimmed = s.trim();
        if (/&/.test(trimmed)) return false;
        if (/^\s*by\s+/i.test(trimmed)) return false;
        // Match author-like patterns: 2-4 words that are all capitalized / initials
        // e.g. "Tate James", "J. K. Rowling", "Mary Grandpre"
        if (/^([A-Z][a-zA-Z]*\.?\s*){2,4}$/.test(trimmed) && trimmed.split(/\s+/).length <= 4) {
          return false;
        }
        return true;
      });
      // If all segments were filtered out, use original segments
      const pool = candidates.length > 0 ? candidates : segments;
      // Pick the longest segment — usually the actual title
      title = pool.reduce((a, b) => (a.length >= b.length ? a : b), '');
    }

    // 4. Remove series/volume markers like "Book 4", "Vol. 2", "#3"
    title = title.replace(/\b(book|vol\.?|volume|part|#)\s*\d+\b/gi, '');
    // Remove standalone numbers at the start or end (e.g. "4" in "Harry Potter 4")
    title = title.replace(/^\d+\s+|\s+\d+$/g, '');

    // 5. Remove parenthetical content, e.g. "(Illustrated Edition)"
    title = title.replace(/\(.*?\)/g, '');

    // 6. Remove square brackets, e.g. "[Kindle Edition]"
    title = title.replace(/\[.*?\]/g, '');

    // 7. Remove curly braces content
    title = title.replace(/\{.*?\}/g, '');

    // 8. Collapse whitespace and trim
    title = title.replace(/\s+/g, ' ').trim();

    // If cleaning reduced it to nothing, fall back to the original
    return title || raw.trim();
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsText(file);
    });
  }
}
