import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HkPdfPages, PDF_LOADER, PdfDocumentLike } from './hk-pdf-pages';

@Component({
  imports: [HkPdfPages],
  template: `<hk-pdf-pages [url]="url()" title="La carte" />`,
})
class Host {
  readonly url = signal('/api/public/restaurants/r/menu/files/f');
}

function fakeDocument(pages: number, render = () => ({ promise: Promise.resolve() })) {
  return {
    numPages: pages,
    getPage: () =>
      Promise.resolve({
        getViewport: ({ scale }: { scale: number }) => ({
          width: 100 * scale,
          height: 140 * scale,
        }),
        render,
      }),
    destroy: () => undefined,
  } satisfies PdfDocumentLike;
}

describe('HkPdfPages', () => {
  let fixture: ComponentFixture<Host>;

  async function setup(loader: (url: string) => Promise<PdfDocumentLike>): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideZonelessChangeDetection(), { provide: PDF_LOADER, useValue: loader }],
    }).compileComponents();
    // jsdom n'a pas de contexte 2D : on en fournit un factice, le rendu reel est celui de pdf.js.
    HTMLCanvasElement.prototype.getContext = (() => ({})) as never;
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  }

  it('affiche un squelette pendant le chargement', async () => {
    await setup(() => new Promise(() => undefined));
    expect(fixture.nativeElement.querySelector('hk-skeleton')).not.toBeNull();
  });

  it('dessine une page par page du document, ajustee a la largeur, sans cadre', async () => {
    await setup(() => Promise.resolve(fakeDocument(2)));
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
    const canvases = fixture.nativeElement.querySelectorAll('canvas');
    expect(canvases).toHaveLength(2);
    expect(canvases[0].getAttribute('aria-label')).toBe('Page 1');
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(fixture.nativeElement.querySelector('hk-skeleton')).toBeNull();
  });

  it('un document illisible affiche un message et laisse la place au lien plein ecran', async () => {
    await setup(() => Promise.reject(new Error('corrompu')));
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-testid="pdf-error"]').textContent).toContain(
      'plein écran',
    );
  });

  // Les cadres sont poses par le gabarit, le dessin arrive apres le rendu : si ce
  // branchement casse, les canvas sont bien la mais restent blancs.
  it('peint chaque page une fois ses cadres dans la page', async () => {
    const render = vi.fn(() => ({ promise: Promise.resolve() }));
    await setup(() => Promise.resolve(fakeDocument(3, render)));
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelectorAll('canvas')).toHaveLength(3);
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(3));
  });

  it('les cadres portent les dimensions calculees, pour une mise en page stable', async () => {
    await setup(() => Promise.resolve(fakeDocument(1)));
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();

    const canvas: HTMLCanvasElement = fixture.nativeElement.querySelector('canvas');
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
    // La page du faux document est au format 100x140 : le cadre garde ses proportions.
    expect(canvas.height / canvas.width).toBeCloseTo(1.4, 1);
  });

  it('changer de document remplace les cadres au lieu de les empiler', async () => {
    await setup(() => Promise.resolve(fakeDocument(2)));
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('canvas')).toHaveLength(2);

    fixture.componentInstance.url.set('/api/public/restaurants/r/menu/files/autre');
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('canvas')).toHaveLength(2);
  });
});
