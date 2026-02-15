import { Component, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { Document } from '../../core/models/document.model';
import { selectSelectedDocument } from '../../store/documents/documents.selectors';
import { DocumentsActions } from '../../store/documents/documents.actions';
import { EpubReaderComponent } from './epub-reader/epub-reader.component';

@Component({
  selector: 'app-reader',
  standalone: true,
  imports: [CommonModule, EpubReaderComponent],
  templateUrl: './reader.component.html',
  styleUrl: './reader.component.css'
})
export class ReaderComponent implements OnInit {
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  
  @ViewChild(EpubReaderComponent) epubReader?: EpubReaderComponent;
  
  document$: Observable<Document | null | undefined> = this.store.select(selectSelectedDocument);
  
  focusModeActive = signal<boolean>(false);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.store.dispatch(DocumentsActions.loadDocuments());
      this.store.dispatch(DocumentsActions.openDocument({ id }));
    }
  }

  goBack(): void {
    this.router.navigate(['/library']);
  }

  onFocusModeChange(active: boolean): void {
    this.focusModeActive.set(active);
  }

  toggleFocusMode(): void {
    if (this.epubReader) {
      this.epubReader.exitFocusMode();
    }
  }
}
