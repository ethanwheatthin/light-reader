import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeOption, TocItem } from '../../../../core/models/document.model';

@Component({
  selector: 'app-chapters-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chapters-panel.component.html',
  styleUrl: './chapters-panel.component.css'
})
export class ChaptersPanelComponent {
  @Input() isOpen = false;
  @Input() chapters: TocItem[] = [];
  @Input() theme: ThemeOption = 'light';
  @Input() currentChapter: string | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() chapterSelect = new EventEmitter<TocItem>();

  onChapterClick(chapter: TocItem): void {
    this.chapterSelect.emit(chapter);
  }

  closePanel(): void {
    this.close.emit();
  }
}
