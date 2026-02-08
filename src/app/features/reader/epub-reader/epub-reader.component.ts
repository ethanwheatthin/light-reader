import { Component, Input, inject, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import ePub from 'epubjs';
import { IndexDBService } from '../../../core/services/indexdb.service';
import { DocumentsActions } from '../../../store/documents/documents.actions';

@Component({
  selector: 'app-epub-reader',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './epub-reader.component.html',
  styleUrl: './epub-reader.component.css'
})
export class EpubReaderComponent implements OnInit, OnDestroy {
  @Input() documentId!: string;
  @ViewChild('viewer', { static: true }) viewer!: ElementRef;
  
  private store = inject(Store);
  private indexDB = inject(IndexDBService);
  private book: any;
  private rendition: any;
  
  currentLocation = '';
  canGoPrev = false;
  canGoNext = true;

  async ngOnInit(): Promise<void> {
    try {
      const blob = await this.indexDB.getFile(this.documentId);
      if (blob) {
        const arrayBuffer = await blob.arrayBuffer();
        this.book = ePub(arrayBuffer);
        
        this.rendition = this.book.renderTo(this.viewer.nativeElement, {
          width: '100%',
          height: '100%',
          spread: 'none',
          allowScriptedContent: true
        });
        
        await this.rendition.display();
        
        // Track location changes
        this.rendition.on('relocated', (location: any) => {
          this.updateLocation(location);
        });
      }
    } catch (error) {
      console.error('Error loading EPUB:', error);
    }
  }

  ngOnDestroy(): void {
    if (this.rendition) {
      this.rendition.destroy();
    }
  }

  async nextPage(): Promise<void> {
    if (this.rendition) {
      await this.rendition.next();
    }
  }

  async prevPage(): Promise<void> {
    if (this.rendition) {
      await this.rendition.prev();
    }
  }

  private updateLocation(location: any): void {
    this.currentLocation = location.start.displayed.page 
      ? `Page ${location.start.displayed.page} of ${location.start.displayed.total}`
      : 'Reading...';
    
    this.canGoPrev = !location.atStart;
    this.canGoNext = !location.atEnd;
    
    // Save progress
    if (location.start.displayed.page) {
      this.store.dispatch(
        DocumentsActions.updateReadingProgress({
          id: this.documentId,
          page: location.start.displayed.page
        })
      );
    }
  }
}
