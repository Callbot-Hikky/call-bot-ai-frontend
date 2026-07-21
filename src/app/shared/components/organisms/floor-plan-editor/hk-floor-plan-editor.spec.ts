import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HkFloorPlanEditor } from './hk-floor-plan-editor';
import { HkFloorPlanEditorCanvas, TableGeometry } from './hk-floor-plan-editor-canvas';
import { FloorPlanService } from '@core/services/floor-plan.service';
import { TableService } from '@core/services/table.service';
import { ToastService } from '@core/services/toast.service';
import { EditorTable, WallSegment } from '@core/models/floor-plan-editor.model';
import { Reservation } from '@core/models/reservation.model';
import { TableDto } from '@core/models/table.model';
import { PascalCandidate } from '@core/models/pascal-import.model';
import { PascalImportPayload } from './hk-pascal-import';

// Stub du canvas Konva (idem hk-floor-plan.spec) : Konva exige un vrai <canvas>
// indisponible en jsdom. On expose les memes inputs/outputs pour piloter l'orchestration.
@Component({
  selector: 'hk-floor-plan-editor-canvas',
  template: `<div class="canvas-stub">{{ tables().length }}</div>`,
})
class CanvasStub {
  readonly tables = input<EditorTable[]>([]);
  readonly walls = input<WallSegment[]>([]);
  readonly selectedIds = input<readonly string[]>([]);
  readonly snap = input(true);
  readonly wallMode = input(false);
  readonly selectionChange = output<string[]>();
  readonly geometryChange = output<TableGeometry[]>();
  readonly wallAdded = output<WallSegment>();
  readonly wallRemoved = output<number>();
}

// Restaurant UNIQUE par test : l'autosave (600 ms) d'un test precedent peut tirer
// pendant le test suivant ; une cle localStorage distincte isole chaque cas.
let seq = 0;
let RESTAURANT = 'rest-editor-spec';

// Tables REELLES renvoyees par le back (GET /api/tables) : l'editeur est seme
// depuis elles, avec leurs ids back.
const TABLE_DTOS: TableDto[] = [
  { id: 't1', restaurantId: RESTAURANT, name: 'T1', capacity: 2, zone: 'Salle', isActive: true },
  { id: 't2', restaurantId: RESTAURANT, name: 'T2', capacity: 4, zone: 'Salle', isActive: true },
  { id: 't3', restaurantId: RESTAURANT, name: 'T3', capacity: 6, zone: 'Salle', isActive: true },
];

function reservation(id: string, status: Reservation['status'], tableId: string): Reservation {
  return {
    id,
    customerName: `Client ${id}`,
    phone: '+33 6 00 00 00 00',
    dateTime: '2026-07-02T20:00:00+02:00',
    partySize: 2,
    table: { id: tableId, name: tableId.toUpperCase(), capacity: 4 },
    status,
    source: 'manual',
  };
}

@Component({
  selector: 'hk-editor-host',
  imports: [HkFloorPlanEditor],
  template: `
    <hk-floor-plan-editor
      [restaurantId]="restaurantId"
      [reservations]="reservations"
      (closed)="finished = true"
    />
  `,
})
class HostComponent {
  restaurantId = RESTAURANT;
  reservations: Reservation[] = [];
  finished = false;
}

type Fixture = ReturnType<typeof TestBed.createComponent<HostComponent>>;

function findCanvas(fixture: Fixture): CanvasStub {
  return fixture.debugElement.query((el) => el.componentInstance instanceof CanvasStub)
    .componentInstance as CanvasStub;
}

// Declenche un import applique, comme le ferait le dialogue Pascal une fois
// l'apercu valide. `mode` distingue « ajouter » de « remplacer ».
function importInto(
  fixture: Fixture,
  mode: 'add' | 'replace',
  walls: WallSegment[] = [],
  tables: PascalCandidate[] = [
    {
      key: 'k1',
      label: 'Dining Table',
      isTable: true,
      x: 0.5,
      y: 0.5,
      w: 0.12,
      h: 0.1,
      rotation: 0,
      shape: 'rect',
      capacity: 4,
      widthM: 1.6,
      depthM: 0.9,
    },
  ],
): void {
  const editor = fixture.debugElement.query(
    (el) => el.componentInstance instanceof HkFloorPlanEditor,
  ).componentInstance as HkFloorPlanEditor;
  (editor as unknown as { onImported(p: PascalImportPayload): void }).onImported({
    tables,
    walls,
    mode,
  });
}

