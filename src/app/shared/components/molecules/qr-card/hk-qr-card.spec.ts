import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { HkQrCard } from './hk-qr-card';

describe('HkQrCard', () => {
  let fixture: ComponentFixture<HkQrCard>;
  const url = 'http://localhost:4200/client/restaurants/40de0820-8f77-408a-aad4-847c889f7ffa/menu';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HkQrCard],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(HkQrCard);
    fixture.componentRef.setInput('title', 'Voir le menu');
    fixture.componentRef.setInput('url', url);
    fixture.componentRef.setInput('fileName', 'menu-chez-hikky');
    await fixture.whenStable();
    // La generation est asynchrone : on attend qu'elle ait produit le SVG.
    await vi.waitFor(() => expect(fixture.componentInstance['svg']()).toContain('<svg'));
    await fixture.whenStable();
  });

  it('affiche le titre et le lien en clair', () => {
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Voir le menu');
    expect(fixture.nativeElement.querySelector('[data-testid="qr-url"]')?.textContent).toContain(
      url,
    );
  });

  it('genere un QR code SVG qui encode exactement le lien', () => {
    const svg: string = fixture.componentInstance['svg']();
    expect(svg.startsWith('<svg')).toBe(true);
    // Le SVG ne contient que des formes : jamais de script, de lien ni de contenu etranger.
    expect(svg).not.toMatch(/<script|<foreignObject|<a\b|javascript:/i);
    expect(fixture.nativeElement.querySelector('[data-testid="qr-url"]').textContent.trim()).toBe(
      url,
    );
  });

  it('affiche le QR dans une image, sans injecter de HTML dans la page', () => {
    // Le dessin passe par une balise <img> et une data: URL, jamais par innerHTML :
    // c'est un contournement de sanitisation en moins. L'assertion ne porte que sur
    // la zone du QR : ailleurs, les icones de l'interface sont des <svg> legitimes,
    // et viser tout le composant ferait passer ce test pour la mauvaise raison.
    const figure: HTMLElement = fixture.nativeElement.querySelector('[data-testid="qr-figure"]');
    const img = figure.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toMatch(/^data:image\/(png|svg\+xml)/);
    expect(figure.querySelector('svg')).toBeNull();
    expect(figure.innerHTML).not.toContain('<svg');
  });

  it('propose les telechargements PNG et SVG avec un nom de fichier parlant', () => {
    const svgLink: HTMLAnchorElement = fixture.nativeElement.querySelector(
      '[data-testid="download-svg"]',
    );
    expect(svgLink.getAttribute('download')).toBe('menu-chez-hikky.svg');
    expect(svgLink.getAttribute('href')).toMatch(/^(blob:|data:image\/svg\+xml)/);
    const pngButton = fixture.nativeElement.querySelector('[data-testid="download-png"]');
    expect(pngButton).not.toBeNull();
  });

  it('copie le lien dans le presse-papiers', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    (fixture.nativeElement.querySelector('[data-testid="copy-url"]') as HTMLElement).click();
    await fixture.whenStable();
    expect(writeText).toHaveBeenCalledWith(url);
    expect(fixture.nativeElement.textContent).toContain('copié');
  });

  it('ouvre la page publique dans un nouvel onglet, sans fuite d opener', () => {
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('[data-testid="open-url"]');
    expect(link.getAttribute('href')).toBe(url);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('une generation qui echoue affiche le message et laisse le lien utilisable', async () => {
    // Une URL trop longue depasse la capacite d'un QR code : la librairie leve.
    // L'ecran doit le dire, pas planter.
    const huge = 'https://exemple.test/' + 'x'.repeat(5000);
    const broken = TestBed.createComponent(HkQrCard);
    broken.componentRef.setInput('title', 'Voir le menu');
    broken.componentRef.setInput('url', huge);
    broken.componentRef.setInput('fileName', 'menu-casse');
    broken.autoDetectChanges();

    await vi.waitFor(() =>
      expect(broken.nativeElement.querySelector('[data-testid="qr-error"]')).not.toBeNull(),
    );
    expect(broken.nativeElement.textContent).toContain('Le lien reste valable');
    // Le lien lui-meme reste affiche et copiable.
    expect(broken.nativeElement.querySelector('[data-testid="qr-url"]')?.textContent).toContain(
      huge,
    );
  });
});
