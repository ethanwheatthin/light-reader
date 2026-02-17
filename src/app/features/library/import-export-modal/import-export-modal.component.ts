import { Component, inject, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import { Subscription } from 'rxjs';
import { DocumentsActions } from '../../../store/documents/documents.actions';
import { AutoBackupService } from '../../../core/services/auto-backup.service';

@Component({
  selector: 'app-import-export-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './import-export-modal.component.html',
  styleUrls: ['./import-export-modal.component.css'],
})
export class ImportExportModalComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private actions$ = inject(Actions);
  private dialogRef = inject(MatDialogRef<ImportExportModalComponent>);
  private cdr = inject(ChangeDetectorRef);
  private autoBackupService = inject(AutoBackupService);

  private actionsSub: Subscription | null = null;

  busy = false;
  message: string | null = null;
  selectedFile: File | null = null;

  /** Auto-backups are now handled server-side */
  autoBackups: any[] = [];
  loadingBackups = false;

  constructor() {
    // Listen for success/failure actions to update UI and schedule visual updates
    this.actionsSub = this.actions$
      .pipe(
        ofType(
          DocumentsActions.exportMetadataSuccess,
          DocumentsActions.exportMetadataFailure,
          DocumentsActions.backupLibrarySuccess,
          DocumentsActions.backupLibraryFailure,
          DocumentsActions.restoreLibrarySuccess,
          DocumentsActions.restoreLibraryFailure
        )
      )
      .subscribe((action: any) => {
        // Schedule updates in the next macrotask to avoid ExpressionChangedAfterItHasBeenCheckedError
        setTimeout(() => {
          this.busy = false;
          if (action.type === DocumentsActions.exportMetadataSuccess.type) {
            this.message = `Exported metadata: ${action.fileName}`;
          } else if (action.type === DocumentsActions.backupLibrarySuccess.type) {
            this.message = `Backup saved: ${action.fileName}`;
          } else if (action.type === DocumentsActions.restoreLibrarySuccess.type) {
            this.message = 'Restore completed successfully.';
          } else if (
            action.type === DocumentsActions.exportMetadataFailure.type ||
            action.type === DocumentsActions.backupLibraryFailure.type ||
            action.type === DocumentsActions.restoreLibraryFailure.type
          ) {
            this.message = `Operation failed: ${action.error}`;
          }
          // Ensure change detection picks up the update
          try {
            this.cdr.markForCheck();
          } catch {}
        }, 0);
      });
  }

  ngOnInit(): void {
    this.loadAutoBackups();
  }

  ngOnDestroy(): void {
    this.actionsSub?.unsubscribe();
  }

  // ── Manual export / backup / restore ──

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
    if (
      !confirm(
        'Are you sure you want to restore the library from this backup? This will overwrite existing items with the same IDs.'
      )
    )
      return;
    this.busy = true;
    this.message = null;
    this.store.dispatch(DocumentsActions.restoreLibrary({ file: this.selectedFile }));
  }

  // ── Auto-backup management ──

  async loadAutoBackups(): Promise<void> {
    // Auto-backups are now handled server-side; this section is simplified
    this.loadingBackups = false;
    this.autoBackups = [];
    this.cdr.markForCheck();
  }

  async createBackupNow(): Promise<void> {
    this.busy = true;
    this.message = null;
    await this.autoBackupService.runBackup();
    this.busy = false;
    this.message = 'Server backup triggered successfully.';
    this.cdr.markForCheck();
  }

  async downloadAutoBackup(_id: string): Promise<void> {
    // Now handled via the backup library action
    this.store.dispatch(DocumentsActions.backupLibrary());
  }

  async restoreAutoBackup(_id: string): Promise<void> {
    // Auto-backups are server-side; direct restore not available from UI
    this.message = 'Please use "Restore from file" with a backup JSON file.';
    this.cdr.markForCheck();
  }

  async deleteAutoBackup(_id: string): Promise<void> {
    // Auto-backups are managed server-side
    this.message = 'Auto-backups are managed by the server.';
    this.cdr.markForCheck();
  }

  // ── Helpers ──

  formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString();
  }

  timeAgo(iso: string): string {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffMs = now - then;
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return 'Saved less than 1 minute ago';
    const minutes = Math.floor(seconds / 60);
    if (minutes === 1) return 'Saved 1 minute ago';
    if (minutes < 60) return `Saved ${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return 'Saved 1 hour ago';
    if (hours < 24) return `Saved ${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Saved 1 day ago';
    return `Saved ${days} days ago`;
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  close(): void {
    this.dialogRef.close();
  }
}
