import { MENU_GATEWAY } from '@core/services/menu-gateway';
import { HttpMenuGateway } from '@core/services/http-menu-gateway';
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
import { withManualKeys } from '@core/models/menu.model';
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

const PDF = {
  id: 'p',
  kind: 'pdf' as const,
  contentType: 'application/pdf',
  position: 0,
  sizeBytes: 10,
  url: '/api/restaurants/r-1/menu/files/p',
};

describe('MenuPage', () => {
  let fixture: ComponentFixture<MenuPage>;
  let http: HttpTestingController;
  let toast: ToastService;
  const restaurantId = signal<string | null>(RID);
  const restaurant = signal<{ id: string; name: string } | null>(null);

  beforeEach(async () => {
    restaurantId.set(RID);
    restaurant.set(null);
    await TestBed.configureTestingModule({
      imports: [MenuPage],
      providers: [
        { provide: MENU_GATEWAY, useClass: HttpMenuGateway },
        { provide: PDF_LOADER, useValue: () => new Promise(() => undefined) },
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SessionService, useValue: { restaurantId } },
        {
          // Volontairement fidele au vrai service : `loadRestaurant` lit le
          // restaurant deja en memoire avant d'ecrire. Un mock qui ne lirait rien
          // masquerait un rechargement en boucle, qu'ici `http.verify()` attrape.
          provide: RestaurantService,
          useValue: {
            restaurant,
            loadRestaurant: (id: string) => {
              if (restaurant()?.id === id) return;
              restaurant.set({ id, name: 'Le Bistrot du Coin' });
            },
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

  // Quand rien n'est publie, le bandeau de la page propose deja la publication :
  // un second bouton dans la section ferait deux fois la meme chose a l'ecran.
  it('rien n est publie : un seul bouton de publication dans toute la page', async () => {
    await render(dto({ mode: 'none', files: [PDF] }));
    expect(fixture.nativeElement.querySelector('[data-testid="publish-current"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="publish-inline"]')).toBeNull();
  });

  it('un PDF depose mais pas publie : le bandeau propose de publier, puis disparait', async () => {
    await render(dto({ mode: 'none', files: [PDF] }));
    const button: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="publish-current"]',
    );
    expect(button.textContent).toContain('Publier le PDF');
    button.click();
    await fixture.whenStable();
    http.expectOne((r) => r.method === 'PUT').flush(dto({ mode: 'pdf', files: [PDF] }));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-testid="publish-current"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Vos clients voient votre carte en PDF');
  });

  // Un autre format est en ligne : le bandeau de la page ne propose pas celui-ci,
  // donc c'est la section qui porte le bouton. C'est le seul cas ou elle l'affiche.
  it('un autre format est publie : la section porte le bouton, et elle seule', async () => {
    await render(dto({ mode: 'images', files: [PDF, ...IMAGES] }));
    (fixture.nativeElement.querySelector('[data-testid="mode-pdf"]') as HTMLElement).click();
    await fixture.whenStable();

    const inline: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="publish-inline"]',
    );
    expect(inline).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="publish-current"]')).toBeNull();
    expect(inline.textContent).toContain("Votre PDF est prêt. Il n'est pas encore visible");
  });

  // Une apostrophe dans une interpolation fermait la chaine : Angular ne signale rien et
  // rend le {{ ... }} en texte brut. On verifie donc la phrase entiere, pas un fragment.
  it('le bandeau accorde la phrase au nombre de PDF, sans interpolation brute', async () => {
    await render(dto({ mode: 'images', files: [PDF, ...IMAGES] }));
    (fixture.nativeElement.querySelector('[data-testid="mode-pdf"]') as HTMLElement).click();
    await fixture.whenStable();
    let inline: HTMLElement = fixture.nativeElement.querySelector('[data-testid="publish-inline"]');
    expect(inline.textContent).toContain("Votre PDF est prêt. Il n'est pas encore visible");
    expect(inline.textContent).toContain('Publier le PDF');
    expect(inline.textContent).not.toContain('{{');

    await render(
      dto({ mode: 'images', files: [PDF, { ...PDF, id: 'p2', position: 1 }, ...IMAGES] }),
    );
    (fixture.nativeElement.querySelector('[data-testid="mode-pdf"]') as HTMLElement).click();
    await fixture.whenStable();
    inline = fixture.nativeElement.querySelector('[data-testid="publish-inline"]');
    expect(inline.textContent).toContain('Vos PDF sont prêts. Ils ne sont pas encore visibles');
    expect(inline.textContent).toContain('Publier les PDF');
    expect(inline.textContent).not.toContain('{{');
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

  it('changer de restaurant dans la session recharge la carte et met les QR a jour', async () => {
    // Sinon les deux QR designeraient un restaurant pendant que la carte en
    // affiche un autre : le restaurateur imprimerait le mauvais lien.
    await render(dto({ mode: 'pdf' }));
    const OTHER = '11111111-2222-4333-8444-555555555555';

    restaurantId.set(OTHER);
    await fixture.whenStable();

    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith(`/restaurants/${OTHER}/menu`))
      .flush(dto({ mode: 'manual' }));
    await fixture.whenStable();

    const qrUrls = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="qr-url"]') as NodeListOf<HTMLElement>,
    ).map((el) => el.textContent ?? '');
    expect(qrUrls.join(' ')).toContain(OTHER);
    expect(qrUrls.join(' ')).not.toContain(RID);
    // Et la zone ouverte repart du mode du nouveau restaurant.
    expect(fixture.componentInstance['editing']()).toBe('manual');
  });

  it('une reponse du serveur ne referme pas la zone ouverte par l utilisateur', async () => {
    // Un PDF est publie, mais l utilisateur prepare ses photos. La reponse a la
    // suppression renvoie « mode: pdf » : la zone Photos doit rester ouverte.
    await render(dto({ mode: 'pdf', files: [PDF, ...IMAGES] }));
    (fixture.nativeElement.querySelector('[data-testid="mode-images"]') as HTMLElement).click();
    await fixture.whenStable();
    expect(fixture.componentInstance['editing']()).toBe('images');

    (fixture.nativeElement.querySelector('[data-testid="remove-file-a"]') as HTMLElement).click();
    await fixture.whenStable();
    (
      fixture.nativeElement.querySelector('[data-testid="confirm-remove-file"]') as HTMLElement
    ).click();
    await fixture.whenStable();
    http
      .expectOne((r) => r.method === 'DELETE')
      .flush(dto({ mode: 'pdf', files: [PDF, IMAGES[1]] }));
    await fixture.whenStable();

    expect(fixture.componentInstance['editing']()).toBe('images');
    expect(fixture.nativeElement.querySelector('[aria-label="Carte en photos"]')).not.toBeNull();
  });

  it('une reponse du serveur ne fait pas reculer la saisie en cours', async () => {
    await render(dto({ mode: 'manual' }));
    const typed = withManualKeys({
      version: 1,
      sections: [{ name: 'Entrees', items: [{ name: 'Soupe', price: '8.00', description: '' }] }],
    });
    fixture.componentInstance['onManualChange'](typed);
    await fixture.whenStable();

    // Le serveur repond avec la version d avant la frappe : elle ne doit pas
    // remplacer ce que l utilisateur a sous les yeux.
    const put = await vi.waitFor(() => http.expectOne((r) => r.method === 'PUT'));
    put.flush(dto({ mode: 'manual', manual: { version: 1, sections: [] } }));
    await fixture.whenStable();

    expect(fixture.componentInstance['draft']().sections).toHaveLength(1);
    expect(fixture.componentInstance['draft']().sections[0].name).toBe('Entrees');
  });

  // Recharger le MEME restaurant doit repartir de la carte fraiche. Sinon le
  // brouillon affiche garde l'ancienne saisie, et la premiere frappe la renvoie
  // au serveur par-dessus l'etat reel.
  it('recharger le meme restaurant repart de la carte du serveur', async () => {
    const avant = withManualKeys({ version: 1, sections: [{ name: 'Avant', items: [] }] });
    const apres = withManualKeys({ version: 1, sections: [{ name: 'Apres', items: [] }] });
    await render(dto({ mode: 'manual', manual: avant }));
    expect(fixture.componentInstance['draft']().sections[0].name).toBe('Avant');

    fixture.componentInstance['retry']();
    await fixture.whenStable();
    http.expectOne((r) => r.method === 'GET').flush(dto({ mode: 'manual', manual: apres }));
    await fixture.whenStable();

    expect(fixture.componentInstance['draft']().sections[0].name).toBe('Apres');
  });
});
