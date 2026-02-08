import { Component, Input, inject, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import * as pdfjsLib from 'pdfjs-dist';
import { IndexDBService } from '../../../core/services/indexdb.service';
import { DocumentsActions } from '../../../store/documents/documents.actions';

@Component({
  selector: 'app-pdf-reader',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pdf-reader.component.html',
  styleUrl: './pdf-reader.component.css'
})
export class PdfReaderComponent implements OnInit, OnDestroy {
  @Input() documentId!: string;
  @ViewChild('pdfCanvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  
  private store = inject(Store);
  private indexDB = inject(IndexDBService);
  private pdfDoc: any;
  
  currentPage = 1;
  totalPages = 0;
  scale = 1.5;

  async ngOnInit(): Promise<void> {
    // Set worker path - needs to point to the worker file in node_modules
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    
    try {
      const blob = await this.indexDB.getFile(this.documentId);
      if (blob) {
        const arrayBuffer = await blob.arrayBuffer();
        this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        this.totalPages = this.pdfDoc.numPages;
        
        // Load saved page or start at page 1
        const metadata = await this.indexDB.getMetadata(this.documentId);
        if (metadata?.currentPage) {
          this.currentPage = metadata.currentPage;
        }
        
        await this.renderPage(this.currentPage);
      }
    } catch (error) {
      console.error('Error loading PDF:', error);
    }
  }

  ngOnDestroy(): void {
    if (this.pdfDoc) {
      this.pdfDoc.destroy();
    }
  }

  async renderPage(pageNum: number): Promise<void> {
    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: this.scale });
      const canvas = this.canvas.nativeElement;
      const context = canvas.getContext('2d')!;
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      await page.render({ canvasContext: context, viewport }).promise;
    } catch (error) {
      console.error('Error rendering page:', error);
    }
  }

  async nextPage(): Promise<void> {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      await this.renderPage(this.currentPage);
      this.updateProgress();
    }
  }

  async prevPage(): Promise<void> {
    if (this.currentPage > 1) {
      this.currentPage--;
      await this.renderPage(this.currentPage);
      this.updateProgress();
    }
  }

  async onScaleChange(): Promise<void> {
    await this.renderPage(this.currentPage);
  }

  private updateProgress(): void {
    this.store.dispatch(
      DocumentsActions.updateReadingProgress({
        id: this.documentId,
        page: this.currentPage
      })
    );
  }
}
