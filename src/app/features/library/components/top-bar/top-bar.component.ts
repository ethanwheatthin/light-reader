import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { UiActions } from '../../../../store/ui/ui.actions';

@Component({
  selector: 'app-library-top-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.css'
})
export class TopBarComponent {
  private store = inject(Store);

  @Input() searchQuery = '';
  @Output() searchChange = new EventEmitter<string>();

  onInput(v: string) {
    this.searchChange.emit(v);
  }

  toggleSidebar() {
    this.store.dispatch(UiActions.toggleSidebar());
  }
}
