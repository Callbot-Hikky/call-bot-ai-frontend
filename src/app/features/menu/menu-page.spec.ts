import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PDF_LOADER } from '@shared/components/molecules/pdf-pages/hk-pdf-pages';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { MenuPage } from './menu-page';
import { SessionService } from '@core/services/session.service';
import { ToastService } from '@core/services/toast.service';
import { MenuDto } from '@core/models/menu-dto.model';
import { RestaurantService } from '@core/services/restaurant.service';

const RID = 'r-1';

function dto(partial: Partial<MenuDto> = {}): MenuDto {
  return {
    restaurantId: RID,
    mode: 'none',
    manual: { version: 1, sections: [] },
    files: [],
    limits: {
      pdfMaxBytes: 10 * 1024 * 1024,
      pdfMaxCount: 5,
      imageMaxBytes: 5 * 1024 * 1024,
      imageMaxCount: 8,
    },
    ...partial,
  };
}

const IMAGES = [
  {
    id: 'a',
    kind: 'image' as const,
    contentType: 'image/png',
    position: 0,
    sizeBytes: 10,
    url: '/api/restaurants/40de0820-8f77-408a-aad4-847c889f7ffa/menu/files/aaaaaaaa-0000-4000-8000-000000000001',
  },
  {
    id: 'b',
    kind: 'image' as const,
    contentType: 'image/png',
    position: 1,
    sizeBytes: 10,
    url: '/api/restaurants/40de0820-8f77-408a-aad4-847c889f7ffa/menu/files/bbbbbbbb-0000-4000-8000-000000000002',
  },
];

