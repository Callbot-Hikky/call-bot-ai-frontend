import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReservationService } from './reservation.service';
import { ToastService } from './toast.service';
import { Reservation } from '@core/models/reservation.model';
import { AssignEvent, WalkInEvent } from '@shared/components/organisms/floor-plan/hk-floor-plan';

// ACTIONS RESERVATION partagees (page Liste + page Plan) : chaque action fait
// l'appel reseau ET le toast — au meme endroit, avec le meme wording. Les pages
// ne gardent que leurs specificites (fermeture de drawer, fusion...).
@Injectable({ providedIn: 'root' })
export class ReservationActionsService {
  private readonly service = inject(ReservationService);
  private readonly toast = inject(ToastService);

  assign(event: AssignEvent, destroyRef: DestroyRef): void {
    this.service
      .assign(event.reservationId, event.table)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe({
        next: () => this.toast.show(`Réservation placée en ${event.table.name}`, 'success'),
        error: () => this.toast.show("Échec de l'affectation", 'error'),
      });
  }

  walkIn(event: WalkInEvent, destroyRef: DestroyRef): void {
    this.service
      .createWalkIn(event.table, event.partySize)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe({
        next: () => this.toast.show(`Clients installés en ${event.table.name}`, 'success'),
        error: () => this.toast.show("Échec de l'installation", 'error'),
      });
  }

  finish(reservation: Reservation, destroyRef: DestroyRef, onDone?: () => void): void {
    this.service
      .finish(reservation.id)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe({
        next: () => {
          this.toast.show('Table libérée — service terminé', 'success');
          onDone?.();
        },
        error: () => this.toast.show('Échec de la clôture', 'error'),
      });
  }

  unassign(reservation: Reservation, destroyRef: DestroyRef, onDone?: () => void): void {
    this.service
      .unassign(reservation.id)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe({
        next: () => {
          this.toast.show('Table libérée');
          onDone?.();
        },
        error: () => this.toast.show('Échec de la libération', 'error'),
      });
  }

  confirm(reservation: Reservation, destroyRef: DestroyRef): void {
    this.service
      .confirm(reservation.id)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.toast.show('Réservation confirmée', 'success'));
  }

  cancel(reservation: Reservation, destroyRef: DestroyRef): void {
    this.service
      .cancel(reservation.id)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.toast.show('Réservation annulée'));
  }

  call(reservation: Reservation): void {
    this.toast.show(`Appel de ${reservation.customerName}...`);
  }
}
