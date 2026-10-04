import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { MenuManualSection } from './menu-manual-section';
import { emptyManual, withManualKeys } from '@core/models/menu.model';

// `withManualKeys` : la meme porte que la lecture du serveur, donc les cles de
// suivi sont posees ici aussi, sans les ecrire a la main dans chaque fixture.
const CARTE = withManualKeys({
  version: 1,
  sections: [{ name: 'Entrées', items: [{ name: 'Soupe', description: '', price: '9.50' }] }],
});

describe('MenuManualSection', () => {
  let fixture: ComponentFixture<MenuManualSection>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuManualSection],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  async function render(inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(MenuManualSection);
    fixture.componentRef.setInput('draft', emptyManual());
    fixture.componentRef.setInput('pendingText', 'Votre carte saisie est prête.');
    fixture.componentRef.setInput('publishLabel', 'Publier la saisie');
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.autoDetectChanges();
    await fixture.whenStable();
  }

  it('une carte vide ne propose pas de publier : il n y aurait rien a montrer', async () => {
    await render({ canPublishHere: true });
    expect(fixture.nativeElement.querySelector('[data-testid="publish-inline"]')).toBeNull();
  });

  it('propose de publier quand la page le demande', async () => {
    await render({ draft: CARTE, canPublishHere: true });
    expect(fixture.nativeElement.querySelector('[data-testid="publish-inline"]')).not.toBeNull();
  });

  it('rappelle que l enregistrement est automatique', async () => {
    await render({ draft: CARTE });
    expect(fixture.nativeElement.textContent).toContain('enregistrées automatiquement');
  });

  it('enregistrer maintenant annonce la demande sans enregistrer lui-meme', async () => {
    await render({ draft: CARTE });
    const asked = vi.fn();
    fixture.componentInstance.saveAsked.subscribe(asked);
    (fixture.nativeElement.querySelector('[data-testid="save-manual"]') as HTMLElement).click();
    await fixture.whenStable();
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('pendant un enregistrement, le bouton est inerte', async () => {
    await render({ draft: CARTE, busy: true });
    // Le data-testid est porte par le composant, le vrai bouton est a l'interieur.
    const button: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="save-manual"] button',
    );
    expect(button.disabled).toBe(true);
  });
});
