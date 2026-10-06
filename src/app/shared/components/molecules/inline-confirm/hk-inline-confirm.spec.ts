import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { HkInlineConfirm } from './hk-inline-confirm';

/**
 * Une confirmation destructive doit etre annulable au clavier et prendre le focus :
 * sinon l'utilisateur qui navigue au clavier la rate, ou ne peut plus en sortir.
 */
describe('HkInlineConfirm', () => {
  let fixture: ComponentFixture<HkInlineConfirm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HkInlineConfirm],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(HkInlineConfirm);
    fixture.componentRef.setInput('question', 'Supprimer ce PDF ?');
    fixture.componentRef.setInput('confirmTestId', 'confirm-remove-file');
    fixture.autoDetectChanges();
    await fixture.whenStable();
  });

  it('pose la question et signale une alerte aux lecteurs d ecran', () => {
    const box: HTMLElement = fixture.nativeElement.querySelector('[role="alert"]');
    expect(box).not.toBeNull();
    expect(box.textContent).toContain('Supprimer ce PDF ?');
  });

  it('confirmer et annuler annoncent chacun leur intention, sans rien faire d autre', async () => {
    const confirmed = vi.fn();
    const cancelled = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.cancelled.subscribe(cancelled);

    const buttons: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    buttons[0].click();
    await fixture.whenStable();
    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalled();

    buttons[1].click();
    await fixture.whenStable();
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it('Echap annule : une action destructive reste toujours reversible au clavier', async () => {
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);

    fixture.nativeElement
      .querySelector('[role="alert"]')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it('le libelle de confirmation est adaptable', async () => {
    fixture.componentRef.setInput('confirmLabel', 'Dépublier');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Dépublier');
  });

  // L'en-tete de ce fichier promet que la confirmation prend le focus : sans ce
  // test, c'est le comportement le plus fragile du composant qui n'est pas couvert.
  it('prend le focus a l ouverture, pour ne pas perdre la navigation au clavier', async () => {
    const active = document.activeElement as HTMLElement | null;
    expect(active).not.toBeNull();
    expect(active!.tagName.toLowerCase()).toBe('button');
    expect(fixture.nativeElement.contains(active)).toBe(true);
  });

  it('annuler est visable en test sans dependre du mot « Annuler »', () => {
    const cancel = fixture.nativeElement.querySelector('[data-testid="cancel-remove-file"]');
    expect(cancel).not.toBeNull();
  });

  it('pendant un enregistrement, ni confirmer ni annuler ne repartent', async () => {
    // Confirmer deux fois une suppression l'enverrait deux fois au serveur.
    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    );
    expect(buttons).toHaveLength(2);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });
});