describe('MenuPage', () => {
  let fixture: ComponentFixture<MenuPage>;
  let http: HttpTestingController;
  let toast: ToastService;
  const restaurantId = signal<string | null>(RID);

  beforeEach(async () => {
    restaurantId.set(RID);
    await TestBed.configureTestingModule({
      imports: [MenuPage],
      providers: [
        { provide: PDF_LOADER, useValue: () => new Promise(() => undefined) },
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SessionService, useValue: { restaurantId } },
        {
          provide: RestaurantService,
          useValue: {
            restaurant: signal({ id: RID, name: 'Le Bistrot du Coin' }),
            loadRestaurant: vi.fn(),
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    vi.spyOn(toast, 'show');
  });

  afterEach(() => http.verify());

  async function render(body: MenuDto | null, status = 200): Promise<void> {
    fixture = TestBed.createComponent(MenuPage);
    await fixture.whenStable();
    const req = http.expectOne(
      (r) => r.method === 'GET' && r.url.endsWith(`/restaurants/${RID}/menu`),
    );
    if (body) req.flush(body);
    else req.flush('boom', { status, statusText: 'Error' });
    await fixture.whenStable();
  }

  it('charge le menu du restaurant de la session et affiche les trois modes', async () => {
    await render(dto({ mode: 'manual' }));
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('PDF');
    expect(text).toContain('Photos');
    expect(text).toContain('Saisie manuelle');
    expect(
      fixture.nativeElement.querySelector('[data-testid="mode-manual"]')?.textContent,
    ).toContain('Publié');
  });

  it('choisir une carte vide ouvre sa preparation sans rien envoyer ni signaler', async () => {
    await render(dto());
    (fixture.nativeElement.querySelector('[data-testid="mode-images"]') as HTMLElement).click();
    await fixture.whenStable();
    http.expectNone((r) => r.method === 'PUT');
    expect(toast.show).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[aria-label="Carte en photos"]')).not.toBeNull();
  });

  it('cliquer une carte prete ouvre sa preparation sans publier : publier est un bouton a part', async () => {
    await render(dto({ files: IMAGES }));
    (fixture.nativeElement.querySelector('[data-testid="mode-images"]') as HTMLElement).click();
    await fixture.whenStable();
    http.expectNone((r) => r.method === 'PUT');
    (
      fixture.nativeElement.querySelector('[data-testid="publish-current"] button') as HTMLElement
    ).click();
    await fixture.whenStable();
    const req = http.expectOne((r) => r.method === 'PUT');
    expect(req.request.body).toEqual({ mode: 'images' });
    req.flush({ error: 'mode_not_ready' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    expect(toast.show).toHaveBeenCalledWith(expect.stringMatching(/contenu/), 'error');
  });

  it('rien de publie mais un PDF pret : le bandeau propose « Publier le PDF » et le publie', async () => {
    const pdf = {
      id: 'p',
      kind: 'pdf' as const,
      contentType: 'application/pdf',
      position: 0,
      sizeBytes: 10,
      url: '/api/restaurants/r-1/menu/files/p',
    };
    await render(dto({ mode: 'none', files: [pdf] }));
    const button: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="publish-current"] button',
    );
    expect(button.textContent).toContain('Publier le PDF');
    button.click();
    await fixture.whenStable();
    expect(http.expectOne((r) => r.method === 'PUT').request.body).toEqual({ mode: 'pdf' });
  });

  it('un PDF depose mais pas publie : encart de succes avec le bouton Publier, qui disparait une fois publie', async () => {
    const pdf = {
      id: 'p',
      kind: 'pdf' as const,
      contentType: 'application/pdf',
      position: 0,
      sizeBytes: 10,
      url: '/api/restaurants/r-1/menu/files/p',
    };
    await render(dto({ mode: 'none', files: [pdf] }));
    const inline: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="publish-inline"]',
    );
    expect(inline.textContent).toContain('pas encore visible');
    (inline.querySelector('button') as HTMLElement).click();
    await fixture.whenStable();
    http.expectOne((r) => r.method === 'PUT').flush(dto({ mode: 'pdf', files: [pdf] }));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-testid="publish-inline"]')).toBeNull();
  });

  it('aucun etat d enregistrement tant que rien n a ete modifie', async () => {
    await render(dto());
    expect(
      fixture.nativeElement.querySelector('[data-testid="save-state"]').textContent.trim(),
    ).toBe('');
  });

  it('rien de publie et rien de pret : pas de bouton, le bandeau explique quoi faire', async () => {
    await render(dto());
    expect(fixture.nativeElement.querySelector('[data-testid="publish-current"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Préparez un format ci-dessous');
  });

  it('le bloc QR est place avant le contenu, pour rester visible sans defiler', async () => {
    await render(dto());
    const html: string = fixture.nativeElement.innerHTML;
    expect(html.indexOf('Liens et QR codes')).toBeLessThan(
      html.indexOf('Préparez chaque format ici'),
    );
  });

  it('une erreur de chargement propose de reessayer, et reessayer relance le GET', async () => {
    await render(null, 500);
    const retry: HTMLElement = fixture.nativeElement.querySelector('[data-testid="menu-retry"]');
    expect(retry).not.toBeNull();
    retry.click();
    await fixture.whenStable();
    http.expectOne((r) => r.method === 'GET').flush(dto());
  });

  it('en mode saisie, le formulaire est affiche', async () => {
    await render(dto({ mode: 'manual' }));
    expect(fixture.nativeElement.querySelector('hk-menu-manual-form')).not.toBeNull();
  });

  it('en mode photos, les vignettes pointent sur les URL admin et la suppression demande confirmation', async () => {
    await render(dto({ mode: 'images', files: IMAGES }));
    const imgs: HTMLImageElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="image-thumb"]'),
    );
    expect(imgs).toHaveLength(2);
    expect(imgs[0].getAttribute('src')).toBe(
      '/api/restaurants/40de0820-8f77-408a-aad4-847c889f7ffa/menu/files/aaaaaaaa-0000-4000-8000-000000000001',
    );

    (fixture.nativeElement.querySelector('[data-testid="remove-file-a"]') as HTMLElement).click();
    await fixture.whenStable();
    http.expectNone((r) => r.method === 'DELETE');
    (
      fixture.nativeElement.querySelector('[data-testid="confirm-remove-file"]') as HTMLElement
    ).click();
    await fixture.whenStable();
    const del = http.expectOne((r) => r.method === 'DELETE');
    expect(del.request.url).toContain('/menu/files/a');
    del.flush(dto({ mode: 'images', files: [IMAGES[1]] }));
  });

  it('monter une photo envoie le nouvel ordre complet', async () => {
    await render(dto({ mode: 'images', files: IMAGES }));
    (fixture.nativeElement.querySelector('[data-testid="move-up-b"]') as HTMLElement).click();
    await fixture.whenStable();
    const req = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/files/order'));
    expect(req.request.body).toEqual({ fileIds: ['b', 'a'] });
    req.flush(dto({ mode: 'images', files: IMAGES }));
  });

  it('affiche la carte QR du menu avec le lien public et un nom de fichier lisible', async () => {
    await render(dto());
    const card = fixture.nativeElement.querySelector('hk-qr-card');
    expect(card).not.toBeNull();
    expect(card.querySelector('[data-testid="qr-url"]')?.textContent).toContain(
      `/client/restaurants/${RID}/menu`,
    );
    await vi.waitFor(() =>
      expect(card.querySelector('[data-testid="download-svg"]')?.getAttribute('download')).toBe(
        'menu-le-bistrot-du-coin.svg',
      ),
    );
    // Deux QR, deux usages : voir la carte, reserver une table.
    const cards = fixture.nativeElement.querySelectorAll('hk-qr-card');
    expect(cards).toHaveLength(2);
    expect(cards[1].querySelector('[data-testid="qr-url"]')?.textContent).toContain(
      `/client/restaurants/${RID}/schedule`,
    );
    await vi.waitFor(() =>
      expect(cards[1].querySelector('[data-testid="download-svg"]')?.getAttribute('download')).toBe(
        'reservation-le-bistrot-du-coin.svg',
      ),
    );
  });

  it('sans restaurant dans la session, explique quoi faire et propose la configuration', async () => {
    restaurantId.set(null);
    fixture = TestBed.createComponent(MenuPage);
    await fixture.whenStable();
    http.expectNone(() => true);
    expect(fixture.nativeElement.textContent).toContain('restaurant');
    expect(fixture.nativeElement.querySelector('a[href="/mon-restaurant"]')).not.toBeNull();
  });

  it('en mode PDF, affiche un aperçu intégré de l URL admin, et seulement d une URL admin', async () => {
    const pdf = {
      id: '06a7fb1d-3c23-4632-a7d0-a6754249c2a4',
      kind: 'pdf' as const,
      contentType: 'application/pdf',
      position: 0,
      sizeBytes: 1234,
      url: '/api/restaurants/40de0820-8f77-408a-aad4-847c889f7ffa/menu/files/06a7fb1d-3c23-4632-a7d0-a6754249c2a4',
    };
    await render(dto({ mode: 'pdf', files: [pdf] }));
    // Meme rendu que la page client : pages en images, jamais un lecteur incruste.
    const pages = fixture.debugElement.query(By.css('hk-pdf-pages[data-testid="pdf-preview"]'));
    expect(pages).not.toBeNull();
    expect(pages.componentInstance.url()).toBe(pdf.url);
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
  });

  it('plusieurs PDF : une rangee par fichier dans l ordre, l ajout en tete, la limite respectee', async () => {
    const pdf = (id: string, position: number) => ({
      id,
      kind: 'pdf' as const,
      contentType: 'application/pdf',
      position,
      sizeBytes: 10,
      url: `/api/restaurants/40de0820-8f77-408a-aad4-847c889f7ffa/menu/files/${id}`,
    });
    await render(
      dto({
        mode: 'pdf',
        files: [
          pdf('bbbbbbbb-0000-4000-8000-000000000002', 1),
          pdf('aaaaaaaa-0000-4000-8000-000000000001', 0),
        ],
      }),
    );
    const rows: NodeListOf<HTMLElement> =
      fixture.nativeElement.querySelectorAll('[data-testid="pdf-row"]');
    expect(rows.length).toBe(2);
    expect(
      rows[0].querySelector('[data-testid^="move-up-"]')?.getAttribute('data-testid'),
    ).toContain('aaaaaaaa');
    expect(fixture.nativeElement.querySelector('[data-testid="pdf-count"]').textContent).toContain(
      '2/5 PDF',
    );
    const html: string = fixture.nativeElement.innerHTML;
    expect(html.indexOf('Ajouter un PDF')).toBeLessThan(html.indexOf('data-testid="pdf-row"'));
    expect(fixture.nativeElement.querySelector('label.border-dashed')).toBeNull();

    await render(
      dto({
        mode: 'pdf',
        files: [1, 2, 3, 4, 5].map((n) => pdf(`cccccccc-0000-4000-8000-00000000000${n}`, n)),
      }),
    );
    expect(fixture.nativeElement.textContent).toContain('Limite de PDF atteinte');
    expect(fixture.nativeElement.textContent).not.toContain('Ajouter un PDF');
  });

  it('un lot de photos continue apres un refus et donne un seul bilan', async () => {
    await render(dto({ mode: 'images', files: IMAGES }));
    const png = (name: string) => {
      const bytes = new Uint8Array(64);
      bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      return new File([bytes], name, { type: 'image/png' });
    };
    const bad = new File([new Uint8Array(64)], 'x.png', { type: 'image/png' });
    fixture.componentInstance['onFiles']([png('a.png'), bad, png('c.png')]);
    const first = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'));
    first.flush(dto({ mode: 'images', files: IMAGES }));
    const second = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'));
    second.flush(dto({ mode: 'images', files: IMAGES }));
    await fixture.whenStable();
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledWith(expect.stringMatching(/2 sur 3/), 'error');
  });
});
