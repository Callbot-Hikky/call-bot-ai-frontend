import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ReservationService } from './reservation.service';

describe('ReservationService', () => {
  let service: ReservationService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    service = TestBed.inject(ReservationService);
  });

  it('charge les réservations du jour et bascule loading', async () => {
    expect(service.reservations().length).toBe(0);
    service.loadToday();
    expect(service.loading()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(service.loading()).toBe(false);
    expect(service.error()).toBe(false);
    expect(service.reservations().length).toBeGreaterThan(0);
  });

  it('confirm passe le statut à confirmed', async () => {
    service.loadToday();
    await new Promise((resolve) => setTimeout(resolve, 600));
    const pending = service.reservations().find((r) => r.status === 'pending');
    if (!pending) {
      throw new Error('aucune réservation en attente dans les données de test');
    }
    await firstValueFrom(service.confirm(pending.id));
    expect(service.reservations().find((r) => r.id === pending.id)?.status).toBe('confirmed');
  });

  it('cancel passe le statut à cancelled', async () => {
    service.loadToday();
    await new Promise((resolve) => setTimeout(resolve, 600));
    const target = service.reservations()[0];
    await firstValueFrom(service.cancel(target.id));
    expect(service.reservations().find((r) => r.id === target.id)?.status).toBe('cancelled');
  });
});
