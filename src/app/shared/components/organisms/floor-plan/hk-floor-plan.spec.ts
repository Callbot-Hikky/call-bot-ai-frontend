import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HkFloorPlan } from './hk-floor-plan';
import { HkFloorPlanCanvas } from './hk-floor-plan-canvas';
import { ToastService } from '@core/services/toast.service';
import { Reservation } from '@core/models/reservation.model';
import { FloorTable } from '@core/models/table.model';
import { FloorTableView } from '@core/models/floor-plan.model';
import { GeometryMap } from '@core/models/floor-plan-editor.model';

// Stub du canvas Konva : Konva a besoin d'un vrai <canvas> (indispo en jsdom sans
// le paquet `canvas`, qu'on n'ajoute pas). On remplace donc le canvas par un double
// qui expose les memes inputs/outputs pour tester l'orchestration.
@Component({
  selector: 'hk-floor-plan-canvas',
  template: `<div class="canvas-stub">{{ tables().length }}</div>`,
})
class CanvasStub {
  readonly tables = input<FloorTableView[]>([]);
  readonly highlightFree = input(false);
  readonly bestTableId = input<string | null>(null);
  readonly requiredSeats = input<number | null>(null);
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
      (openReservation)="opened = $event"
      (assign)="assigned = $event.reservationId + ':' + $event.table.id"
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
  opened: Reservation | null = null;
  assigned = '';
  walkIn = '';
  entered = 0;
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

  it('clic sur une table reservee emet openReservation', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.reservations = [reservation('r1', 'confirmed', 't1')];
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    const reserved = stub.tables().find((v) => v.table.id === 't1')!;
    stub.tableClick.emit(reserved);
    await fixture.whenStable();

    expect(fixture.componentInstance.opened?.id).toBe('r1');
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
    const card: HTMLButtonElement = fixture.nativeElement.querySelector('aside button');
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

    const card: HTMLButtonElement = fixture.nativeElement.querySelector('aside button');
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

    const card: HTMLButtonElement = fixture.nativeElement.querySelector('aside button');
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

    const card: HTMLButtonElement = fixture.nativeElement.querySelector('aside button');
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

    const card: HTMLButtonElement = fixture.nativeElement.querySelector('aside button');
    card.click();
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    expect(stub.bestTableId()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Table recommandée :');
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
    expect(text).toContain('Installer des clients sur');
    expect(text).toContain('T2');
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

  it('« Annuler » ferme le bandeau walk-in sans emission', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();

    const stub: CanvasStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof CanvasStub,
    ).componentInstance;
    stub.tableClick.emit(stub.tables().find((v) => v.table.id === 't2')!);
    await fixture.whenStable();

    const cancel = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent!.trim() === 'Annuler')!;
    cancel.click();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).not.toContain('Installer des clients sur');
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
