import { Component, inject, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import { Subscription } from 'rxjs';
import { DocumentsActions } from '../../../store/documents/documents.actions';

@Component({
  selector: 'app-import-export-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './import-export-modal.component.html',
  styleUrls: ['./import-export-modal.component.css']
})
export class ImportExportModalComponent implements OnDestroy {
  private store = inject(Store);
  private actions$ = inject(Actions);
  private dialogRef = inject(MatDialogRef<ImportExportModalComponent>);
  private cdr = inject(ChangeDetectorRef);

  private actionsSub: Subscription | null = null;

  busy = false;
  message: string | null = null;
  selectedFile: File | null = null;

  constructor() {
    // Listen for success/failure actions to update UI and schedule visual updates
    this.actionsSub = this.actions$.pipe(ofType(
      DocumentsActions.exportMetadataSuccess,
      DocumentsActions.exportMetadataFailure,
      DocumentsActions.backupLibrarySuccess,
      DocumentsActions.backupLibraryFailure,
      DocumentsActions.restoreLibrarySuccess,
      DocumentsActions.restoreLibraryFailure
    )).subscribe((action: any) => {
      // Schedule updates in the next macrotask to avoid ExpressionChangedAfterItHasBeenCheckedError
      setTimeout(() => {
        this.busy = false;
        if (action.type === DocumentsActions.exportMetadataSuccess.type) {
          this.message = `Exported metadata: ${action.fileName}`;
        } else if (action.type === DocumentsActions.backupLibrarySuccess.type) {
          this.message = `Backup saved: ${action.fileName}`;
        } else if (action.type === DocumentsActions.restoreLibrarySuccess.type) {
          this.message = 'Restore completed successfully.';
        } else if (action.type === DocumentsActions.exportMetadataFailure.type ||
                   action.type === DocumentsActions.backupLibraryFailure.type ||
                   action.type === DocumentsActions.restoreLibraryFailure.type) {
          this.message = `Operation failed: ${action.error}`;
        }
        // Ensure change detection picks up the update
        try { this.cdr.markForCheck(); } catch {}
      }, 0);
    });
  }

  ngOnDestroy(): void {
    this.actionsSub?.unsubscribe();
  }

  exportMetadata(): void {
    this.busy = true;
    this.message = null;
    this.store.dispatch(DocumentsActions.exportMetadata());
  }

  backupLibrary(): void {
    this.busy = true;
    this.message = null;
    this.store.dispatch(DocumentsActions.backupLibrary());
  }

  onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] || null;
    this.selectedFile = file;
    this.message = null;
  }

  restoreFromFile(): void {
    if (!this.selectedFile) return;
    if (!confirm('Are you sure you want to restore the library from this backup? This will overwrite existing items with the same IDs.')) return;
    this.busy = true;
    this.message = null;
    this.store.dispatch(DocumentsActions.restoreLibrary({ file: this.selectedFile }));
  }

  close(): void {
    this.dialogRef.close();
  }
}
