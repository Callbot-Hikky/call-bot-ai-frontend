import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  InjectionToken,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { HkSkeleton } from '@shared/components/atoms/skeleton/hk-skeleton';

// Le strict necessaire de pdf.js : un document, ses pages, un rendu sur canvas.
export interface PdfPageLike {
  getViewport(params: { scale: number }): { width: number; height: number };
  render(params: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): {
    promise: Promise<unknown>;
  };
}
export interface PdfDocumentLike {
  numPages: number;
  getPage(n: number): Promise<PdfPageLike>;
  destroy(): Promise<unknown> | void;
}
export type PdfLoader = (url: string) => Promise<PdfDocumentLike>;

// Charge pdf.js a la demande (chunk separe) et son worker depuis nos assets.
const defaultLoader: PdfLoader = async (url) => {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/assets/pdfjs/pdf.worker.min.mjs';
  return pdfjs.getDocument({ url }).promise as Promise<PdfDocumentLike>;
};

export const PDF_LOADER = new InjectionToken<PdfLoader>('PDF_LOADER', {
  providedIn: 'root',
  factory: () => defaultLoader,
});

// Largeur de rendu minimale : une page nette meme agrandie sur un grand ecran.
const MIN_RENDER_WIDTH = 900;

/**
 * Affiche un PDF comme une suite d'images, page apres page, ajustees a la largeur.
 * Pas de barre d'outils ni de vignettes : le client voit une carte, pas un logiciel.
 */
@Component({
  selector: 'hk-pdf-pages',
  imports: [HkSkeleton],
  template: `
    <div class="flex flex-col gap-4" role="img" [attr.aria-label]="title()">
      @if (state() === 'loading') {
        <hk-skeleton height="60vh" />
      }
      @if (state() === 'error') {
        <p class="text-text-muted text-sm" data-testid="pdf-error">
          La carte n'a pas pu être affichée ici. Ouvrez-la en plein écran ci-dessous.
        </p>
      }
      <div #pages class="flex flex-col gap-4" [hidden]="state() !== 'ready'"></div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkPdfPages {
  readonly url = input.required<string>();
  readonly title = input('Document PDF');

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly pages = viewChild.required<ElementRef<HTMLElement>>('pages');
  private readonly loader = inject(PDF_LOADER);
  private run = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.run++);
    effect(() => {
      const url = this.url();
      void this.render(url, ++this.run);
    });
  }

  private async render(url: string, run: number): Promise<void> {
    this.state.set('loading');
    let doc: PdfDocumentLike | null = null;
    try {
      doc = await this.loader(url);
      if (run !== this.run) return;
      const container = this.pages().nativeElement;
      container.replaceChildren();
      const width = Math.max(this.host.nativeElement.clientWidth, MIN_RENDER_WIDTH);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        if (run !== this.run) return;
        const base = page.getViewport({ scale: 1 });
        const scale = (width / base.width) * ratio;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.className = 'border-border/70 h-auto w-full rounded-lg border bg-white shadow-sm';
        canvas.setAttribute('aria-label', `Page ${n}`);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas');
        await page.render({ canvasContext: context, viewport }).promise;
        container.appendChild(canvas);
      }
      this.state.set('ready');
    } catch {
      if (run === this.run) this.state.set('error');
    } finally {
      void doc?.destroy();
    }
  }
}
