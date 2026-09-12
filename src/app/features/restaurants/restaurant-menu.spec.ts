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
    await fixture.whenStable();
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
});
