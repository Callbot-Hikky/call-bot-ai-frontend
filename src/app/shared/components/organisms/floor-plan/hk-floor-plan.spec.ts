import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HkFloorPlan } from './hk-floor-plan';
import { HkFloorPlanCanvas } from './hk-floor-plan-canvas';
import { ToastService } from '@core/services/toast.service';
import { Reservation } from '@core/models/reservation.model';
import { FloorTable } from '@core/models/table.model';
import { FloorTableView } from '@core/models/floor-plan.model';
import { GeometryMap, WallSegment } from '@core/models/floor-plan-editor.model';

// Stub du canvas Konva : Konva a besoin d'un vrai <canvas> (indispo en jsdom sans
// le paquet `canvas`, qu'on n'ajoute pas). On remplace donc le canvas par un double
// qui expose les memes inputs/outputs pour tester l'orchestration.
@Component({
  selector: 'hk-floor-plan-canvas',
  template: `<div class="canvas-stub">{{ tables().length }}</div>`,
})
class CanvasStub {
  readonly tables = input<FloorTableView[]>([]);
  readonly walls = input<WallSegment[]>([]);
  readonly highlightFree = input(false);
  readonly bestTableId = input<string | null>(null);
  readonly requiredSeats = input<number | null>(null);
  readonly focusTableId = input<string | null>(null);
  readonly fill = input(false);
  readonly showNames = input(false);
  readonly tableClick = output<FloorTableView>();
}

