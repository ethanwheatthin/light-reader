import { Injectable, inject } from '@angular/core';
import localforage from 'localforage';
import { Document } from '../models/document.model';
import { Shelf } from '../models/shelf.model';
import { ShelfService } from './shelf.service';

@Injectable({ providedIn: 'root' })
export class IndexDBService {
  private filesStore = localforage.createInstance({
    name: 'epub-pdf-reader',
    storeName: 'documents'
  });

  private metadataStore = localforage.createInstance({
    name: 'epub-pdf-reader',
    storeName: 'metadata'
  });

  // Inject shelf service for exporting/importing shelves
  private shelfService = inject(ShelfService);

  async saveFile(id: string, blob: Blob): Promise<void> {
    await this.filesStore.setItem(id, blob);
  }

  async getFile(id: string): Promise<Blob | null> {
    return await this.filesStore.getItem<Blob>(id);
  }

  async deleteFile(id: string): Promise<void> {
    await this.filesStore.removeItem(id);
    await this.metadataStore.removeItem(id);
  }

  async getAllFileIds(): Promise<string[]> {
    return await this.filesStore.keys();
  }

  async saveMetadata(document: Document): Promise<void> {
    await this.metadataStore.setItem(document.id, document);
  }

  async getMetadata(id: string): Promise<Document | null> {
    return await this.metadataStore.getItem<Document>(id);
  }

  async getAllMetadata(): Promise<Document[]> {
    const keys = await this.metadataStore.keys();
    const metadata: Document[] = [];
    
    for (const key of keys) {
      const doc = await this.metadataStore.getItem<Document>(key);
      if (doc) {
        metadata.push(doc);
      }
    }
    
    return metadata;
  }

  /**
   * Export the entire library (metadata + files + shelves) into a single JSON blob
   * where files are stored as data URLs (base64). This is used for backup/restore.
   */
  async exportLibrary(): Promise<Blob> {
    const metadata = await this.getAllMetadata();
    const files: Array<{ id: string; name?: string; type?: string; data: string }> = [];

    for (const doc of metadata) {
      const blob = await this.getFile(doc.id);
      if (blob) {
        const data = await this.blobToDataUrl(blob);
        files.push({ id: doc.id, name: doc.title, type: blob.type || '', data });
      }
    }

    // include shelves in backups
    const shelves: Shelf[] = await this.shelfService.getAllShelves();

    const payload = { exportedAt: new Date().toISOString(), metadata, files, shelves };
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  }

  /**
   * Import a library backup payload produced by exportLibrary(). This will save
   * files, metadata and shelves into the stores. It overwrites existing items with the
   * same IDs and performs basic reconciliation to ensure documents and shelves
   * remain consistent (documents referenced by a shelf will have their `shelfId` set).
   */
  async importLibrary(payload: any): Promise<void> {
    const { metadata = [], files = [], shelves = [] } = payload;

    for (const f of files) {
      const blob = this.dataUrlToBlob(f.data, f.type || '');
      await this.saveFile(f.id, blob);
    }

    // Save metadata first
    for (const doc of metadata) {
      await this.saveMetadata(doc as Document);
    }

    // Import shelves
    for (const s of shelves) {
      await this.shelfService.saveShelf(s as Shelf);
    }

    // Reconcile: ensure that any document listed in a shelf has its metadata.shelfId set
    const shelfIds = new Set<string>(shelves.map((s: any) => s.id));

    for (const s of shelves) {
      if (!s?.documentIds || !Array.isArray(s.documentIds)) continue;
      for (const documentId of s.documentIds) {
        const doc = await this.getMetadata(documentId);
        if (doc) {
          doc.shelfId = s.id;
          await this.saveMetadata(doc);
        }
      }
    }

    // Also clear invalid shelfIds on documents that reference missing shelves
    const allDocs = await this.getAllMetadata();
    for (const doc of allDocs) {
      if (doc.shelfId && !shelfIds.has(doc.shelfId)) {
        doc.shelfId = null;
        await this.saveMetadata(doc);
      }
    }
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(blob);
    });
  }

  private dataUrlToBlob(dataUrl: string, defaultType = ''): Blob {
    // data:[<mediatype>][;base64],<data>
    const parts = dataUrl.split(',');
    const meta = parts[0] || '';
    const base64 = parts[1] || parts[0] || '';
    const mimeMatch = meta.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : defaultType;
    const byteString = atob(base64);
    const ia = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    return new Blob([ia], { type: mime });
  }
}
