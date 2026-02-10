import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDrag, CdkDragStart, CdkDragEnd, DragDropModule } from '@angular/cdk/drag-drop';
import { Document } from '../../../../core/models/document.model';
import { BookMetadata } from '../../../../core/models/document.model';



@Component({
  selector: 'app-book-card',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './book-card.component.html',
  styleUrl: './book-card.component.css'
})
export class BookCardComponent {
  @Input() doc!: Document;
  @Input() openMenuId: string | null = null;

  @Output() open = new EventEmitter<string>();
  @Output() toggleMenu = new EventEmitter<{ id: string; event: Event }>();
  @Output() edit = new EventEmitter<{ doc: Document; event: Event }>();
  @Output() fetchMetadata = new EventEmitter<{ doc: Document; event: Event }>();
  @Output() delete = new EventEmitter<string>();
  @Output() dragStarted = new EventEmitter<string>();
  @Output() dragEnded = new EventEmitter<string>();

  openDoc() {
    this.open.emit(this.doc.id);
  }

  onToggleMenu(e: Event) {
    e.stopPropagation();
    this.toggleMenu.emit({ id: this.doc.id, event: e });
  }

  onEdit(e: Event) {
    e.stopPropagation();
    this.edit.emit({ doc: this.doc, event: e });
  }

  onFetch(e: Event) {
    e.stopPropagation();
    this.fetchMetadata.emit({ doc: this.doc, event: e });
  }

  onDelete(e: Event) {
    e.stopPropagation();
    this.delete.emit(this.doc.id);
  }

  started() {
    this.dragStarted.emit(this.doc.id);
  }

  ended() {
    this.dragEnded.emit(this.doc.id);
  }

  progress(doc?: Document) {
    if (!doc) return 0;
    if (doc.readingProgressPercent != null) return doc.readingProgressPercent;
    if (!doc.currentPage || !doc.totalPages) return 0;
    return Math.round((doc.currentPage / doc.totalPages) * 100);
  }
}
