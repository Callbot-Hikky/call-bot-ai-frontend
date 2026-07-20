import { Component, input, model, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HkServiceOverlay } from './hk-service-overlay';
import { HkFloorPlan, AssignEvent, WalkInEvent } from './hk-floor-plan';
import { Reservation } from '@core/models/reservation.model';
import { FloorTable } from '@core/models/table.model';
import { FloorTableStatus, FloorTableView } from '@core/models/floor-plan.model';
import { GeometryMap, WallSegment } from '@core/models/floor-plan-editor.model';

// Stub du plan (Konva a besoin d'un vrai <canvas>, indispo en jsdom). On expose les
// memes inputs/outputs que hk-floor-plan pour que les bindings de l'overlay tiennent.
@Component({
  selector: 'hk-floor-plan',
  template: `<div class="plan-stub">{{ serviceMode() }}</div>`,
})
class FloorPlanStub {
  readonly reservations = input<Reservation[]>([]);
  readonly tables = input<FloorTable[]>([]);
  readonly geometry = input<GeometryMap>({});
  readonly walls = input<WallSegment[]>([]);
  readonly merges = input<string[][]>([]);
  readonly selectedTableId = model<string | null>(null);
  readonly view3d = model(false);
  readonly vitrine = model(false);
  readonly portrait = input(false);
  readonly loading = input(false);
  readonly error = input(false);
  readonly serviceMode = input(false);
  readonly openReservation = output<Reservation>();
  readonly assign = output<AssignEvent>();
  readonly mergeAssign = output<unknown>();
  readonly walkIn = output<WalkInEvent>();
  readonly unassign = output<Reservation>();
  readonly retry = output<void>();
}

function view(
  id: string,
  status: FloorTableStatus,
  partySize: number | null = null,
): FloorTableView {
  const reservation: Reservation | null =
    partySize === null
      ? null
      : {
          id: `r-${id}`,
          customerName: `Client ${id}`,
          phone: '+33 6 00 00 00 00',
          dateTime: new Date().toISOString(),
          partySize,
          status: 'confirmed',
          source: 'manual',
        };
  return {
    table: { id, name: id.toUpperCase(), capacity: 4, isActive: true },
    x: 0.5,
    y: 0.5,
    w: 0.1,
    h: 0.1,
    shape: 'square',
    rotation: 0,
    status,
    reservation,
    nextTime: null,
    nextDateTime: null,
    lateMinutes: null,
  };
}

@Component({
  selector: 'hk-service-overlay-host',
  imports: [HkServiceOverlay],
  template: `
    <hk-service-overlay
      [restaurantName]="'Le Bistrot du Coin'"
      [today]="'lundi 6 juillet'"
      [views]="views"
      (exitService)="exited = exited + 1"
    />
  `,
})
class HostComponent {
  views: FloorTableView[] = [];
  exited = 0;
}

describe('HkServiceOverlay', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] })
      .overrideComponent(HkServiceOverlay, {
        remove: { imports: [HkFloorPlan] },
        add: { imports: [FloorPlanStub] },
      })
      .compileComponents();
  });

  it('affiche la synthese de salle depuis les vues de tables', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.views = [
      view('t1', 'libre'),
      view('t2', 'libre'),
      view('t3', 'reservee', 2),
      view('t4', 'installee', 3),
    ];
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('2 libres');
    expect(text).toContain('1 réservées');
    expect(text).toContain('1 installées');
    expect(text).toContain('5 couverts');
  });

  it('affiche le nom du restaurant et l indicateur En direct', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Le Bistrot du Coin');
    expect(text).toContain('En direct');
  });

  it('« Quitter » emet exitService', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();

    const quit = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent!.includes('Quitter'))!;
    quit.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.exited).toBe(1);
  });

  it('la touche Echap emet exitService', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();

    expect(fixture.componentInstance.exited).toBe(1);
  });

  it('passe le plan en mode service (serviceMode = true)', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();

    const stub: FloorPlanStub = fixture.debugElement.query(
      (el) => el.componentInstance instanceof FloorPlanStub,
    ).componentInstance;
    expect(stub.serviceMode()).toBe(true);
  });
});
