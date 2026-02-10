import { Injectable } from '@angular/core';
import localforage from 'localforage';
import { Document } from '../models/document.model';

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
   * Export the entire library (metadata + files) into a single JSON blob
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

    const payload = { exportedAt: new Date().toISOString(), metadata, files };
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  }

  /**
   * Import a library backup payload produced by exportLibrary(). This will save
   * files and metadata into the stores. It overwrites existing items with the
   * same IDs.
   */
  async importLibrary(payload: any): Promise<void> {
    const { metadata = [], files = [] } = payload;

    for (const f of files) {
      const blob = this.dataUrlToBlob(f.data, f.type || '');
      await this.saveFile(f.id, blob);
    }

    for (const doc of metadata) {
      await this.saveMetadata(doc as Document);
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
