import { createFeature, createReducer, on } from '@ngrx/store';
import { createEntityAdapter, EntityAdapter, EntityState } from '@ngrx/entity';
import { Document } from '../../core/models/document.model';
import { DocumentsActions } from './documents.actions';
import { ShelvesActions } from '../shelves/shelves.actions';

export interface DocumentsState extends EntityState<Document> {
  selectedDocumentId: string | null;
  loading: boolean;
  error: string | null;
}

export const adapter: EntityAdapter<Document> = createEntityAdapter<Document>();

export const initialState: DocumentsState = adapter.getInitialState({
  selectedDocumentId: null,
  loading: false,
  error: null
});

export const documentsFeature = createFeature({
  name: 'documents',
  reducer: createReducer(
    initialState,
    on(DocumentsActions.uploadDocument, (state) => ({
      ...state,
      loading: true,
      error: null
    })),
    on(DocumentsActions.uploadDocumentSuccess, (state, { document }) =>
      adapter.addOne(document, { ...state, loading: false })
    ),
    on(DocumentsActions.uploadDocumentFailure, (state, { error }) => ({
      ...state,
      loading: false,
      error
    })),

    // Bulk upload handlers
    on(DocumentsActions.uploadDocuments, (state) => ({ ...state, loading: true, error: null })),
    on(DocumentsActions.uploadDocumentsSuccess, (state, { documents }) =>
      adapter.addMany(documents, { ...state, loading: false })
    ),
    on(DocumentsActions.uploadDocumentsFailure, (state, { error }) => ({ ...state, loading: false, error })),
    on(DocumentsActions.loadDocuments, (state) => ({
      ...state,
      loading: true
    })),
    on(DocumentsActions.loadDocumentsSuccess, (state, { documents }) =>
      adapter.setAll(documents, { ...state, loading: false })
    ),
    on(DocumentsActions.deleteDocumentSuccess, (state, { id }) =>
      adapter.removeOne(id, state)
    ),
    on(DocumentsActions.openDocument, (state, { id }) => ({
      ...state,
      selectedDocumentId: id
    })),
    on(DocumentsActions.updateReadingProgress, (state, { id, page, cfi, progressPercent }) =>
      adapter.updateOne(
        {
          id,
          changes: {
            currentPage: page,
            lastOpened: new Date(),
            ...(cfi ? { currentCfi: cfi } : {}),
            ...(progressPercent != null ? { readingProgressPercent: progressPercent } : {}),
          },
        },
        state
      )
    ),

    // --- Bookmark reducers ---
    on(DocumentsActions.addBookmark, (state, { id, bookmark }) => {
      const entity = state.entities[id];
      if (!entity) return state;
      return adapter.updateOne(
        { id, changes: { bookmarks: [...entity.bookmarks, bookmark] } },
        state
      );
    }),
    on(DocumentsActions.removeBookmark, (state, { id, bookmarkId }) => {
      const entity = state.entities[id];
      if (!entity) return state;
      return adapter.updateOne(
        { id, changes: { bookmarks: entity.bookmarks.filter(b => b.id !== bookmarkId) } },
        state
      );
    }),
    on(DocumentsActions.updateBookmark, (state, { id, bookmarkId, note }) => {
      const entity = state.entities[id];
      if (!entity) return state;
      return adapter.updateOne(
        {
          id,
          changes: {
            bookmarks: entity.bookmarks.map(b =>
              b.id === bookmarkId ? { ...b, note } : b
            ),
          },
        },
        state
      );
    }),

    // --- Reading session reducers ---
    on(DocumentsActions.endReadingSession, (state, { id, session }) => {
      const entity = state.entities[id];
      if (!entity) return state;
      const stats = entity.readingStats;
      const sessions = [...stats.sessions, session].slice(-30); // keep last 30
      return adapter.updateOne(
        {
          id,
          changes: {
            readingStats: {
              ...stats,
              totalReadingTime: stats.totalReadingTime + session.duration,
              sessions,
              firstOpenedAt: stats.firstOpenedAt ?? session.startedAt,
            },
          },
        },
        state
      );
    }),

    // --- Reading goal reducers ---
    on(DocumentsActions.setReadingGoal, (state, { id, goal }) => {
      const entity = state.entities[id];
      if (!entity) return state;
      return adapter.updateOne({ id, changes: { readingGoal: goal } }, state);
    }),
    on(DocumentsActions.updateReadingStreak, (state, { id }) => {
      const entity = state.entities[id];
      if (!entity || !entity.readingGoal) return state;
      const today = new Date().toISOString().slice(0, 10);
      const goal = entity.readingGoal;
      if (goal.completedDays.includes(today)) return state;

      // Check if yesterday was completed for streak
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const hadYesterday = goal.completedDays.includes(yesterday);

      return adapter.updateOne(
        {
          id,
          changes: {
            readingGoal: {
              ...goal,
              completedDays: [...goal.completedDays, today].slice(-90), // keep 90 days
              currentStreak: hadYesterday ? goal.currentStreak + 1 : 1,
            },
          },
        },
        state
      );
    }),

    // --- Metadata reducers ---
    on(DocumentsActions.updateBookMetadata, (state, { id, metadata }) => {
      const entity = state.entities[id];
      if (!entity) return state;
      // If the user provided a title in metadata, update the document title as well so
      // the library list and other UI reflect the change immediately.
      const changes: any = { metadata: { ...entity.metadata, ...metadata } };
      if (metadata.title) changes.title = metadata.title;
      return adapter.updateOne(
        { 
          id, 
          changes
        },
        state
      );
    }),
    on(DocumentsActions.fetchMetadataSuccess, (state, { id, metadata }) => {
      const entity = state.entities[id];
      if (!entity) return state;
      return adapter.updateOne(
        { 
          id, 
          changes: { 
            metadata: { ...entity.metadata, ...metadata },
            // Update title if not manually set
            title: metadata.title || entity.title
          } 
        },
        state
      );
    }),

    // --- Shelf integration ---
    on(ShelvesActions.moveDocumentToShelf, (state, { documentId, toShelfId }) => {
      const entity = state.entities[documentId];
      if (!entity) return state;
      return adapter.updateOne(
        { id: documentId, changes: { shelfId: toShelfId } },
        state
      );
    })
  )
});
