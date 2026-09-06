import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { SessionService } from './session.service';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { ReservationService } from './reservation.service';
import { ReservationDto } from '@core/models/reservation-dto.model';
import { Reservation, newReservations } from '@core/models/reservation.model';

// En test, environment.useMock vaut false (fileReplacement dev) : on teste le vrai
// chemin HTTP en simulant les réponses du backend avec HttpTestingController.
function dto(id: string, status: string, startsAt = '2026-06-24T12:00:00Z'): ReservationDto {
  return {
    id,
    restaurantId: 'rest-1',
    customerId: 'cust-1',
    tableId: 'tbl-1',
    callId: null,
    startsAt,
    endsAt: '2026-06-24T21:00:00Z',
    partySize: 2,
    status,
    source: 'callbot',
    notes: null,
    createdAt: '2026-06-24T10:00:00Z',
    updatedAt: '2026-06-24T10:00:00Z',
    cancelledAt: null,
    table: { id: 'tbl-1', name: 'T1', capacity: 4 },
    customer: {
      id: 'cust-1',
      phone: '+33 6 12 34 56 78',
      firstName: 'Camille',
      lastName: 'Durand',
    },
  };
}

describe('ReservationService', () => {
  let service: ReservationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: { restaurantId: signal('rest-1') } },
      ],
    });
    service = TestBed.inject(ReservationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('charge, filtre par jour et mappe le DTO backend', () => {
    service.loadToday('2026-06-24');
    expect(service.loading()).toBe(true);
    const req = httpMock.expectOne((r) => r.url.includes('/reservations'));
    expect(req.request.method).toBe('GET');
    expect(req.request.url).toContain('expand=table,customer');
    // Le 2e DTO est un autre jour : il doit être filtré côté front.
    req.flush([dto('1', 'pending'), dto('2', 'confirmed', '2026-06-25T12:00:00Z')]);

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe(false);
    expect(service.reservations().length).toBe(1);
    const r = service.reservations()[0];
    expect(r.customerName).toBe('Camille Durand');
    expect(r.phone).toBe('+33 6 12 34 56 78');
    expect(r.dateTime).toBe('2026-06-24T12:00:00Z');
    expect(r.table?.name).toBe('T1');
  });

  it('confirm envoie un PUT complet et met le statut à confirmed', async () => {
    service.loadToday('2026-06-24');
    httpMock.expectOne((r) => r.url.includes('/reservations')).flush([dto('1', 'pending')]);

    const result = firstValueFrom(service.confirm('1'));
    const put = httpMock.expectOne((r) => r.method === 'PUT');
    expect(put.request.url).toContain('/reservations/1');
    expect((put.request.body as { status: string }).status).toBe('confirmed');
    put.flush(dto('1', 'confirmed'));

    await result;
    expect(service.reservations().find((r) => r.id === '1')?.status).toBe('confirmed');
  });

  // LOT B3 : refresh silencieux du polling live.
  it('refresh met a jour les reservations SANS toucher loading', () => {
    service.loadToday('2026-06-24');
    httpMock.expectOne((r) => r.url.includes('/reservations')).flush([dto('1', 'pending')]);
    expect(service.reservations().length).toBe(1);
    expect(service.loading()).toBe(false);

    service.refresh('2026-06-24').subscribe();
    // Pendant la requete de refresh, PAS de spinner.
    expect(service.loading()).toBe(false);
    httpMock
      .expectOne((r) => r.url.includes('/reservations'))
      .flush([dto('1', 'pending'), dto('2', 'confirmed')]);

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe(false);
    expect(service.reservations().length).toBe(2);
  });

  it('cancel envoie un PUT et met le statut à cancelled', async () => {
    service.loadToday('2026-06-24');
    httpMock.expectOne((r) => r.url.includes('/reservations')).flush([dto('1', 'confirmed')]);

    const result = firstValueFrom(service.cancel('1'));
    const put = httpMock.expectOne((r) => r.method === 'PUT');
    expect((put.request.body as { status: string }).status).toBe('cancelled');
    put.flush(dto('1', 'cancelled'));

    await result;
    expect(service.reservations().find((r) => r.id === '1')?.status).toBe('cancelled');
  });
});

// LOT B3 : diff par id apres refresh (detection des nouvelles reservations).
describe('newReservations', () => {
  function res(id: string): Reservation {
    return {
      id,
      customerName: `Client ${id}`,
      phone: '+33 6 00 00 00 00',
      dateTime: '2026-06-24T20:00:00+02:00',
      partySize: 2,
      status: 'pending',
      source: 'callbot',
    };
  }

  it('detecte les reservations apparues depuis le dernier fetch', () => {
    const before = new Set(['a', 'b']);
    const after = [res('a'), res('b'), res('c'), res('d')];
    expect(newReservations(before, after).map((r) => r.id)).toEqual(['c', 'd']);
  });

  it('rien de nouveau -> liste vide (y compris si des resas ont disparu)', () => {
    const before = new Set(['a', 'b']);
    expect(newReservations(before, [res('a')])).toEqual([]);
  });

  it('premier fetch (avant vide) -> tout est nouveau', () => {
    expect(newReservations(new Set<string>(), [res('a')]).map((r) => r.id)).toEqual(['a']);
  });
});
