import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Shelf } from '../models/shelf.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ShelfApiService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/api/shelves`;

  /** Get all shelves */
  getAllShelves(): Observable<Shelf[]> {
    return this.http.get<Shelf[]>(this.baseUrl);
  }

  /** Get a single shelf by ID */
  getShelf(id: string): Observable<Shelf> {
    return this.http.get<Shelf>(`${this.baseUrl}/${id}`);
  }

  /** Create a new shelf */
  createShelf(shelf: { name: string; color: string; order?: number }): Observable<Shelf> {
    return this.http.post<Shelf>(this.baseUrl, shelf);
  }

  /** Update shelf properties */
  updateShelf(id: string, changes: Partial<Shelf>): Observable<Shelf> {
    return this.http.put<Shelf>(`${this.baseUrl}/${id}`, {
      name: changes.name,
      color: changes.color,
      order: changes.order,
    });
  }

  /** Delete a shelf (documents become unshelved) */
  deleteShelf(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  /** Add/remove documents from a shelf */
  updateShelfDocuments(
    id: string,
    addDocumentIds: string[] = [],
    removeDocumentIds: string[] = []
  ): Observable<Shelf> {
    return this.http.put<Shelf>(`${this.baseUrl}/${id}/documents`, {
      addDocumentIds,
      removeDocumentIds,
    });
  }
}
