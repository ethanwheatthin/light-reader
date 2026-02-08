import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { Document } from '../../core/models/document.model';
import { selectAllDocuments, selectLoading } from '../../store/documents/documents.selectors';
import { DocumentsActions } from '../../store/documents/documents.actions';
import { UploadComponent } from '../upload/upload.component';

@Component({
  selector: 'app-library',
  standalone: true,
  imports: [CommonModule, UploadComponent],
  templateUrl: './library.component.html',
  styleUrl: './library.component.css'
})
export class LibraryComponent implements OnInit {
  private store = inject(Store);
  private router = inject(Router);
  
  documents$: Observable<Document[]> = this.store.select(selectAllDocuments);
  loading$: Observable<boolean> = this.store.select(selectLoading);

  ngOnInit(): void {
    this.store.dispatch(DocumentsActions.loadDocuments());
  }

  openDocument(id: string): void {
    this.router.navigate(['/reader', id]);
  }

  deleteDocument(id: string): void {
    if (confirm('Are you sure you want to delete this document?')) {
      this.store.dispatch(DocumentsActions.deleteDocument({ id }));
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString();
  }
}
