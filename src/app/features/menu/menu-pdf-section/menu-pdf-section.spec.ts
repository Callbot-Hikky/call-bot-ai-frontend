import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { PDF_LOADER } from '@shared/components/molecules/pdf-pages/hk-pdf-pages';

import { MenuPdfSection } from './menu-pdf-section';
import { MenuFileRow } from '../menu-file-row';

const RID = '40de0820-8f77-408a-aad4-847c889f7ffa';

function row(id: string, position = 0, safe = true): MenuFileRow {
  return {
    file: {
      id,
      kind: 'pdf',
      contentType: 'application/pdf',
      position,
      sizeBytes: 1024,
      url: `/api/restaurants/${RID}/menu/files/${id}`,
    },
    previewUrl: safe ? `/api/restaurants/${RID}/menu/files/${id}` : null,
    size: '1 Ko',
  };
}

describe('MenuPdfSection', () => {
  let fixture: ComponentFixture<MenuPdfSection>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuPdfSection],
      providers: [
        { provide: PDF_LOADER, useValue: () => new Promise(() => undefined) },
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();
  });

  async function render(inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(MenuPdfSection);
    fixture.componentRef.setInput('files', []);
    fixture.componentRef.setInput('accept', ['application/pdf']);
    fixture.componentRef.setInput('maxBytes', 10_000_000);
    fixture.componentRef.setInput('maxCount', 5);
    fixture.componentRef.setInput('pendingText', 'Votre PDF est prêt.');
    fixture.componentRef.setInput('publishLabel', 'Publier le PDF');
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.autoDetectChanges();
    await fixture.whenStable();
  }

  it('sans fichier, propose la zone de depot et rien d autre', async () => {
    await render();
    expect(fixture.nativeElement.querySelector('[data-testid="file-dropzone"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="pdf-row"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="publish-inline"]')).toBeNull();
  });

  // La section ne decide pas d'elle-meme d'offrir la publication : c'est la page
  // qui sait si un autre format est en ligne, donc si ce bouton est le seul.
  it('propose de publier quand la page le demande', async () => {
    await render({ files: [row('a')], canPublishHere: true });
    const banner = fixture.nativeElement.querySelector('[data-testid="publish-inline"]');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Votre PDF est prêt.');
    expect(banner.textContent).toContain('Publier le PDF');
  });

  it('ne propose rien quand la page ne le demande pas', async () => {
    await render({ files: [row('a')], canPublishHere: false });
    expect(fixture.nativeElement.querySelector('[data-testid="publish-inline"]')).toBeNull();
  });

  it('une adresse d apercu invalide n affiche pas de lien mort', async () => {
    await render({ files: [row('a', 0, false)] });
    // Mieux vaut pas de lien du tout qu'un lien visible qui ne mene nulle part.
    expect(fixture.nativeElement.querySelector('[data-testid="open-pdf"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="pdf-row"]')).not.toBeNull();
  });

  // La limite se deduit de la liste et du maximum : la section n'a pas besoin
  // qu'on le lui dise, et ne peut donc pas contredire le compteur qu'elle affiche.
  it('la limite atteinte retire la zone d ajout et le dit', async () => {
    await render({ files: [row('a'), row('b', 1)], maxCount: 2 });
    expect(fixture.nativeElement.textContent).toContain('2/2 PDF');
    expect(fixture.nativeElement.textContent).toContain('Limite de PDF atteinte');
    expect(fixture.nativeElement.querySelector('[data-testid="file-dropzone"]')).toBeNull();
  });

  it('la confirmation ne s ouvre que sur le fichier vise', async () => {
    await render({ files: [row('a'), row('b', 1)], pendingFileId: 'b' });
    expect(fixture.nativeElement.querySelectorAll('hk-inline-confirm').length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Supprimer ce PDF ?');
  });

  it('les actions annoncent, le composant ne decide de rien', async () => {
    await render({ files: [row('a')] });
    const removeAsked = vi.fn();
    fixture.componentInstance.removeAsked.subscribe(removeAsked);

    (fixture.nativeElement.querySelector('[data-testid="remove-file-a"]') as HTMLElement).click();
    await fixture.whenStable();
    expect(removeAsked).toHaveBeenCalledWith('a');
  });
});
