import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  InjectionToken,
  effect,
  inject,
  input,
  signal,
  viewChildren,
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

/** Un cadre de page et sa taille de dessin, connue des l'ouverture du document. */
interface PageFrame {
  readonly n: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Affiche un PDF comme une suite d'images, page apres page, ajustees a la largeur.
 * Pas de barre d'outils ni de vignettes : le client voit une carte, pas un logiciel.
 *
 * Le gabarit possede les cadres (un @for sur `frames`) ; ce composant ne fait que
 * dessiner dedans. Les cadres apparaissent des l'ouverture du document, mais chaque
 * page n'est peinte qu'a l'approche de l'ecran : cinq PDF de quinze pages ne
 * remplissent pas la memoire d'un telephone d'un coup.
 */
@Component({
  selector: 'hk-pdf-pages',
  imports: [HkSkeleton],
  templateUrl: './hk-pdf-pages.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkPdfPages {
  readonly url = input.required<string>();
  readonly title = input('Document PDF');

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly frames = signal<readonly PageFrame[]>([]);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly canvases = viewChildren<ElementRef<HTMLCanvasElement>>('page');
  private readonly loader = inject(PDF_LOADER);

  // Un numero d'ouverture : tout ce qui revient d'une ouverture abandonnee est jete.
  private run = 0;
  private doc: PdfDocumentLike | null = null;
  private observer: IntersectionObserver | null = null;
  // Les cadres appartiennent au @for, qui peut reutiliser un noeud d'un document a
  // l'autre quand les deux ont le meme nombre de pages. Marquer « deja peint » sur
  // l'element laisserait alors le nouveau PDF a l'ecran du precedent : ce suivi
  // vit donc ici, et repart a zero a chaque ouverture.
  private painted = new Set<number>();
  // Facteurs retenus a l'ouverture, reutilises pour peindre chaque page.
  private renderWidth = MIN_RENDER_WIDTH;
  private renderRatio = 1;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      this.run++;
      this.reset();
    });
    effect(() => {
      const url = this.url();
      void this.open(url, ++this.run);
    });
    // Les canvas n'existent qu'une fois le @for rendu : c'est ici, et pas dans
    // `open`, qu'on peut les observer. L'effet se rejoue quand leur liste change.
    // Phase « read » explicite : le rappel ne fait que relever les canvas pour les
    // observer. La phase par defaut melange lecture et ecriture et provoque des
    // recalculs de mise en page inutiles.
    afterRenderEffect({
      read: () => {
        const canvases = this.canvases().map((ref) => ref.nativeElement);
        if (canvases.length > 0) {
          this.watch(canvases, this.run);
        }
      },
    });
  }

  // Ouvre le document et calcule la taille de chaque page. Rien n'est dessine ici :
  // seule la mise en page est posee, pour qu'elle ne bouge plus ensuite.
  private async open(url: string, run: number): Promise<void> {
    this.state.set('loading');
    this.frames.set([]);
    this.painted.clear();
    this.reset();
    try {
      const doc = await this.loader(url);
      if (run !== this.run) {
        void doc.destroy();
        return;
      }
      this.doc = doc;
      const hostWidth = this.host.nativeElement.clientWidth;
      // Sur telephone on ne vise que la largeur reelle de l'ecran : rendre a 900 px
      // une page qui en fait 360 coute de la memoire pour une nettete invisible.
      const narrow = window.innerWidth < 640;
      const width = narrow ? Math.max(hostWidth, 320) : Math.max(hostWidth, MIN_RENDER_WIDTH);
      // Densite plafonnee a 2 : au-dela, un ecran tres fin fabrique des canvas enormes
      // (la surface croit au carre) et le systeme ferme l'onglet avant la fin du rendu.
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const frames: PageFrame[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        if (run !== this.run) return;
        const viewport = page.getViewport({ scale: this.scaleFor(page, width, ratio) });
        frames.push({ n, width: Math.floor(viewport.width), height: Math.floor(viewport.height) });
      }
      this.renderWidth = width;
      this.renderRatio = ratio;
      this.frames.set(frames);
      this.state.set('ready');
    } catch {
      if (run === this.run) this.state.set('error');
    }
  }

  // La page est dessinee a la largeur visee, puis reduite par CSS : d'ou le ratio.
  private scaleFor(page: PdfPageLike, width: number, ratio: number): number {
    return (width / page.getViewport({ scale: 1 }).width) * ratio;
  }

  private watch(canvases: HTMLCanvasElement[], run: number): void {
    this.observer?.disconnect();
    this.observer = null;
    // Sans IntersectionObserver (environnement de test), on dessine tout d'affilee :
    // mieux vaut un rendu complet et lent qu'une carte qui reste blanche.
    if (typeof IntersectionObserver === 'undefined') {
      // Le `catch` est indispensable : sans lui, une page qui echoue casse la
      // chaine, les suivantes ne sont jamais dessinees et l'ecran garde des cadres
      // blancs sans le message qui renvoie vers le plein ecran.
      void canvases
        .reduce(
          (previous, canvas) => previous.then(() => this.paint(canvas, run)),
          Promise.resolve(),
        )
        .catch(() => {
          if (run === this.run) this.state.set('error');
        });
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.observer?.unobserve(entry.target);
            void this.paint(entry.target as HTMLCanvasElement, run).catch(() =>
              this.state.set('error'),
            );
          }
        }
      },
      // 600 px d'avance verticale : la page suivante est dessinee avant d'entrer dans
      // l'ecran, donc le defilement ne tombe jamais sur un cadre encore vide.
      { rootMargin: '600px 0px' },
    );
    for (const canvas of canvases) this.observer.observe(canvas);
  }

  private async paint(canvas: HTMLCanvasElement, run: number): Promise<void> {
    const doc = this.doc;
    const n = Number(canvas.dataset['page']);
    if (!doc || run !== this.run || this.painted.has(n)) return;
    this.painted.add(n);
    const page = await doc.getPage(n);
    if (run !== this.run) return;
    const viewport = page.getViewport({
      scale: this.scaleFor(page, this.renderWidth, this.renderRatio),
    });
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    await page.render({ canvasContext: context, viewport }).promise;
  }

  private reset(): void {
    this.observer?.disconnect();
    this.observer = null;
    void this.doc?.destroy();
    this.doc = null;
  }
}
