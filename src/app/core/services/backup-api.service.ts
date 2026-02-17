import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class BackupApiService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  /** Export all metadata as JSON (triggers download) */
  exportMetadata(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/api/export/metadata`, {
      responseType: 'blob',
    });
  }

  /** Create a full library backup (metadata + files) */
  backupLibrary(): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/api/backup`, {}, {
      responseType: 'blob',
    });
  }

  /** Restore library from a backup payload */
  restoreLibrary(payload: any): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/api/backup/restore`,
      payload
    );
  }
}
