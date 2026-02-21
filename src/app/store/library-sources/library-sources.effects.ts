import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { map, mergeMap, catchError, switchMap, tap } from 'rxjs/operators';
import { of } from 'rxjs';
import { LibrarySourcesActions } from './library-sources.actions';
import { LibrarySourceApiService } from '../../core/services/library-source-api.service';
import { DocumentsActions } from '../documents/documents.actions';

@Injectable()
export class LibrarySourcesEffects {
  private actions$ = inject(Actions);
  private api = inject(LibrarySourceApiService);

  loadSources$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LibrarySourcesActions.loadSources),
      switchMap(() =>
        this.api.getAll().pipe(
          map((sources) => LibrarySourcesActions.loadSourcesSuccess({ sources })),
          catchError((error) =>
            of(LibrarySourcesActions.loadSourcesFailure({ error: error?.message || String(error) }))
          )
        )
      )
    )
  );

  createSource$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LibrarySourcesActions.createSource),
      mergeMap(({ name, paths, pollingEnabled, pollingIntervalSeconds }) =>
        this.api.create({ name, paths, pollingEnabled, pollingIntervalSeconds }).pipe(
          map((source) => LibrarySourcesActions.createSourceSuccess({ source })),
          catchError((error) =>
            of(LibrarySourcesActions.createSourceFailure({ error: error?.message || String(error) }))
          )
        )
      )
    )
  );

  updateSource$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LibrarySourcesActions.updateSource),
      mergeMap(({ id, changes }) =>
        this.api.update(id, changes).pipe(
          map((source) => LibrarySourcesActions.updateSourceSuccess({ source })),
          catchError((error) =>
            of(LibrarySourcesActions.updateSourceFailure({ error: error?.message || String(error) }))
          )
        )
      )
    )
  );

  deleteSource$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LibrarySourcesActions.deleteSource),
      mergeMap(({ id }) =>
        this.api.delete(id).pipe(
          map(() => LibrarySourcesActions.deleteSourceSuccess({ id })),
          catchError((error) =>
            of(LibrarySourcesActions.deleteSourceFailure({ error: error?.message || String(error) }))
          )
        )
      )
    )
  );

  scanSource$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LibrarySourcesActions.scanSource),
      mergeMap(({ id }) =>
        this.api.scan(id).pipe(
          switchMap((result) => [
            LibrarySourcesActions.scanSourceSuccess({
              source: result.source,
              importedCount: result.imported.length,
              importedDocs: result.imported.map((d) => ({ id: d.id, title: d.title })),
            }),
            // Reload documents so newly imported files appear in the library
            ...(result.imported.length > 0 ? [DocumentsActions.loadDocuments()] : []),
          ]),
          catchError((error) =>
            of(
              LibrarySourcesActions.scanSourceFailure({
                id,
                error: error?.message || String(error),
              })
            )
          )
        )
      )
    )
  );
}
