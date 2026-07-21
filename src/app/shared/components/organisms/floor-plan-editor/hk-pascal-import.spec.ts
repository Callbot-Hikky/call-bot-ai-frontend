import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HkPascalImport, PascalImportPayload } from './hk-pascal-import';

// Scene minimale : 2 tables + 1 chaise + 1 mur (format export Pascal).
function sceneJson(): string {
  return JSON.stringify({
    nodes: {
      w1: { id: 'w1', type: 'wall', start: [0, 0], end: [8, 0], thickness: 0.2 },
      t1: {
        id: 't1',
        type: 'item',
        position: [2, 0, 2],
        scale: [1, 1, 1],
        asset: { name: 'Dining Table', dimensions: [1.6, 0.75, 0.9] },
      },
      t2: {
        id: 't2',
        type: 'item',
        position: [5, 0, 2],
        scale: [1, 1, 1],
        asset: { name: 'Round Table', dimensions: [1.1, 0.75, 1.1] },
      },
      c1: {
        id: 'c1',
        type: 'item',
        position: [3, 0, 3],
        scale: [1, 1, 1],
        asset: { name: 'Chair', dimensions: [0.45, 0.9, 0.45] },
      },
    },
    rootNodeIds: [],
  });
}

describe('HkPascalImport', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [HkPascalImport],
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(HkPascalImport);
    fixture.detectChanges();
    return fixture;
  }

  it('affiche la zone de depot au depart', () => {
    const fixture = setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="pascal-dropzone"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="pascal-recap"]')).toBeNull();
  });

  it('affiche le recap et pre-coche les tables apres chargement', async () => {
    const fixture = setup();
    fixture.componentInstance.loadText(sceneJson());
    fixture.detectChanges();
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="pascal-recap"]')?.textContent).toContain('3 meuble');
    // 2 tables pre-cochees -> le bouton propose « Importer 2 table(s) ».
    const apply = el.querySelector<HTMLButtonElement>('[data-testid="pascal-apply"]')!;
    expect(apply.textContent).toContain('2');
  });

  it('affiche une erreur utilisateur sur un JSON invalide', async () => {
    const fixture = setup();
    fixture.componentInstance.loadText('nope');
    fixture.detectChanges();
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="pascal-error"]')?.textContent).toContain('JSON');
    // On reste sur la zone de depot pour reessayer.
    expect(el.querySelector('[data-testid="pascal-dropzone"]')).toBeTruthy();
  });

  it('decocher un element le retire de l’import', async () => {
    const fixture = setup();
    fixture.componentInstance.loadText(sceneJson());
    fixture.detectChanges();
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    el.querySelector<HTMLInputElement>('[data-testid="pascal-check-t1"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const apply = el.querySelector<HTMLButtonElement>('[data-testid="pascal-apply"]')!;
    expect(apply.textContent).toContain('1');
  });

  it('emet les tables cochees ET les murs au clic sur Importer', async () => {
    const fixture = setup();
    let emitted: PascalImportPayload | null = null;
    fixture.componentInstance.imported.subscribe((p) => (emitted = p));
    fixture.componentInstance.loadText(sceneJson());
    fixture.detectChanges();
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    el.querySelector<HTMLButtonElement>('[data-testid="pascal-apply"]')!.click();

    expect(emitted).not.toBeNull();
    expect(emitted!.tables.length).toBe(2);
    expect(emitted!.tables.every((c) => c.isTable)).toBe(true);
    // Les murs partent avec l'import (fond de plan).
    expect(emitted!.walls.length).toBe(1);
  });

  it('emet closed au clic sur le fond sombre', () => {
    const fixture = setup();
    let closedEmitted = false;
    fixture.componentInstance.closed.subscribe(() => (closedEmitted = true));

    const el: HTMLElement = fixture.nativeElement;
    (el.querySelector('[role="dialog"]') as HTMLElement).click();

    expect(closedEmitted).toBe(true);
  });
});
