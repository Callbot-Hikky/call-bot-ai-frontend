import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { HkPublishBanner } from './hk-publish-banner';

/**
 * Ce bandeau annonce un format pret mais pas encore visible par les clients.
 * Il doit se faire entendre des lecteurs d'ecran sans interrompre la saisie, et
 * ne proposer la publication qu'une fois : un double envoi republierait la carte.
 */
describe('HkPublishBanner', () => {
  let fixture: ComponentFixture<HkPublishBanner>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HkPublishBanner],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(HkPublishBanner);
    fixture.componentRef.setInput('message', 'Vos photos sont prêtes.');
    fixture.componentRef.setInput('actionLabel', 'Publier les photos');
    fixture.autoDetectChanges();
    await fixture.whenStable();
  });

  it('annonce l etat sans voler le focus', () => {
    const box: HTMLElement = fixture.nativeElement.querySelector('[data-testid="publish-inline"]');
    expect(box).not.toBeNull();
    // « status » et non « alert » : l'information est utile, pas urgente.
    expect(box.getAttribute('role')).toBe('status');
    expect(box.textContent).toContain('Vos photos sont prêtes.');
  });

  it('le bouton porte le libelle du format et demande la publication', async () => {
    const asked = vi.fn();
    fixture.componentInstance.publishAsked.subscribe(asked);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.textContent).toContain('Publier les photos');

    button.click();
    await fixture.whenStable();
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('pendant un enregistrement, le bouton ne repart pas', async () => {
    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.disabled).toBe(true);
  });
});
