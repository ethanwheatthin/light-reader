import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { Document, Bookmark, ReadingSession, ReadingGoal, BookMetadata } from '../../core/models/document.model';

export const DocumentsActions = createActionGroup({
  source: 'Documents',
  events: {
    // Single upload
    'Upload Document': props<{ file: File }>(),
    'Upload Document Success': props<{ document: Document }>(),
    'Upload Document Failure': props<{ error: string }>(),

    // Bulk upload
    'Upload Documents': props<{ files: File[] }>(),
    'Upload Documents Success': props<{ documents: Document[] }>(),
    'Upload Documents Failure': props<{ error: string }>(),

    'Load Documents': emptyProps(),
    'Load Documents Success': props<{ documents: Document[] }>(),
    'Delete Document': props<{ id: string }>(),
    'Delete Document Success': props<{ id: string }>(),
    'Open Document': props<{ id: string }>(),
    'Update Reading Progress': props<{ id: string; page: number; cfi?: string; progressPercent?: number }>(),

    // Bookmark actions
    'Add Bookmark': props<{ id: string; bookmark: Bookmark }>(),
    'Remove Bookmark': props<{ id: string; bookmarkId: string }>(),
    'Update Bookmark': props<{ id: string; bookmarkId: string; note: string }>(),

    // Reading session tracking
    'Start Reading Session': props<{ id: string }>(),
    'End Reading Session': props<{ id: string; session: ReadingSession }>(),

    // Reading goals
    'Set Reading Goal': props<{ id: string; goal: ReadingGoal }>(),
    'Update Reading Streak': props<{ id: string }>(),

    // Metadata actions
    'Update Book Metadata': props<{ id: string; metadata: BookMetadata }>(),
    'Fetch Metadata From Open Library': props<{ id: string; title: string }>(),
    'Fetch Metadata Success': props<{ id: string; metadata: BookMetadata }>(),

    // Import / Export / Backup
    'Export Metadata': emptyProps(),
    'Export Metadata Success': props<{ fileName: string }>(),
    'Export Metadata Failure': props<{ error: string }>(),

    'Backup Library': emptyProps(),
    'Backup Library Success': props<{ fileName: string }>(),
    'Backup Library Failure': props<{ error: string }>(),

    'Restore Library': props<{ file: File }>(),
    'Restore Library Success': emptyProps(),
    'Restore Library Failure': props<{ error: string }>(),
  }
});
