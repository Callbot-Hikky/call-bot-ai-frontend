import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { HkFileRowActions } from './hk-file-row-actions';

/**
 * Les trois actions d'une ligne de fichier. Le composant n'agit pas : il annonce.
 * Les bornes (premier, dernier) et l'enregistrement en cours doivent desactiver
 * ce qui n'a pas de sens, sinon on envoie des ordres impossibles au serveur.
 */
describe('HkFileRowActions', () => {
  let fixture: ComponentFixture<HkFileRowActions>;

  async function render(inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(HkFileRowActions);
    fixture.componentRef.setInput('fileId', 'file-1');
    fixture.componentRef.setInput('label', 'le PDF');
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.autoDetectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HkFileRowActions],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  function button(id: string): HTMLButtonElement {
    return (
      fixture.nativeElement.querySelector(`[data-testid="${id}-file-1"] button`) ??
      fixture.nativeElement.querySelector(`[data-testid="${id}-file-1"]`)
    );
  }

  it('chaque action porte un libelle lisible par un lecteur d ecran', async () => {
    await render();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Monter le PDF');
    expect(text).toContain('Descendre le PDF');
    expect(text).toContain('Supprimer');
  });

  it('monter et descendre annoncent la direction', async () => {
    await render();
    const moved = vi.fn();
    fixture.componentInstance.moved.subscribe(moved);

    button('move-up').click();
    await fixture.whenStable();
    expect(moved).toHaveBeenCalledWith(-1);

    button('move-down').click();
    await fixture.whenStable();
    expect(moved).toHaveBeenCalledWith(1);
  });

  it('le premier ne peut pas monter, le dernier ne peut pas descendre', async () => {
    await render({ first: true, last: false });
    expect(button('move-up').disabled).toBe(true);
    expect(button('move-down').disabled).toBe(false);

    await render({ first: false, last: true });
    expect(button('move-up').disabled).toBe(false);
    expect(button('move-down').disabled).toBe(true);
  });

  it('pendant un enregistrement, les trois actions sont inertes', async () => {
    await render({ busy: true });
    expect(button('move-up').disabled).toBe(true);
    expect(button('move-down').disabled).toBe(true);
    expect(button('remove-file').disabled).toBe(true);
  });

  it('supprimer demande, mais ne supprime pas lui-meme', async () => {
    await render();
    const asked = vi.fn();
    fixture.componentInstance.removeAsked.subscribe(asked);
    button('remove-file').click();
    await fixture.whenStable();
    expect(asked).toHaveBeenCalledTimes(1);
  });
});
