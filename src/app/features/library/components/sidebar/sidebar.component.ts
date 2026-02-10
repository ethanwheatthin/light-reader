import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { Observable } from 'rxjs';
import { Document } from '../../../../core/models/document.model';
import { Shelf } from '../../../../core/models/shelf.model';

@Component({
  selector: 'app-library-sidebar',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent {
  @Input() documents$!: Observable<Document[]>;
  @Input() shelves$!: Observable<Shelf[]>;
  @Input() selectedShelfId$!: Observable<string | null> | null;
  @Input() shelvesExpanded = true;

  @Output() toggleShelves = new EventEmitter<boolean>();
  @Output() selectShelf = new EventEmitter<string | null>();
  @Output() createShelf = new EventEmitter<void>();
  @Output() deleteShelf = new EventEmitter<{ id: string; event: Event }>();
  @Output() bookDropped = new EventEmitter<{ dropEvent: CdkDragDrop<any>; targetShelfId: string | null }>();

  onShelfHeaderClick() {
    this.toggleShelves.emit(!this.shelvesExpanded);
  }

  onDrop(e: CdkDragDrop<any>, shelfId: string | null) {
    this.bookDropped.emit({ dropEvent: e, targetShelfId: shelfId });
  }

  emitSelect(id: string | null) {
    this.selectShelf.emit(id);
  }

  emitDelete(id: string, $event: Event) {
    $event.stopPropagation();
    this.deleteShelf.emit({ id, event: $event });
  }

  // Small helpers to keep template expressions simple and compatible with template compiler
  unshelvedCount(docs?: Document[]) {
    return docs ? docs.filter(d => !d.shelfId).length : 0;
  }

  shelfCount(docs?: Document[], shelf?: Shelf) {
    if (!docs || !shelf) return 0;
    return docs.filter(d => d.shelfId === shelf.id).length;
  }
}
