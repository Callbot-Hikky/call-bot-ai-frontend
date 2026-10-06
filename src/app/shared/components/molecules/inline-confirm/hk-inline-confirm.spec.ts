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
});