function findButton(fixture: Fixture, text: string): HTMLButtonElement {
  const buttons = Array.from(
    fixture.nativeElement.querySelectorAll('button'),
  ) as HTMLButtonElement[];
  const btn = buttons.find((b) => b.textContent?.includes(text));
  if (!btn) {
    throw new Error(`bouton "${text}" introuvable`);
  }
  return btn;
}

describe('HkFloorPlanEditor (bridge tables reelles)', () => {
  let store: FloorPlanService;
  let tables: TableService;
  let toast: ToastService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    RESTAURANT = `rest-editor-spec-${++seq}`;
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
      .overrideComponent(HkFloorPlanEditor, {
        remove: { imports: [HkFloorPlanEditorCanvas] },
        add: { imports: [CanvasStub] },
      })
      .compileComponents();
    store = TestBed.inject(FloorPlanService);
    tables = TestBed.inject(TableService);
    toast = TestBed.inject(ToastService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => localStorage.clear());

  // Ouvre l'editeur : cree le composant et flush le GET /tables initial.
  async function open(host?: (h: HostComponent) => void): Promise<Fixture> {
    const fixture = TestBed.createComponent(HostComponent);
    if (host) {
      host(fixture.componentInstance);
    }
    await fixture.whenStable();
    httpMock.expectOne((r) => r.method === 'GET' && r.url.includes('/tables')).flush(TABLE_DTOS);
    await fixture.whenStable();
    return fixture;
  }

  it('affiche l ecran de demarrage (templates) quand aucun plan sauvegarde', async () => {
    const fixture = await open();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Mettre en page la salle');
    expect(fixture.nativeElement.querySelector('[data-testid="template-bistrot"]')).toBeTruthy();
  });

  it('mode murs : trace, annule le dernier, efface tout', async () => {
    const fixture = await open();
    // Sortir de l'ecran templates : applique la grille auto.
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    el.querySelector<HTMLButtonElement>('[data-testid="toggle-walls"]')!.click();
    await fixture.whenStable();
    // Aide contextuelle visible + canvas averti du mode.
    expect(el.querySelector('[data-testid="wall-hint"]')).toBeTruthy();
    const canvas = findCanvas(fixture);
    expect(canvas.wallMode()).toBe(true);

    // Le canvas emet deux murs traces -> persistes dans le plan.
    canvas.wallAdded.emit({ x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.1, thickness: 0.02 });
    canvas.wallAdded.emit({ x1: 0.9, y1: 0.1, x2: 0.9, y2: 0.9, thickness: 0.02 });
    await fixture.whenStable();
    expect(store.walls().length).toBe(2);

    // Annuler le dernier -> il reste 1 ; tout effacer -> 0.
    el.querySelector<HTMLButtonElement>('[data-testid="undo-wall"]')!.click();
    await fixture.whenStable();
    expect(store.walls().length).toBe(1);
    el.querySelector<HTMLButtonElement>('[data-testid="clear-walls"]')!.click();
    await fixture.whenStable();
    expect(store.walls().length).toBe(0);
  });

  it('un clic sur un mur (via wallRemoved) le supprime, avec annulation', async () => {
    const fixture = await open();
    // Sortir de l'ecran templates : applique la grille auto.
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();
    const store = TestBed.inject(FloorPlanService);

    const canvas = findCanvas(fixture);
    canvas.wallAdded.emit({ x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.1, thickness: 0.02 });
    canvas.wallAdded.emit({ x1: 0.9, y1: 0.1, x2: 0.9, y2: 0.9, thickness: 0.02 });
    await fixture.whenStable();
    expect(store.walls().length).toBe(2);

    // Le canvas signale le clic sur le PREMIER mur -> il est retire.
    canvas.wallRemoved.emit(0);
    await fixture.whenStable();
    expect(store.walls().length).toBe(1);
    expect(store.walls()[0].y2).toBe(0.9); // le second mur subsiste.

    // Le toast propose l'annulation -> les deux murs reviennent.
    const toast = TestBed.inject(ToastService);
    toast.toasts()[0].action!.run();
    await fixture.whenStable();
    expect(store.walls().length).toBe(2);
  });

  it('un template dispose les tables EXISTANTES et CREE les emplacements manquants', async () => {
    const fixture = await open();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="template-bistrot"]',
    );
    btn.click();
    await fixture.whenStable();

    // Les 3 tables existantes recoivent la geometrie des premiers emplacements.
    expect(store.geometry()['t1'].shape).toBe('round');
    expect(store.geometry()['t2']).toBeTruthy();
    expect(store.geometry()['t3']).toBeTruthy();

    // Bistrot a 12 emplacements : les 9 manquants sont crees (POST sequentiels).
    let created = 0;
    let pending = httpMock.match((r) => r.method === 'POST' && r.url.endsWith('/tables'));
    while (pending.length > 0) {
      pending[0].flush({
        id: `t-tpl-${created}`,
        restaurantId: RESTAURANT,
        name: `T${created + 4}`,
        capacity: 2,
        isActive: true,
      });
      created++;
      await fixture.whenStable();
      pending = httpMock.match((r) => r.method === 'POST' && r.url.endsWith('/tables'));
    }
    expect(created).toBe(9);
    expect(Object.keys(store.geometry()).length).toBe(12);
  });

  it('seme la geometrie manquante (auto-grille) pour toutes les tables reelles', async () => {
    const fixture = await open();
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();

    // Grille automatique : aucune geometrie posee par le template, mais le semis
    // complete chaque table reelle (positions stables persistees).
    expect(Object.keys(store.geometry()).sort()).toEqual(['t1', 't2', 't3']);
  });

  it('un preset CREE une vraie table (POST /api/tables) puis pose sa geometrie', async () => {
    const fixture = await open();
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();

    fixture.nativeElement.querySelector('[data-testid="preset-square-4"]').click();
    await fixture.whenStable();

    const req = httpMock.expectOne((r) => r.method === 'POST' && r.url.endsWith('/tables'));
    // Prochain « Tn » libre (T1..T3 existent) + capacity du preset.
    expect(req.request.body).toMatchObject({ name: 'T4', capacity: 4 });
    req.flush({ id: 't-new', restaurantId: RESTAURANT, name: 'T4', capacity: 4, isActive: true });
    await fixture.whenStable();

    expect(tables.tables().some((t) => t.id === 't-new')).toBe(true);
    expect(store.geometry()['t-new']).toBeTruthy();
    expect(store.geometry()['t-new'].shape).toBe('square');
    // La table creee est selectionnee.
    expect(findCanvas(fixture).selectedIds()).toEqual(['t-new']);
  });

  it('echec du POST : toast d erreur et AUCUNE table fantome', async () => {
    const fixture = await open();
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();
    const before = Object.keys(store.geometry()).length;

    fixture.nativeElement.querySelector('[data-testid="preset-round-2"]').click();
    await fixture.whenStable();
    httpMock
      .expectOne((r) => r.method === 'POST')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(Object.keys(store.geometry()).length).toBe(before);
    expect(tables.tables().length).toBe(3);
    expect(toast.toasts().some((t) => t.variant === 'error')).toBe(true);
  });

  it('generer une rangee CREE 4 vraies tables (POST sequentiels, noms Tn successifs)', async () => {
    const fixture = await open();
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();

    findButton(fixture, 'Générer une rangée').click();
    await fixture.whenStable();

    // POST sequentiels : chaque nom est calcule apres la reponse du precedent.
    for (let i = 0; i < 4; i++) {
      const req = httpMock.expectOne((r) => r.method === 'POST' && r.url.endsWith('/tables'));
      const name = (req.request.body as { name: string }).name;
      expect(name).toBe(`T${4 + i}`);
      req.flush({
        id: `t-row-${i}`,
        restaurantId: RESTAURANT,
        name,
        capacity: 4,
        isActive: true,
      });
      await fixture.whenStable();
    }

    expect(tables.tables().length).toBe(7);
    // Les 4 nouvelles ont une geometrie alignee (meme y).
    const ys = new Set([0, 1, 2, 3].map((i) => store.geometry()[`t-row-${i}`].y));
    expect(ys.size).toBe(1);
  });

  it('supprimer est BLOQUE si une reservation du jour reference la table', async () => {
    const fixture = await open((h) => {
      h.reservations = [reservation('r1', 'confirmed', 't1')];
    });
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();

    findCanvas(fixture).selectionChange.emit(['t1']);
    await fixture.whenStable();
    findButton(fixture, 'Supprimer').click();
    await fixture.whenStable();

    // Aucun DELETE ; message demandant de reaffecter d'abord.
    httpMock.expectNone((r) => r.method === 'DELETE');
    expect(tables.tables().some((t) => t.id === 't1')).toBe(true);
    expect(toast.toasts().some((t) => t.message.includes('réaffectez'))).toBe(true);
  });

  // IMPORT « REMPLACER » : chemin le plus destructif de l'editeur. Il doit
  // respecter le MEME garde-fou que la suppression manuelle, sinon l'import
  // devient une porte derobee pour supprimer une table attendue par un client.
  it('import « remplacer » : vide la salle mais epargne une table reservee', async () => {
    const fixture = await open((h) => {
      h.reservations = [reservation('r1', 'seated', 't2')];
    });
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();

    importInto(fixture, 'replace', []);
    await fixture.whenStable();

    // t1 et t3 partent, t2 reste : elle porte une reservation en cours.
    for (const id of ['t1', 't3']) {
      httpMock
        .expectOne((r) => r.method === 'DELETE' && r.url.endsWith(`/tables/${id}`))
        .flush(null);
    }
    httpMock.expectNone((r) => r.method === 'DELETE' && r.url.endsWith('/tables/t2'));
    await fixture.whenStable();

    expect(tables.tables().some((t) => t.id === 't2')).toBe(true);
    expect(toast.toasts().some((t) => t.message.includes('conservée'))).toBe(true);
  });

  // Un plan importe vient du VRAI restaurant : des tables qui se touchent de
  // quelques centimetres (rangee le long d'une banquette) sont normales.
  // L'anti-empilement les repoussait, ce qui deplacait les tables loin de leur
  // place et en superposait certaines.
  it('import : les tables sont posees EXACTEMENT ou le plan les place', async () => {
    const fixture = await open();
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();

    // Deux tables volontairement TRES proches (elles se toucheraient).
    const proche = (key: string, x: number): PascalCandidate => ({
      key,
      label: 'Dining Table',
      isTable: true,
      x,
      y: 0.5,
      w: 0.12,
      h: 0.1,
      rotation: 0,
      shape: 'rect',
      capacity: 4,
      widthM: 2,
      depthM: 0.9,
    });
    importInto(fixture, 'add', [], [proche('k1', 0.4), proche('k2', 0.44)]);
    await fixture.whenStable();

    // Creations SEQUENTIELLES : le POST suivant n'part qu'apres la reponse du
    // precedent (les noms « Tn » doivent se suivre).
    for (let i = 0; i < 2; i++) {
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.includes('/tables'))
        .flush({
          id: `imp${i}`,
          restaurantId: RESTAURANT,
          name: `T${10 + i}`,
          capacity: 4,
          zone: null,
          isActive: true,
        });
      await fixture.whenStable();
    }

    const geo = store.geometry();
    expect(geo['imp0'].x).toBeCloseTo(0.4, 6);
    expect(geo['imp1'].x).toBeCloseTo(0.44, 6);
    expect(geo['imp0'].y).toBeCloseTo(0.5, 6);
  });

  // Le placement issu d'un plan 3D demande souvent des retouches : on le dit en
  // fenetre, un bandeau passait inapercu.
  it('import : une fenetre previent que les tables sont deplacables', async () => {
    const fixture = await open();
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-testid="import-done-dialog"]')).toBeNull();

    importInto(fixture, 'add', []);
    await fixture.whenStable();

    const dialog = fixture.nativeElement.querySelector('[data-testid="import-done-dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain('glissez');

    fixture.nativeElement.querySelector('[data-testid="import-done-ok"]').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-testid="import-done-dialog"]')).toBeNull();
  });

  it('import « ajouter » : ne supprime aucune table existante', async () => {
    const fixture = await open();
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();

    importInto(fixture, 'add', []);
    await fixture.whenStable();

    httpMock.expectNone((r) => r.method === 'DELETE');
  });

  // Un import de MURS SEULS en mode remplacer ne doit pas vider la salle : cette
  // suppression-la n'a aucune annulation. Les murs, eux, sont bien poses.
  it('import « remplacer » de murs seuls ne supprime aucune table', async () => {
    const fixture = await open();
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();
    const avant = tables.tables().length;

    importInto(fixture, 'replace', [{ x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.1, thickness: 0.02 }], []);
    await fixture.whenStable();

    httpMock.expectNone((r) => r.method === 'DELETE');
    expect(tables.tables().length).toBe(avant);
    expect(store.walls().length).toBe(1);
  });

  it('supprimer une table sans reservation : DELETE + retrait de la geometrie', async () => {
    const fixture = await open((h) => {
      h.reservations = [reservation('r1', 'confirmed', 't1')];
    });
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();

    findCanvas(fixture).selectionChange.emit(['t2']);
    await fixture.whenStable();
    findButton(fixture, 'Supprimer').click();
    await fixture.whenStable();

    const req = httpMock.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/tables/t2'));
    req.flush(null);
    await fixture.whenStable();

    expect(tables.tables().some((t) => t.id === 't2')).toBe(false);
    expect(store.geometry()['t2']).toBeUndefined();
  });

  it('annuler la creation (toast) : DELETE la table et retire sa geometrie', async () => {
    const fixture = await open();
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();

    fixture.nativeElement.querySelector('[data-testid="preset-square-4"]').click();
    await fixture.whenStable();
    httpMock
      .expectOne((r) => r.method === 'POST' && r.url.endsWith('/tables'))
      .flush({ id: 't-new', restaurantId: RESTAURANT, name: 'T4', capacity: 4, isActive: true });
    await fixture.whenStable();

    // Un toast « ajoutée » propose l'annulation : on la declenche.
    const added = toast.toasts().find((t) => t.message.includes('ajoutée'));
    expect(added?.action).toBeTruthy();
    added!.action!.run();
    await fixture.whenStable();

    httpMock.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/tables/t-new')).flush(null);
    await fixture.whenStable();

    expect(tables.tables().some((t) => t.id === 't-new')).toBe(false);
    expect(store.geometry()['t-new']).toBeUndefined();
  });

  it('annuler la suppression (toast) : POST recree la table et sa geometrie', async () => {
    const fixture = await open((h) => {
      h.reservations = [reservation('r1', 'confirmed', 't1')];
    });
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();

    const originalName = tables.tables().find((t) => t.id === 't2')!.name;

    findCanvas(fixture).selectionChange.emit(['t2']);
    await fixture.whenStable();
    findButton(fixture, 'Supprimer').click();
    await fixture.whenStable();
    httpMock.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/tables/t2')).flush(null);
    await fixture.whenStable();
    expect(tables.tables().some((t) => t.id === 't2')).toBe(false);

    // Un toast « supprimée » propose l'annulation : elle recree la table.
    const removed = toast.toasts().find((t) => t.message.includes('supprimée'));
    expect(removed?.action).toBeTruthy();
    removed!.action!.run();
    await fixture.whenStable();

    const req = httpMock.expectOne((r) => r.method === 'POST' && r.url.endsWith('/tables'));
    expect(req.request.body).toMatchObject({ name: originalName });
    req.flush({
      id: 't2-bis',
      restaurantId: RESTAURANT,
      name: originalName,
      capacity: 2,
      isActive: true,
    });
    await fixture.whenStable();

    expect(tables.tables().some((t) => t.id === 't2-bis')).toBe(true);
    expect(store.geometry()['t2-bis']).toBeTruthy();
  });

  it('renommer (panneau proprietes) declenche un PUT /tables/{id} apres debounce', async () => {
    const fixture = await open();
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();

    findCanvas(fixture).selectionChange.emit(['t1']);
    await fixture.whenStable();

    const inputEl = fixture.nativeElement.querySelector(
      '[data-testid="prop-label"]',
    ) as HTMLInputElement;
    expect(inputEl.value).toBe('T1'); // nom issu de la table BACK.
    inputEl.value = 'Terrasse 1';
    inputEl.dispatchEvent(new Event('input'));

    // Debounce : pas de requete immediate vers les TABLES (le plan, lui, peut
    // avoir son propre PUT /floor-plans d'autosave - hors sujet ici).
    httpMock.expectNone((r) => r.method === 'PUT' && r.url.includes('/tables'));
    await new Promise((resolve) => setTimeout(resolve, 500));

    const req = httpMock.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/tables/t1'));
    expect(req.request.body).toMatchObject({ name: 'Terrasse 1', capacity: 2 });
    req.flush({
      id: 't1',
      restaurantId: RESTAURANT,
      name: 'Terrasse 1',
      capacity: 2,
      isActive: true,
    });
    await fixture.whenStable();

    expect(tables.tables().find((t) => t.id === 't1')?.name).toBe('Terrasse 1');
  });

  it('geometryChange du canvas met a jour la geometrie (commit)', async () => {
    const fixture = await open();
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();

    findCanvas(fixture).geometryChange.emit([
      { id: 't1', x: 0.2, y: 0.3, width: 0.12, height: 0.12, rotation: 90 },
    ]);
    await fixture.whenStable();

    const geo = store.geometry()['t1'];
    expect(geo.x).toBeCloseTo(0.2, 5);
    expect(geo.rotation).toBe(90);
    expect(store.canUndo()).toBe(true);
  });

  it('Terminer sauvegarde et emet closed', async () => {
    const fixture = await open();
    fixture.nativeElement.querySelector('[data-testid="template-blank"]').click();
    await fixture.whenStable();

    findButton(fixture, 'Terminer').click();
    await fixture.whenStable();

    expect(fixture.componentInstance.finished).toBe(true);
    // saveNow() a emis le PUT /floor-plans (mode reel en test) : on le sert.
    httpMock.match((r) => r.url.includes('/floor-plans')).forEach((req) => req.flush({}));
    expect(store.saveState()).toBe('saved');
  });
});
