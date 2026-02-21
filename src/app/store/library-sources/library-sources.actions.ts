import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { LibrarySource } from '../../core/models/library-source.model';

export const LibrarySourcesActions = createActionGroup({
  source: 'LibrarySources',
  events: {
    // Load
    'Load Sources': emptyProps(),
    'Load Sources Success': props<{ sources: LibrarySource[] }>(),
    'Load Sources Failure': props<{ error: string }>(),

    // Create
    'Create Source': props<{
      name: string;
      paths: string[];
      pollingEnabled?: boolean;
      pollingIntervalSeconds?: number;
    }>(),
    'Create Source Success': props<{ source: LibrarySource }>(),
    'Create Source Failure': props<{ error: string }>(),

    // Update
    'Update Source': props<{
      id: string;
      changes: Partial<{
        name: string;
        paths: string[];
        pollingEnabled: boolean;
        pollingIntervalSeconds: number;
      }>;
    }>(),
    'Update Source Success': props<{ source: LibrarySource }>(),
    'Update Source Failure': props<{ error: string }>(),

    // Delete
    'Delete Source': props<{ id: string }>(),
    'Delete Source Success': props<{ id: string }>(),
    'Delete Source Failure': props<{ error: string }>(),

    // Scan
    'Scan Source': props<{ id: string }>(),
    'Scan Source Success': props<{
      source: LibrarySource;
      importedCount: number;
      importedDocs: { id: string; title: string }[];
    }>(),
    'Scan Source Failure': props<{ id: string; error: string }>(),
  },
});
