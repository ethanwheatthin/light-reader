import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Document, Bookmark, ReadingSession, ReadingGoal, BookMetadata } from '../models/document.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DocumentApiService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/api/documents`;

  /** Get all documents with full metadata */
  getAllDocuments(): Observable<Document[]> {
    return this.http.get<Document[]>(this.baseUrl);
  }

  /** Get a single document by ID */
  getDocument(id: string): Observable<Document> {
    return this.http.get<Document>(`${this.baseUrl}/${id}`);
  }

  /** Upload a new document file (EPUB or PDF) */
  uploadDocument(file: File, title?: string): Observable<Document> {
    const formData = new FormData();
    formData.append('file', file);
    if (title) {
      formData.append('title', title);
    }
    return this.http.post<Document>(this.baseUrl, formData);
  }

  /** Update document metadata / top-level fields */
  updateDocument(id: string, changes: Partial<Document>): Observable<Document> {
    return this.http.put<Document>(`${this.baseUrl}/${id}`, changes);
  }

  /** Delete a document and its file */
  deleteDocument(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  /** Download the document file as a Blob */
  getDocumentFile(id: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${id}/file`, { responseType: 'blob' });
  }

  /** Update reading progress (page, CFI, progress percent) */
  updateReadingProgress(
    id: string,
    progress: { page?: number; cfi?: string; progressPercent?: number }
  ): Observable<Document> {
    return this.http.put<Document>(`${this.baseUrl}/${id}/progress`, progress);
  }

  // ── Bookmarks ──

  /** Add a bookmark to a document */
  addBookmark(
    documentId: string,
    bookmark: { location: string; label: string; note?: string }
  ): Observable<Bookmark> {
    return this.http.post<Bookmark>(`${this.baseUrl}/${documentId}/bookmarks`, bookmark);
  }

  /** Update a bookmark (note, label, location) */
  updateBookmark(
    documentId: string,
    bookmarkId: string,
    changes: Partial<Bookmark>
  ): Observable<Bookmark> {
    return this.http.put<Bookmark>(
      `${this.baseUrl}/${documentId}/bookmarks/${bookmarkId}`,
      changes
    );
  }

  /** Remove a bookmark */
  removeBookmark(documentId: string, bookmarkId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/${documentId}/bookmarks/${bookmarkId}`
    );
  }

  // ── Reading Sessions ──

  /** Record a completed reading session */
  addReadingSession(documentId: string, session: ReadingSession): Observable<ReadingSession> {
    return this.http.post<ReadingSession>(
      `${this.baseUrl}/${documentId}/sessions`,
      session
    );
  }

  /** Get reading statistics for a document */
  getReadingStats(documentId: string): Observable<{
    totalReadingTime: number;
    sessions: ReadingSession[];
    firstOpenedAt?: Date;
  }> {
    return this.http.get<any>(`${this.baseUrl}/${documentId}/stats`);
  }

  // ── Reading Goals ──

  /** Set or update a reading goal */
  setReadingGoal(documentId: string, goal: ReadingGoal): Observable<ReadingGoal> {
    return this.http.put<ReadingGoal>(
      `${this.baseUrl}/${documentId}/goals`,
      goal
    );
  }

  /** Update the reading streak for today */
  updateReadingStreak(documentId: string): Observable<ReadingGoal> {
    return this.http.put<ReadingGoal>(
      `${this.baseUrl}/${documentId}/goals/streak`,
      {}
    );
  }

  // ── Metadata ──

  /** Update book metadata (author, cover, description, etc.) */
  updateBookMetadata(documentId: string, metadata: BookMetadata): Observable<Document> {
    return this.http.put<Document>(`${this.baseUrl}/${documentId}`, { metadata });
  }
}
