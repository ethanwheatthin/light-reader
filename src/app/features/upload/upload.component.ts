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
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.store.dispatch(DocumentsActions.uploadDocument({ file }));
      // Reset input
      (event.target as HTMLInputElement).value = '';
    }
  }
}
