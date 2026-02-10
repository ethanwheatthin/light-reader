import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { DocumentsActions } from '../../store/documents/documents.actions';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './upload.component.html',
  styleUrl: './upload.component.css'
})
export class UploadComponent {
  private store = inject(Store);

  onFileSelected(event: Event): void {
    const files = (event.target as HTMLInputElement).files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      this.store.dispatch(DocumentsActions.uploadDocuments({ files: fileArray }));
      // Reset input
      (event.target as HTMLInputElement).value = '';
    }
  }
}
