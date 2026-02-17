import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { of, from, mergeMap } from 'rxjs';
import { map, catchError, switchMap, withLatestFrom, tap } from 'rxjs/operators';
import { ShelvesActions } from './shelves.actions';
import { DocumentsActions } from '../documents/documents.actions';
import { ShelfApiService } from '../../core/services/shelf-api.service';
import { DocumentApiService } from '../../core/services/document-api.service';
import { Shelf } from '../../core/models/shelf.model';
import { selectAllShelves } from './shelves.selectors';

@Injectable()
export class ShelvesEffects {
  private actions$ = inject(Actions);
  private shelfApi = inject(ShelfApiService);
  private documentApi = inject(DocumentApiService);
  private store = inject(Store);

  loadShelves$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ShelvesActions.loadShelves),
      switchMap(() =>
        this.shelfApi.getAllShelves().pipe(
          map((shelves) => ShelvesActions.loadShelvesSuccess({ shelves })),
          catchError((error) =>
            of(ShelvesActions.loadShelvesFailure({ error: error?.message || String(error) }))
          )
        )
      )
    )
  );

  createShelf$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ShelvesActions.createShelf),
      switchMap((action) =>
        this.shelfApi.createShelf({ name: action.name, color: action.color }).pipe(
          map((shelf) => ShelvesActions.createShelfSuccess({ shelf })),
          catchError((error) =>
            of(ShelvesActions.createShelfFailure({ error: error?.message || String(error) }))
          )
        )
      )
    )
  );

  updateShelf$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ShelvesActions.updateShelf),
      switchMap((action) =>
        this.shelfApi.updateShelf(action.id, action.changes).pipe(
          map((shelf) => ShelvesActions.updateShelfSuccess({ shelf })),
          catchError((error) =>
            of(ShelvesActions.updateShelfFailure({ error: error?.message || String(error) }))
          )
        )
      )
    )
  );

  deleteShelf$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ShelvesActions.deleteShelf),
      switchMap((action) =>
        this.shelfApi.getShelf(action.id).pipe(
          switchMap((shelf) => {
            const documentIds = shelf.documentIds || [];
            return this.shelfApi.deleteShelf(action.id).pipe(
              mergeMap(() => {
                // Return array of actions to dispatch
                const actions: any[] = [ShelvesActions.deleteShelfSuccess({ id: action.id })];
                // Move each document to unshelved in the store
                for (const documentId of documentIds) {
                  actions.push(
                    ShelvesActions.moveDocumentToShelf({
                      documentId,
                      fromShelfId: action.id,
                      toShelfId: null,
                    })
                  );
                }
                return from(actions);
              })
            );
          }),
          catchError((error) =>
            of(ShelvesActions.deleteShelfFailure({ error: error?.message || String(error) }))
          )
        )
      )
    )
  );

  moveDocumentToShelf$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ShelvesActions.moveDocumentToShelf),
      switchMap((action) => {
        const actions = [];

        // Remove from old shelf
        if (action.fromShelfId) {
          actions.push(
            ShelvesActions.removeDocumentFromShelf({
              shelfId: action.fromShelfId,
              documentId: action.documentId,
            })
          );
        }

        // Add to new shelf
        if (action.toShelfId) {
          actions.push(
            ShelvesActions.addDocumentToShelf({
              shelfId: action.toShelfId,
              documentId: action.documentId,
            })
          );
        }

        return actions;
      })
    )
  );

  persistShelfChanges$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ShelvesActions.addDocumentToShelf, ShelvesActions.removeDocumentFromShelf),
        withLatestFrom(this.store.select(selectAllShelves)),
        tap(([action, shelves]) => {
          // The backend handles shelf-document relationships via document.shelfId
          // No additional persistence needed here since moveDocumentToShelf
          // also triggers persistDocumentShelfId$
        })
      ),
    { dispatch: false }
  );

  persistDocumentShelfId$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ShelvesActions.moveDocumentToShelf),
        mergeMap((action) =>
          this.documentApi
            .updateDocument(action.documentId, { shelfId: action.toShelfId } as any)
            .pipe(catchError(() => of(null)))
        )
      ),
    { dispatch: false }
  );
}
