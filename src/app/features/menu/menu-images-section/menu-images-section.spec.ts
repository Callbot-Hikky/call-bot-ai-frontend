import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { MenuImagesSection } from './menu-images-section';
import { MenuFileRow } from '../menu-file-row';

const RID = '40de0820-8f77-408a-aad4-847c889f7ffa';

function row(id: string, position = 0, safe = true): MenuFileRow {
  return {
    file: {
      id,
      kind: 'image',
      contentType: 'image/png',
      position,
      sizeBytes: 2048,
      url: `/api/restaurants/${RID}/menu/files/${id}`,
    },
    previewUrl: safe ? `/api/restaurants/${RID}/menu/files/${id}` : null,
    size: '2 Ko',
  };
}

describe('MenuImagesSection', () => {
  let fixture: ComponentFixture<MenuImagesSection>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuImagesSection],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  async function render(inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(MenuImagesSection);
    fixture.componentRef.setInput('files', []);
    fixture.componentRef.setInput('accept', ['image/png']);
    fixture.componentRef.setInput('maxBytes', 5_000_000);
    fixture.componentRef.setInput('maxCount', 8);
    fixture.componentRef.setInput('pendingText', 'Vos photos sont prêtes.');
    fixture.componentRef.setInput('publishLabel', 'Publier les photos');
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.autoDetectChanges();
    await fixture.whenStable();
  }

  it('affiche les photos dans l ordre recu, avec leur rang', async () => {
    await render({ files: [row('a'), row('b', 1)] });
    const thumbs = fixture.nativeElement.querySelectorAll('[data-testid="image-thumb"]');
    expect(thumbs.length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('1/2');
    expect(fixture.nativeElement.textContent).toContain('2/2');
  });

  it('chaque photo porte une description utile aux lecteurs d ecran', async () => {
    await render({ files: [row('a')] });
    const img: HTMLImageElement = fixture.nativeElement.querySelector(
      '[data-testid="image-thumb"]',
    );
    expect(img.getAttribute('alt')).toContain('Photo 1');
  });

  it('une adresse invalide montre un repli lisible au lieu d une image cassee', async () => {
    await render({ files: [row('a', 0, false)] });
    expect(fixture.nativeElement.querySelector('[data-testid="image-thumb"]')).toBeNull();
    const fallback = fixture.nativeElement.querySelector('[data-testid="image-thumb-unavailable"]');
    expect(fallback).not.toBeNull();
    expect(fallback.textContent).toContain('Aperçu indisponible');
  });

  it('propose de publier quand la page le demande', async () => {
    await render({ files: [row('a')], canPublishHere: true });
    expect(fixture.nativeElement.querySelector('[data-testid="publish-inline"]')).not.toBeNull();
  });

  it('demander la suppression annonce le bon fichier', async () => {
    await render({ files: [row('a'), row('b', 1)] });
    const asked = vi.fn();
    fixture.componentInstance.removeAsked.subscribe(asked);
    (fixture.nativeElement.querySelector('[data-testid="remove-file-b"]') as HTMLElement).click();
    await fixture.whenStable();
    expect(asked).toHaveBeenCalledWith('b');
  });
});
