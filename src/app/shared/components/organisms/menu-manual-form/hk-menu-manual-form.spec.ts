import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { HkMenuManualForm } from './hk-menu-manual-form';
import {
  MANUAL_LIMITS,
  ManualMenu,
  addItem,
  addSection,
  emptyManual,
} from '@core/models/menu.model';

describe('HkMenuManualForm', () => {
  let fixture: ComponentFixture<HkMenuManualForm>;
  let component: HkMenuManualForm;
  let changes: ManualMenu[];

  async function setMenu(menu: ManualMenu): Promise<void> {
    fixture.componentRef.setInput('menu', menu);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HkMenuManualForm],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(HkMenuManualForm);
    component = fixture.componentInstance;
    changes = [];
    component.menu.subscribe((m) => changes.push(m));
    await setMenu(emptyManual());
  });

  it('affiche un etat vide avec le bouton d ajout de section', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Ajouter une section');
  });

  it('ajouter une section et un plat met a jour le modele', async () => {
    (
      fixture.nativeElement.querySelector('[data-testid="add-section"]') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    expect(component.menu().sections).toHaveLength(1);

    (
      fixture.nativeElement.querySelector('[data-testid="add-item-0"]') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    expect(component.menu().sections[0].items).toHaveLength(1);
    expect(changes.length).toBeGreaterThanOrEqual(2);
  });

  it('la touche Entree dans le nom d un plat ajoute un plat suivant', async () => {
    await setMenu(addItem(addSection(emptyManual(), 'Plats'), 0));
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="item-name-0-0"] input',
    );
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    expect(component.menu().sections[0].items).toHaveLength(2);
  });

  it('affiche les erreurs de validation en francais', async () => {
    await setMenu(addItem(addSection(emptyManual(), ''), 0));
    const errors =
      fixture.nativeElement.querySelector('[data-testid="manual-errors"]')?.textContent ?? '';
    expect(errors).toContain('section 1');
    expect(errors).toContain('plat 1');
  });

  it('desactive l ajout de section a la limite', async () => {
    let menu = emptyManual();
    for (let i = 0; i < MANUAL_LIMITS.sections; i++) {
      menu = addSection(menu, `S${i}`);
    }
    await setMenu(menu);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="add-section"] button',
    );
    expect(button.disabled).toBe(true);
  });

  it('supprimer demande une confirmation inline avant d agir', async () => {
    await setMenu(addSection(emptyManual(), 'Plats'));
    (
      fixture.nativeElement.querySelector('[data-testid="remove-section-0"]') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    expect(component.menu().sections).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Supprimer cette section');
    (
      fixture.nativeElement.querySelector('[data-testid="confirm-remove"]') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    expect(component.menu().sections).toHaveLength(0);
  });

  it('un prix saisi avec une virgule est normalise dans le modele', async () => {
    await setMenu(addItem(addSection(emptyManual(), 'Plats'), 0));
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="item-price-0-0"] input',
    );
    input.value = '18,5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await fixture.whenStable();
    expect(component.menu().sections[0].items[0].price).toBe('18.50');
  });

  it('ne rend jamais de HTML venu du contenu', async () => {
    let menu = addSection(emptyManual(), '<b>Plats</b>');
    menu = addItem(menu, 0);
    await setMenu(menu);
    expect(fixture.nativeElement.querySelector('b')).toBeNull();
  });
});