// Heure de reservation relative a MAINTENANT : la derivation est desormais
// TEMPORELLE (fenetre active [t − 45 min, t + 120 min]), le composant capture
// new Date() — les fixtures doivent donc vivre autour de l'heure du test.
function isoIn(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function reservation(
  id: string,
  status: Reservation['status'],
  tableId: string | null,
  partySize = 2,
  dateTime = isoIn(0),
): Reservation {
  return {
    id,
    customerName: `Client ${id}`,
    phone: '+33 6 00 00 00 00',
    dateTime,
    partySize,
    table: tableId ? { id: tableId, name: tableId.toUpperCase(), capacity: 4 } : undefined,
    status,
    source: 'manual',
  };
}

const TABLES: FloorTable[] = [
  { id: 't1', name: 'T1', capacity: 2, isActive: true },
  { id: 't2', name: 'T2', capacity: 4, isActive: true },
  { id: 't3', name: 'T3', capacity: 4, isActive: true },
];

@Component({
  selector: 'hk-floor-plan-host',
  imports: [HkFloorPlan],
  template: `
    <hk-floor-plan
      [reservations]="reservations"
      [tables]="tables"
      [geometry]="geometry"
      [serviceMode]="serviceMode"
      [(selectedTableId)]="selectedTableId"
      (assign)="recordAssign($event)"
      (mergeAssign)="merged = $event.reservationId + ':' + $event.tableIds.join('+')"
      (walkIn)="walkIn = $event.table.id + ':' + $event.partySize"
      (enterService)="entered = entered + 1"
    />
  `,
})
class HostComponent {
  reservations: Reservation[] = [];
  tables: FloorTable[] = TABLES;
  geometry: GeometryMap = {};
  serviceMode = false;
  // Selection detenue par l'hote (comme la page) : survit aux re-instanciations.
  selectedTableId: string | null = null;
  assigned = '';
  assigns: string[] = [];
  merged = '';
  walkIn = '';
  entered = 0;

  recordAssign(event: { reservationId: string; table: FloorTable }): void {
    this.assigned = `${event.reservationId}:${event.table.id}`;
    this.assigns.push(this.assigned);
  }
}

describe('HkFloorPlan', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] })
      .overrideComponent(HkFloorPlan, {
        remove: { imports: [HkFloorPlanCanvas] },
        add: { imports: [CanvasStub] },
      })
      .compileComponents();
  });

  it('passe le bon nombre de tables au canvas', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.reservations = [reservation('r1', 'confirmed', 't1')];
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    expect(stub.tables().length).toBe(3);
  });

  it('derive la couleur des tables depuis les reservations', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.reservations = [
      reservation('r1', 'seated', 't1'),
      reservation('r2', 'confirmed', 't2'),
    ];
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    const views = stub.tables();
    expect(views.find((v) => v.table.id === 't1')?.status).toBe('installee');
    expect(views.find((v) => v.table.id === 't2')?.status).toBe('reservee');
    expect(views.find((v) => v.table.id === 't3')?.status).toBe('libre');
  });

  it('utilise la geometrie du plan edite quand elle existe (bridge D1)', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.geometry = {
      t1: { x: 0.22, y: 0.33, w: 0.2, h: 0.12, rotation: 45, shape: 'rect' },
    };
    fixture.componentInstance.reservations = [reservation('r1', 'confirmed', 't1')];
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    const t1 = stub.tables().find((v) => v.table.id === 't1')!;
    // Position + forme + rotation issues du plan sauvegarde.
    expect(t1.x).toBeCloseTo(0.22, 5);
    expect(t1.y).toBeCloseTo(0.33, 5);
    expect(t1.shape).toBe('rect');
    expect(t1.rotation).toBe(45);
    // Le statut reste derive des reservations (les ids matchent desormais).
    expect(t1.status).toBe('reservee');
    // Les tables sans geometrie gardent le repli auto-grille.
    const t2 = stub.tables().find((v) => v.table.id === 't2')!;
    expect(t2.shape).toBe('square');
  });

  it('clic sur une table reservee : l INSPECTOR affiche sa reservation a droite', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.reservations = [reservation('r1', 'confirmed', 't1')];
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    const reserved = stub.tables().find((v) => v.table.id === 't1')!;
    stub.tableClick.emit(reserved);
    await fixture.whenStable();

    const inspector: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="table-inspector"]',
    );
    expect(inspector).toBeTruthy();
    expect(inspector.textContent).toContain('Client r1');
    expect(inspector.textContent).toContain('Libérer la table');
    // La table selectionnee est mise en avant sur le canvas (focus).
    expect(stub.focusTableId()).toBe('t1');
  });

  it('liste les reservations non placees', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.reservations = [
      reservation('r1', 'confirmed', 't1'),
      reservation('r2', 'pending', null),
    ];
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Réservations non placées');
    expect(fixture.nativeElement.textContent).toContain('Client r2');
  });

  it('exclut les reservations mortes (annulee/no_show/terminee) des non placees', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.reservations = [
      reservation('r-cancel', 'cancelled', null),
      reservation('r-done', 'completed', null),
      reservation('r-noshow', 'no_show', null),
      reservation('r-ok', 'pending', null),
    ];
    await fixture.whenStable();

    const aside: HTMLElement = fixture.nativeElement.querySelector('aside');
    expect(aside.textContent).toContain('Client r-ok');
    expect(aside.textContent).not.toContain('Client r-cancel');
    expect(aside.textContent).not.toContain('Client r-done');
    expect(aside.textContent).not.toContain('Client r-noshow');
  });

  it('affecte une non placee selectionnee a une table libre cliquee', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.reservations = [reservation('r2', 'pending', null)];
    await fixture.whenStable();

    // Selectionne la reservation non placee (clic sur sa carte).
    const card: HTMLButtonElement = fixture.nativeElement.querySelector('aside li button');
    card.click();
    await fixture.whenStable();

    // Clique une table libre via le canvas stub.
    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    const free = stub.tables().find((v) => v.status === 'libre')!;
    stub.tableClick.emit(free);
    await fixture.whenStable();

    expect(fixture.componentInstance.assigned).toBe(`r2:${free.table.id}`);
  });

  // LOT B1 : garde-fou capacite a l'affectation.
  it('capacite insuffisante : PAS d affectation immediate, toast avec action', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    // 6 couverts : aucune table (2/4/4) ne suffit.
    fixture.componentInstance.reservations = [reservation('r2', 'pending', null, 6)];
    await fixture.whenStable();

    const card: HTMLButtonElement = fixture.nativeElement.querySelector('aside li button');
    card.click();
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    const small = stub.tables().find((v) => v.table.id === 't2')!; // capacite 4 < 6.
    stub.tableClick.emit(small);
    await fixture.whenStable();

    // Pas d'assign direct ; un toast d'avertissement avec action est montre.
    expect(fixture.componentInstance.assigned).toBe('');
    const toast = TestBed.inject(ToastService);
    expect(toast.toasts().length).toBe(1);
    expect(toast.toasts()[0].action?.label).toBe('Placer quand même');
    // La selection est conservee (l'utilisateur peut choisir une autre table).
    expect(stub.requiredSeats()).toBe(6);

    // « Placer quand meme » -> l'assign part.
    toast.toasts()[0].action!.run();
    await fixture.whenStable();
    expect(fixture.componentInstance.assigned).toBe('r2:t2');
  });

  it('capacite suffisante : affectation directe, sans toast garde-fou', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.reservations = [reservation('r2', 'pending', null, 4)];
    await fixture.whenStable();

    const card: HTMLButtonElement = fixture.nativeElement.querySelector('aside li button');
    card.click();
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    stub.tableClick.emit(stub.tables().find((v) => v.table.id === 't2')!);
    await fixture.whenStable();

    expect(fixture.componentInstance.assigned).toBe('r2:t2');
    expect(TestBed.inject(ToastService).toasts().length).toBe(0);
  });

  // LOT B2 : meilleur fit calcule dans la vue et transmis au canvas + hint texte.
  it('surligne la meilleure table (capacite minimale suffisante) et affiche le hint', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.reservations = [reservation('r2', 'pending', null, 3)];
    await fixture.whenStable();

    const card: HTMLButtonElement = fixture.nativeElement.querySelector('aside li button');
    card.click();
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    // Tables 2/4/4 libres : la premiere de capacite 4 (t2) est recommandee.
    expect(stub.bestTableId()).toBe('t2');
    expect(stub.requiredSeats()).toBe(3);
    expect(fixture.nativeElement.textContent).toContain('Table recommandée :');
    expect(fixture.nativeElement.textContent).toContain('T2');
  });

  it('aucune table assez grande -> bestTableId null (pas de hint)', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.reservations = [reservation('r2', 'pending', null, 8)];
    await fixture.whenStable();

    const card: HTMLButtonElement = fixture.nativeElement.querySelector('aside li button');
    card.click();
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    expect(stub.bestTableId()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Table recommandée :');
  });

  // PLACEMENT AUTO : « Tout placer » emet une affectation par resa plaçable.
  it('Tout placer : une affectation par resa, grandes tablees d abord', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.reservations = [
      reservation('r-small', 'pending', null, 2),
      reservation('r-big', 'confirmed', null, 4),
    ];
    await fixture.whenStable();

    const placeAll: HTMLElement = fixture.nativeElement.querySelector('[data-testid="place-all"]');
    placeAll.click();
    await fixture.whenStable();

    // r-big (4 couv) prend t2 (premiere de capacite 4), r-small (2) prend t1.
    expect(fixture.componentInstance.assigns).toEqual(['r-big:t2', 'r-small:t1']);
  });

  // SURVOL d'une resa non placee : la meilleure table est deja surlignee.
  it('survol d une non placee -> bestTableId transmis au canvas sans clic', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.reservations = [reservation('r2', 'pending', null, 2)];
    await fixture.whenStable();

    const row: HTMLButtonElement = fixture.nativeElement.querySelector('aside li button');
    row.dispatchEvent(new Event('mouseenter'));
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    expect(stub.bestTableId()).toBe('t1'); // 2 couv -> t1 (capacite 2, la plus serree)

    row.dispatchEvent(new Event('mouseleave'));
    await fixture.whenStable();
    expect(stub.bestTableId()).toBeNull();
  });

  // FUSION GUIDEE : aucune table ne suffit mais deux voisines fusionnees oui.
  it('suggere la fusion de tables voisines et emet mergeAssign', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    // t2 et t3 (4+4) posees bord a bord ; t1 a l'ecart.
    fixture.componentInstance.geometry = {
      t1: { x: 0.1, y: 0.1, w: 0.12, h: 0.12, rotation: 0, shape: 'round' },
      t2: { x: 0.5, y: 0.5, w: 0.14, h: 0.14, rotation: 0, shape: 'square' },
      t3: { x: 0.5 + 0.14 / 1.6, y: 0.5, w: 0.14, h: 0.14, rotation: 0, shape: 'square' },
    };
    fixture.componentInstance.reservations = [reservation('r-groupe', 'confirmed', null, 8)];
    await fixture.whenStable();

    const row: HTMLButtonElement = fixture.nativeElement.querySelector('aside li button');
    row.click();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('T2+T3 (8 couv.)');
    const action: HTMLElement = fixture.nativeElement.querySelector('[data-testid="merge-assign"]');
    action.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.merged).toBe('r-groupe:t2+t3');
  });

  // WALK-IN : clic sur une table libre SANS affectation en cours -> bandeau
  // « Installer des clients » (le clic mort devient le geste n°1).
  it('clic table libre sans selection -> bandeau walk-in, stepper par defaut = capacite', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    stub.tableClick.emit(stub.tables().find((v) => v.table.id === 't2')!); // capacite 4.
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent;
    // L'INSPECTOR affiche la carte de la table libre (installer des clients).
    expect(fixture.nativeElement.querySelector('[data-testid="walkin-panel"]')).toBeTruthy();
    expect(text).toContain('Table T2');
    expect(text).toContain('Installer');
    // Defaut intelligent : le stepper s'ouvre a la capacite de la table.
    const counter = fixture.nativeElement.querySelector('[aria-label="Moins de couverts"]')!
      .nextElementSibling as HTMLElement;
    expect(counter.textContent!.trim()).toBe('4');
    // Aucune emission tant que « Installer » n'est pas clique.
    expect(fixture.componentInstance.walkIn).toBe('');
  });

  it('« Installer » emet walkIn avec la table et le nombre de couverts choisi', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    stub.tableClick.emit(stub.tables().find((v) => v.table.id === 't2')!);
    await fixture.whenStable();

    // 4 (defaut) -> 3 via le stepper, borne min/max geree par le composant.
    const minus: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[aria-label="Moins de couverts"]',
    );
    minus.click();
    await fixture.whenStable();

    const install = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent!.includes('Installer'))!;
    install.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.walkIn).toBe('t2:3');
    // Le bandeau se ferme apres l'emission.
    expect(fixture.nativeElement.textContent).not.toContain('Installer des clients sur');
  });

  it('la selection remonte a l hote (survit au passage mode service)', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    stub.tableClick.emit(stub.tables().find((v) => v.table.id === 't2')!);
    await fixture.whenStable();
    // Le two-way binding pousse la selection vers l'hote : une nouvelle
    // instance du plan (mode service) la retrouvera.
    expect(fixture.componentInstance.selectedTableId).toBe('t2');

    // Et une selection FOURNIE par l'hote ouvre l'inspector d'emblee.
    fixture.componentInstance.selectedTableId = 't1';
    fixture.changeDetectorRef.detectChanges();
    await fixture.whenStable();
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="table-inspector"]')
        ?.textContent?.includes('Table T1'),
    ).toBe(true);
  });

  it('la croix ferme l inspector sans emission', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    stub.tableClick.emit(stub.tables().find((v) => v.table.id === 't2')!);
    await fixture.whenStable();

    const close: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="close-inspector"]',
    );
    close.click();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[data-testid="table-inspector"]')).toBeNull();
    expect(fixture.componentInstance.walkIn).toBe('');
  });

  // Garde-fou TEMPOREL du walk-in : prochaine reservation dans moins de 90 min ->
  // pas d'installation directe, toast avec action (meme pattern que le garde-fou B1).
  it('table reservee dans moins de 90 min : pas d emission directe, toast avec action', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    // t2 est libre MAIS reservee dans 60 min (hors fenetre active de 45 min).
    fixture.componentInstance.reservations = [reservation('r1', 'confirmed', 't2', 2, isoIn(60))];
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    const t2 = stub.tables().find((v) => v.table.id === 't2')!;
    expect(t2.status).toBe('libre');
    expect(t2.nextTime).not.toBeNull();
    stub.tableClick.emit(t2);
    await fixture.whenStable();

    const install = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent!.includes('Installer') && !b.textContent!.includes('sur'))!;
    install.click();
    await fixture.whenStable();

    // Pas d'emission directe ; toast d'avertissement avec action.
    expect(fixture.componentInstance.walkIn).toBe('');
    const toast = TestBed.inject(ToastService);
    expect(toast.toasts().length).toBe(1);
    expect(toast.toasts()[0].action?.label).toBe('Installer quand même');

    // « Installer quand meme » -> l'emission part avec le bon nombre de couverts.
    toast.toasts()[0].action!.run();
    await fixture.whenStable();
    expect(fixture.componentInstance.walkIn).toBe('t2:4');
  });

  // SIMULATION (« Simuler ma soiree ») : la salle projetee a l'heure du slider.
  it('le slider projette les statuts a l heure choisie (soiree entiere)', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    // Une resa confirmee sur t1 dans 3 h : INVISIBLE au present (t1 libre),
    // VISIBLE en glissant le slider jusqu'a son creneau.
    fixture.componentInstance.reservations = [reservation('r1', 'confirmed', 't1', 2, isoIn(180))];
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    const stub: CanvasStub = fixture.debugElement.query(
      (n) => n.componentInstance instanceof CanvasStub,
    ).componentInstance;
    expect(stub.tables().find((v) => v.table.id === 't1')!.status).toBe('libre');

    el.querySelector<HTMLButtonElement>('[data-testid="toggle-sim"]')!.click();
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="sim-bar"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="sim-summary"]')!.textContent).toContain(
      'table(s) libre(s)',
    );

    // Glisse le slider sur le creneau de la resa : plage = [floor(resa-1h) ...],
    // la resa tombe donc entre +60 et +119 min du debut -> 90 min est TOUJOURS
    // dans sa fenetre active [resa-45, resa+120] (test deterministe).
    const slider = el.querySelector<HTMLInputElement>('[data-testid="sim-slider"]')!;
    slider.value = '90';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(stub.tables().find((v) => v.table.id === 't1')!.status).toBe('reservee');

    // Retour au direct : la table redevient libre.
    el.querySelector<HTMLButtonElement>('[data-testid="toggle-sim"]')!.click();
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="sim-bar"]')).toBeNull();
    expect(stub.tables().find((v) => v.table.id === 't1')!.status).toBe('libre');
  });

  it('en simulation, cliquer une table libre ne declenche AUCUNE action (toast)', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const stub: CanvasStub = fixture.debugElement.query(
      (n) => n.componentInstance instanceof CanvasStub,
    ).componentInstance;

    el.querySelector<HTMLButtonElement>('[data-testid="toggle-sim"]')!.click();
    await fixture.whenStable();

    stub.tableClick.emit(stub.tables().find((v) => v.table.id === 't2')!);
    await fixture.whenStable();
    // Pas de panneau walk-in ; un toast propose de revenir au direct.
    expect(el.querySelector('[data-testid="walkin-panel"]')).toBeNull();
    const toast = TestBed.inject(ToastService);
    expect(toast.toasts()[0]?.message).toContain('simulation');
  });

  // ONBOARDING : aucun restaurant configure -> deux chemins au centre du plan.
  it('affiche l onboarding (config rapide + editeur) quand aucune table', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.tables = [];
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    const onboarding = el.querySelector('[data-testid="plan-onboarding"]');
    expect(onboarding).toBeTruthy();
    expect(onboarding!.textContent).toContain('Créons votre salle');
    expect(el.querySelector('[data-testid="quick-tables"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="quick-create"]')).toBeTruthy();
    // Pas d'onboarding des qu'il y a des tables.
    fixture.componentInstance.tables = TABLES;
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="plan-onboarding"]')).toBeNull();
  });

  // FLUX HARMONISE : le walk-in s'affiche dans le panneau de DROITE (comme le
  // drawer d'une table occupee), pas en bandeau au-dessus du plan.
  it('le panneau walk-in apparait dans la colonne de droite', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    const stub: CanvasStub = fixture.debugElement.query(
      (n) => n.componentInstance instanceof CanvasStub,
    ).componentInstance;
    stub.tableClick.emit(stub.tables().find((v) => v.table.id === 't2')!);
    await fixture.whenStable();

    const panel = el.querySelector('[data-testid="walkin-panel"]');
    expect(panel).toBeTruthy();
    // Bien DANS l'aside (colonne droite), pas dans l'en-tete du plan.
    expect(panel!.closest('aside')).toBeTruthy();
  });

  it('le bouton Vitrine n apparait qu en vue 3D', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('[data-testid="toggle-vitrine"]')).toBeNull();
    el.querySelector<HTMLButtonElement>('[data-testid="toggle-3d"]')!.click();
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="toggle-vitrine"]')).toBeTruthy();
  });

  it('bascule entre la vue 2D et la vue 3D via le toggle', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.reservations = [reservation('r1', 'confirmed', 't1')];
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.canvas-stub')).toBeTruthy();
    expect(el.querySelector('hk-floor-plan-3d')).toBeNull();

    el.querySelector<HTMLButtonElement>('[data-testid="toggle-3d"]')!.click();
    await fixture.whenStable();
    // La 3D remplace le canvas 2D (elle degrade sans WebGL, mais son host est la).
    expect(el.querySelector('hk-floor-plan-3d')).toBeTruthy();
    expect(el.querySelector('.canvas-stub')).toBeNull();

    el.querySelector<HTMLButtonElement>('[data-testid="toggle-3d"]')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.canvas-stub')).toBeTruthy();
  });

  // MODE SERVICE : le bouton « Mode service » demande le passage plein ecran, et le
  // mode service propage fill + showNames au canvas (plan plein cadre + noms clients).
  it('affiche le bouton « Mode service » et emet enterService au clic', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();

    const btn = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent!.includes('Mode service'))!;
    expect(btn).toBeTruthy();
    btn.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.entered).toBe(1);
  });

  it('mode service : fill + showNames propages au canvas, boutons masques', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.serviceMode = true;
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    expect(stub.fill()).toBe(true);
    expect(stub.showNames()).toBe(true);
    // En mode service, les boutons Exporter/Modifier/Mode service sont masques.
    expect(fixture.nativeElement.textContent).not.toContain('Mode service');
    expect(fixture.nativeElement.textContent).not.toContain('Exporter');
  });

  it('hors mode service : fill + showNames desactives', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    expect(stub.fill()).toBe(false);
    expect(stub.showNames()).toBe(false);
  });

  it('hors affectation, aucun surlignage transmis au canvas', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.reservations = [reservation('r2', 'pending', null, 3)];
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    expect(stub.highlightFree()).toBe(false);
    expect(stub.bestTableId()).toBeNull();
    expect(stub.requiredSeats()).toBeNull();
  });
});
