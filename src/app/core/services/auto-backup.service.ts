import { Injectable, inject, OnDestroy } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BackupApiService } from './backup-api.service';

/** How often to auto-backup (ms) — 5 minutes */
const BACKUP_INTERVAL_MS = 5 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class AutoBackupService implements OnDestroy {
  private backupApi = inject(BackupApiService);
  private timerId: ReturnType<typeof setInterval> | null = null;

  /** Start the periodic auto-backup timer */
  start(): void {
    if (this.timerId) return; // already running
    // Run the first backup after the interval, not immediately on app start
    this.timerId = setInterval(() => this.runBackup(), BACKUP_INTERVAL_MS);
  }

  /** Stop the periodic auto-backup timer */
  stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }

  /** Manually trigger a backup via the backend API */
  async runBackup(): Promise<void> {
    try {
      const blob = await firstValueFrom(this.backupApi.backupLibrary());
      // The backend handles the backup — we just confirm it succeeded
      console.log('[AutoBackup] Backup completed successfully, size:', blob.size);
    } catch (err) {
      console.error('[AutoBackup] Backup failed:', err);
    }
  }
}
