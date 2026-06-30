import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HkFloorPlan } from './hk-floor-plan';
import { HkFloorPlanCanvas } from './hk-floor-plan-canvas';
import { Reservation } from '@core/models/reservation.model';
import { FloorTable } from '@core/models/table.model';
import { FloorTableView } from '@core/models/floor-plan.model';

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
  readonly tableClick = output<FloorTableView>();
}

function reservation(
  id: string,
  status: Reservation['status'],
  tableId: string | null,
): Reservation {
  return {
    id,
    customerName: `Client ${id}`,
    phone: '+33 6 00 00 00 00',
    dateTime: '2026-06-22T20:00:00+02:00',
    partySize: 2,
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
      (openReservation)="opened = $event"
      (assign)="assigned = $event.reservationId + ':' + $event.table.id"
    />
  `,
})
class HostComponent {
  reservations: Reservation[] = [];
  tables: FloorTable[] = TABLES;
  opened: Reservation | null = null;
  assigned = '';
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
});
