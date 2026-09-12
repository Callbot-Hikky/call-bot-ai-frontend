import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, DestroyRef } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ReservationActionsService } from './reservation-actions.service';
import { ReservationService } from './reservation.service';
import { Reservation } from '@core/models/reservation.model';

const RESERVATION = {
  id: 'r-1',
  customerName: 'Nadia',
  status: 'pending',
} as unknown as Reservation;

// L'annulation est irreversible : rien ne part tant que la boite n'est pas confirmee.
describe('ReservationActionsService (annulation)', () => {
  let service: ReservationActionsService;
  const reservations = { cancel: vi.fn(() => of(RESERVATION)) };

  beforeEach(() => {
    reservations.cancel.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ReservationService, useValue: reservations },
      ],
    });
    service = TestBed.inject(ReservationActionsService);
  });

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((el) => el.remove());
  });

  it('Retour ne fait rien, confirmer envoie l annulation', async () => {
    service.cancel(RESERVATION, TestBed.inject(DestroyRef));
    await new Promise((r) => setTimeout(r, 0));
    expect(document.body.textContent).toContain('Annuler la réservation de Nadia ?');
    document.querySelector<HTMLElement>('[data-testid="confirm-dialog-cancel"] button')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(reservations.cancel).not.toHaveBeenCalled();

    service.cancel(RESERVATION, TestBed.inject(DestroyRef));
    await new Promise((r) => setTimeout(r, 0));
    document.querySelector<HTMLElement>('[data-testid="confirm-dialog-ok"] button')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(reservations.cancel).toHaveBeenCalledWith('r-1');
  });

  it('une reservation deja cloturee n ouvre pas de boite', async () => {
    service.cancel(
      { ...RESERVATION, status: 'cancelled' } as Reservation,
      TestBed.inject(DestroyRef),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
    expect(reservations.cancel).not.toHaveBeenCalled();
  });
});
