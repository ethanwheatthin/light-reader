import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import localforage from 'localforage';
import { Document } from '../models/document.model';
import { Shelf } from '../models/shelf.model';
import { environment } from '../../../environments/environment';

export interface MigrationProgress {
  phase: 'reading' | 'uploading' | 'done' | 'error';
  current: number;
  total: number;
  message: string;
}

/**
 * One-time migration service that reads all data from the old localforage
 * (IndexedDB) stores and uploads it to the new PostgreSQL backend via the
 * /api/backup/restore endpoint.
 *
 * Usage from the browser console or a migration UI component:
 *   const svc = inject(MigrationService);
 *   await svc.migrate();
 */
@Injectable({ providedIn: 'root' })
export class MigrationService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  /** IndexedDB stores (same config as the old services) */
  private filesStore = localforage.createInstance({
    name: 'epub-pdf-reader',
    storeName: 'documents',
  });

  private metadataStore = localforage.createInstance({
    name: 'epub-pdf-reader',
    storeName: 'metadata',
  });

  private shelvesStore = localforage.createInstance({
    name: 'epub-pdf-reader',
    storeName: 'shelves',
  });

  /** Subscribe to get live progress updates */
  private _onProgress: ((p: MigrationProgress) => void) | null = null;

  onProgress(callback: (p: MigrationProgress) => void): void {
    this._onProgress = callback;
  }

  private report(p: MigrationProgress): void {
    this._onProgress?.(p);
    console.log(`[Migration] ${p.phase} — ${p.message} (${p.current}/${p.total})`);
  }

  /**
   * Run the full migration.
   * Returns true if successful, false otherwise.
   */
  async migrate(): Promise<boolean> {
    try {
      // ── Phase 1: Read all metadata ──
      this.report({ phase: 'reading', current: 0, total: 0, message: 'Reading metadata keys...' });
      const metaKeys = await this.metadataStore.keys();
      const metadata: Document[] = [];

      for (let i = 0; i < metaKeys.length; i++) {
        const doc = await this.metadataStore.getItem<Document>(metaKeys[i]);
        if (doc) metadata.push(doc);
        this.report({
          phase: 'reading',
          current: i + 1,
          total: metaKeys.length,
          message: `Read metadata ${i + 1}/${metaKeys.length}`,
        });
      }

      // ── Phase 2: Read all shelves ──
      this.report({ phase: 'reading', current: 0, total: 0, message: 'Reading shelves...' });
      const shelfKeys = await this.shelvesStore.keys();
      const shelves: Shelf[] = [];

      for (const key of shelfKeys) {
        const shelf = await this.shelvesStore.getItem<Shelf>(key);
        if (shelf) shelves.push(shelf);
      }
      this.report({
        phase: 'reading',
        current: shelfKeys.length,
        total: shelfKeys.length,
        message: `Read ${shelves.length} shelves`,
      });

      // ── Phase 3: Read all file blobs and convert to data URLs ──
      this.report({ phase: 'reading', current: 0, total: metadata.length, message: 'Reading files...' });
      const files: Array<{ id: string; name: string; type: string; data: string }> = [];

      for (let i = 0; i < metadata.length; i++) {
        const doc = metadata[i];
        const blob = await this.filesStore.getItem<Blob>(doc.id);
        if (blob) {
          const dataUrl = await this.blobToDataUrl(blob);
          files.push({
            id: doc.id,
            name: doc.title,
            type: blob.type || '',
            data: dataUrl,
          });
        }
        this.report({
          phase: 'reading',
          current: i + 1,
          total: metadata.length,
          message: `Read file ${i + 1}/${metadata.length}: ${doc.title}`,
        });
      }

      // ── Phase 4: Upload to backend ──
      this.report({
        phase: 'uploading',
        current: 0,
        total: 1,
        message: `Uploading ${metadata.length} documents, ${shelves.length} shelves, ${files.length} files...`,
      });

      const payload = {
        exportedAt: new Date().toISOString(),
        metadata,
        files,
        shelves,
      };

      await firstValueFrom(
        this.http.post<{ message: string }>(`${this.apiUrl}/api/backup/restore`, payload)
      );

      this.report({
        phase: 'done',
        current: 1,
        total: 1,
        message: `Migration complete! ${metadata.length} documents, ${shelves.length} shelves migrated.`,
      });

      return true;
    } catch (err: any) {
      this.report({
        phase: 'error',
        current: 0,
        total: 0,
        message: `Migration failed: ${err?.message || err}`,
      });
      console.error('[Migration] Error:', err);
      return false;
    }
  }

  /**
   * Check whether the old IndexedDB stores contain any data worth migrating.
   */
  async hasLocalData(): Promise<boolean> {
    const keys = await this.metadataStore.keys();
    return keys.length > 0;
  }

  /**
   * Optionally clear old IndexedDB data after successful migration.
   */
  async clearLocalData(): Promise<void> {
    await this.filesStore.clear();
    await this.metadataStore.clear();
    await this.shelvesStore.clear();
    console.log('[Migration] All local IndexedDB stores cleared.');
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(blob);
    });
  }
}
