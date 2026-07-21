import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { ReservationService } from './reservation.service';
import { ReservationDto } from '@core/models/reservation-dto.model';
import { RestaurantTable } from '@core/models/reservation.model';

// En test, environment.useMock vaut false (fileReplacement dev) : on verifie le vrai
// chemin HTTP (PUT) avec HttpTestingController, notamment le corps qui porte tableId.
function dto(id: string, tableId: string | null = null): ReservationDto {
  return {
    id,
    restaurantId: 'rest-1',
    customerId: 'cust-1',
    tableId,
    callId: null,
    startsAt: '2026-06-24T12:00:00Z',
    endsAt: '2026-06-24T21:00:00Z',
    partySize: 2,
    status: 'confirmed',
    source: 'callbot',
    notes: null,
    createdAt: '2026-06-24T10:00:00Z',
    updatedAt: '2026-06-24T10:00:00Z',
    cancelledAt: null,
    table: tableId ? { id: tableId, name: tableId.toUpperCase(), capacity: 4 } : null,
    customer: {
      id: 'cust-1',
      phone: '+33 6 12 34 56 78',
      firstName: 'Camille',
      lastName: 'Durand',
    },
  };
}

const TABLE: RestaurantTable = { id: 'tbl-9', name: 'T9', capacity: 6 };

describe('ReservationService affectation', () => {
  let service: ReservationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReservationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('assign envoie un PUT dont le corps contient le tableId', async () => {
    service.loadToday('2026-06-24');
    httpMock.expectOne((r) => r.url.includes('/reservations')).flush([dto('1', null)]);

    const result = firstValueFrom(service.assign('1', TABLE));
    const put = httpMock.expectOne((r) => r.method === 'PUT');
    expect(put.request.url).toContain('/reservations/1');
    const body = put.request.body as { tableId: string | null; status: string };
    expect(body.tableId).toBe('tbl-9');
    // L'affectation ne change pas le statut.
    expect(body.status).toBe('confirmed');
    put.flush(dto('1', 'tbl-9'));

    await result;
    expect(service.reservations().find((r) => r.id === '1')?.table?.id).toBe('tbl-9');
  });

  it('unassign envoie un PUT avec tableId null', async () => {
    service.loadToday('2026-06-24');
    httpMock.expectOne((r) => r.url.includes('/reservations')).flush([dto('1', 'tbl-9')]);

    const result = firstValueFrom(service.unassign('1'));
    const put = httpMock.expectOne((r) => r.method === 'PUT');
    const body = put.request.body as { tableId: string | null };
    expect(body.tableId).toBeNull();
    put.flush(dto('1', null));

    await result;
    expect(service.reservations().find((r) => r.id === '1')?.table).toBeUndefined();
  });
});
