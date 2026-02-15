import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';

@Injectable({ providedIn: 'root' })
export class PdfService {
  async extractMetadata(file: File): Promise<{ title: string; totalPages?: number }> {
    // Ensure worker is configured before using pdf.js
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    const title = file.name.replace('.pdf', '');
    const totalPages = pdf.numPages;
    
    return { title, totalPages };
  }
}
