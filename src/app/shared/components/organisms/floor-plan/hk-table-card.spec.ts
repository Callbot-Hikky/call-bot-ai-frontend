import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HkTableCard } from './hk-table-card';
import { FloorTableView } from '@core/models/floor-plan.model';
import { Reservation } from '@core/models/reservation.model';

// La carte de table parle comme la liste : une resa en attente se confirme,
// une resa confirmee attend son client.
describe('HkTableCard', () => {
  let fixture: ComponentFixture<HkTableCard>;

  const resa = (status: Reservation['status']): Reservation => ({
    id: 'r1',
    customerName: 'Camille',
    phone: '+33612345678',
    dateTime: '2026-09-14T20:00:00+02:00',
    partySize: 2,
    status,
    source: 'callbot',
    table: { id: 't1', name: 'T1', capacity: 4 },
  });
  const view = (
    status: FloorTableView['status'],
    reservation: Reservation | null,
  ): FloorTableView =>
    ({
      table: { id: 't1', name: 'T1', capacity: 4 },
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      shape: 'square',
      rotation: 0,
      status,
      reservation,
      nextTime: null,
      nextDateTime: null,
      lateMinutes: null,
    }) as FloorTableView;

  const text = (testId: string): string =>
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? '';
  const primaryFirst = (): string =>
    fixture.nativeElement
      .querySelector('[data-testid="reservation-panel"] hk-button button')
      ?.textContent?.trim() ?? '';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(HkTableCard);
  });

  it('resa en attente : en-tete « En attente », action principale « Confirmer »', async () => {
    fixture.componentRef.setInput('view', view('reservee', resa('pending')));
    await fixture.whenStable();
    expect(text('table-tone')).toBe('En attente');
    expect(primaryFirst()).toBe('Confirmer la réservation');
    expect(text('card-arrived')).toBe('Client arrivé');
  });

  it('resa confirmee : en-tete « Réservée », action principale « Client arrivé »', async () => {
    fixture.componentRef.setInput('view', view('reservee', resa('confirmed')));
    await fixture.whenStable();
    expect(text('table-tone')).toBe('Réservée');
    expect(primaryFirst()).toBe('Client arrivé');
    expect(fixture.nativeElement.querySelector('[data-testid="card-confirm"]')).toBeNull();
  });

  it('clients installes et table libre', async () => {
    fixture.componentRef.setInput('view', view('installee', resa('seated')));
    await fixture.whenStable();
    expect(text('table-tone')).toBe('Clients installés');
    fixture.componentRef.setInput('view', view('libre', null));
    await fixture.whenStable();
    expect(text('table-tone')).toBe('Libre');
    expect(fixture.nativeElement.querySelector('[data-testid="walkin-panel"]')).not.toBeNull();
  });
});
