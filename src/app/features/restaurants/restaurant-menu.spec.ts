import { MENU_GATEWAY } from '@core/services/menu-gateway';
import { HttpMenuGateway } from '@core/services/http-menu-gateway';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PDF_LOADER } from '@shared/components/molecules/pdf-pages/hk-pdf-pages';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { RestaurantMenuPage } from './restaurant-menu';
import { PublicMenuDto } from '@core/models/menu-dto.model';

const RID = '40de0820-8f77-408a-aad4-847c889f7ffa';
const FILE = '06a7fb1d-3c23-4632-a7d0-a6754249c2a4';

function dto(partial: Partial<PublicMenuDto> = {}): PublicMenuDto {
  return { restaurantName: 'Chez Hikky', mode: 'none', manual: null, files: [], ...partial };
}

describe('RestaurantMenuPage', () => {
  let fixture: ComponentFixture<RestaurantMenuPage>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RestaurantMenuPage],
      providers: [
        { provide: MENU_GATEWAY, useClass: HttpMenuGateway },
        { provide: PDF_LOADER, useValue: () => new Promise(() => undefined) },
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(body: PublicMenuDto | null, reservation?: string): Promise<void> {
    fixture = TestBed.createComponent(RestaurantMenuPage);
    fixture.componentRef.setInput('id', RID);
    if (reservation) fixture.componentRef.setInput('reservation', reservation);
    // La ressource part au premier rendu ; on ne peut pas attendre la stabilisation
    // avant d'avoir repondu, sinon le test attend une reponse qu'il n'a pas encore donnee.
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url.endsWith(`/public/restaurants/${RID}/menu`));
    if (body) req.flush(body);
    else req.flush('boom', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
  }

  it('affiche le nom du restaurant et la carte saisie avec les prix', async () => {
    await render(
      dto({
        mode: 'manual',
        manual: {
          version: 1,
          sections: [
            {
              name: 'Plats',
              items: [
                { name: 'Tajine', description: 'Aux pruneaux', price: '18.50' },
                { name: 'Couscous', description: '', price: '' },
              ],
            },
          ],
        },
      }),
    );
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Chez Hikky');
    expect(text).toContain('Plats');
    expect(text).toContain('Tajine');
    expect(text).toContain('18,50');
    expect(fixture.nativeElement.querySelector('b')).toBeNull();
  });

  it('affiche les photos du mode images avec leur URL publique', async () => {
    await render(
      dto({
        mode: 'images',
        files: [
          {
            id: FILE,
            kind: 'image',
            contentType: 'image/png',
            position: 0,
            sizeBytes: 1,
            url: `/api/public/restaurants/${RID}/menu/files/${FILE}`,
          },
        ],
      }),
    );
    const img: HTMLImageElement = fixture.nativeElement.querySelector(
      'img[data-testid="menu-image"]',
    );
    expect(img.getAttribute('src')).toBe(`/api/public/restaurants/${RID}/menu/files/${FILE}`);
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('les photos suivent l ordre du restaurateur et ignorent les autres genres et URL', async () => {
    const second = '2f1f6a0e-4a9d-4b57-9a5f-1c7b8b7e6d21';
    await render(
      dto({
        mode: 'images',
        files: [
          {
            id: second,
            kind: 'image',
            contentType: 'image/png',
            position: 1,
            sizeBytes: 1,
            url: `/api/public/restaurants/${RID}/menu/files/${second}`,
          },
          {
            id: 'x',
            kind: 'image',
            contentType: 'image/png',
            position: 2,
            sizeBytes: 1,
            url: 'https://evil.example/pixel.png',
          },
          {
            id: 'p',
            kind: 'pdf',
            contentType: 'application/pdf',
            position: 0,
            sizeBytes: 1,
            url: `/api/public/restaurants/${RID}/menu/files/${FILE}`,
          },
          {
            id: FILE,
            kind: 'image',
            contentType: 'image/png',
            position: 0,
            sizeBytes: 1,
            url: `/api/public/restaurants/${RID}/menu/files/${FILE}`,
          },
        ],
      }),
    );
    const srcs = [...fixture.nativeElement.querySelectorAll('img[data-testid="menu-image"]')].map(
      (img: HTMLImageElement) => img.getAttribute('src'),
    );
    expect(srcs).toEqual([
      `/api/public/restaurants/${RID}/menu/files/${FILE}`,
      `/api/public/restaurants/${RID}/menu/files/${second}`,
    ]);
  });

  it('un PDF publie dont l URL n a pas la bonne forme est signale, pas presente comme absent', async () => {
    await render(
      dto({
        mode: 'pdf',
        files: [
          {
            id: 'p',
            kind: 'pdf',
            contentType: 'application/pdf',
            position: 0,
            sizeBytes: 1,
            url: 'https://evil.example/carte.pdf',
          },
        ],
      }),
    );
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain("n'a pas pu être chargée");
    expect(text).not.toContain('arrive bientôt');
  });

  it('affiche le PDF dans un cadre et un lien pour l ouvrir', async () => {
    await render(
      dto({
        mode: 'pdf',
        files: [
          {
            id: FILE,
            kind: 'pdf',
            contentType: 'application/pdf',
            position: 0,
            sizeBytes: 1,
            url: `/api/public/restaurants/${RID}/menu/files/${FILE}`,
          },
        ],
      }),
    );
    // Rendu en images page par page, jamais un lecteur PDF avec sa barre d'outils.
    const pages = fixture.debugElement.query(By.css('hk-pdf-pages[data-testid="menu-pdf"]'));
    expect(pages).not.toBeNull();
    expect(pages.componentInstance.url()).toBe(`/api/public/restaurants/${RID}/menu/files/${FILE}`);
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector(
      'a[data-testid="open-pdf"]',
    );
    expect(link.getAttribute('href')).toContain('/api/public/');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('plusieurs PDF s enchainent dans l ordre des positions, chacun avec son lien', async () => {
    const wines = '2f1f6a0e-4a9d-4b57-9a5f-1c7b8b7e6d21';
    await render(
      dto({
        mode: 'pdf',
        files: [
          {
            id: wines,
            kind: 'pdf',
            contentType: 'application/pdf',
            position: 1,
            sizeBytes: 1,
            url: `/api/public/restaurants/${RID}/menu/files/${wines}`,
          },
          {
            id: FILE,
            kind: 'pdf',
            contentType: 'application/pdf',
            position: 0,
            sizeBytes: 1,
            url: `/api/public/restaurants/${RID}/menu/files/${FILE}`,
          },
        ],
      }),
    );
    const pages = fixture.debugElement.queryAll(By.css('hk-pdf-pages[data-testid="menu-pdf"]'));
    expect(pages.length).toBe(2);
    expect(pages[0].componentInstance.url()).toContain(FILE);
    expect(pages[1].componentInstance.url()).toContain(wines);
    expect(fixture.nativeElement.querySelectorAll('a[data-testid="open-pdf"]').length).toBe(2);
    expect(fixture.nativeElement.textContent).not.toContain('arrive bientôt');
  });

  it('dit que la carte arrive quand rien n est publie', async () => {
    await render(dto({ mode: 'none' }));
    expect(fixture.nativeElement.textContent).toContain('bientôt');
  });

  it('propose de modifier la réservation quand on vient du message de confirmation', async () => {
    await render(dto({ mode: 'none' }), 'resa-1');
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector(
      'a[data-testid="link-reschedule"]',
    );
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/client/reservations/resa-1/reschedule');
  });

  it('sans réservation (flyer, QR), propose de réserver une table en ligne', async () => {
    await render(dto({ mode: 'none' }));
    expect(fixture.nativeElement.querySelector('a[data-testid="link-reschedule"]')).toBeNull();
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector(
      'a[data-testid="link-schedule"]',
    );
    expect(link.textContent).toContain('Réserver une table');
    expect(link.getAttribute('href')).toBe(`/client/restaurants/${RID}/schedule`);
  });

  it('un restaurant inconnu affiche un message clair', async () => {
    await render(null);
    expect(fixture.nativeElement.textContent).toContain('introuvable');
  });

  // Le chemin panne reseau est distinct du 404 : l'un se retente, l'autre non.
  it('avant toute reponse, la carte montre un squelette et non une page vide', async () => {
    fixture = TestBed.createComponent(RestaurantMenuPage);
    fixture.componentRef.setInput('id', RID);
    fixture.detectChanges();

    const article: HTMLElement = fixture.nativeElement.querySelector('article');
    expect(article.getAttribute('aria-busy') ?? article.innerHTML).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).not.toBeNull();

    http.expectOne((r) => r.url.endsWith(`/public/restaurants/${RID}/menu`)).flush(dto());
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('une panne reseau propose de reessayer, et reessayer relance la requete', async () => {
    fixture = TestBed.createComponent(RestaurantMenuPage);
    fixture.componentRef.setInput('id', RID);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url.endsWith(`/public/restaurants/${RID}/menu`))
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Impossible de charger la carte.');
    expect(text).not.toContain('introuvable');

    const retry: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(retry.textContent).toContain('Réessayer');
    retry.click();
    // detectChanges et non whenStable : la ressource repart, et attendre sa
    // stabilisation ici bloquerait sur une reponse que le test n'a pas donnee.
    fixture.detectChanges();

    // La seconde tentative reussit : la carte remplace le message d'echec.
    http
      .expectOne((r) => r.url.endsWith(`/public/restaurants/${RID}/menu`))
      .flush(dto({ restaurantName: 'Chez Hikky' }));
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Chez Hikky');
    expect(fixture.nativeElement.textContent).not.toContain('Impossible de charger');
  });

  it('un identifiant introuvable ne propose pas de reessayer', async () => {
    await render(null);
    expect(fixture.nativeElement.textContent).toContain('introuvable');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('changer d identifiant recharge la carte du bon restaurant', async () => {
    await render(dto({ restaurantName: 'Chez Hikky' }));
    const OTHER = '11111111-2222-4333-8444-555555555555';

    fixture.componentRef.setInput('id', OTHER);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url.endsWith(`/public/restaurants/${OTHER}/menu`))
      .flush(dto({ restaurantName: 'Le Bistrot du Coin' }));
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Le Bistrot du Coin');
    expect(fixture.nativeElement.textContent).not.toContain('Chez Hikky');
  });
});
