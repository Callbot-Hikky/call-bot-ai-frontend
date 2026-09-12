import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { ReservationService } from './reservation.service';
import { ToastService } from './toast.service';
import { ConfirmService } from '@shared/components/molecules/confirm-dialog/hk-confirm-dialog';
import { filter, switchMap } from 'rxjs';
import { Reservation } from '@core/models/reservation.model';
import { AssignEvent, WalkInEvent } from '@shared/components/organisms/floor-plan/hk-floor-plan';
import { conflictMessage } from '@core/utils/http-error';

// ACTIONS RESERVATION partagees (page Liste + page Plan) : chaque action fait
// l'appel reseau ET le toast - au meme endroit, avec le meme wording. Les pages
// ne gardent que leurs specificites (fermeture de drawer, fusion...).
// Statuts TERMINAUX : plus aucune action de cycle de vie (une resa annulee ou
// terminee ne se re-confirme pas, ne se rappelle pas). Garde-fou contre la
// « resurrection » d'une resa depuis la liste ou le drawer.
const TERMINAL_STATUSES: readonly Reservation['status'][] = ['cancelled', 'completed', 'no_show'];

@Injectable({ providedIn: 'root' })
export class ReservationActionsService {
  private readonly service = inject(ReservationService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmService);

  // Vrai si la resa est dans un etat terminal -> on bloque et on explique.
  private isTerminal(reservation: Reservation): boolean {
    if (TERMINAL_STATUSES.includes(reservation.status)) {
      this.toast.show('Cette réservation est clôturée : aucune action possible.');
      return true;
    }
    return false;
  }

  assign(event: AssignEvent, destroyRef: DestroyRef): void {
    this.service
      .assign(event.reservationId, event.table)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe({
        next: () => this.toast.show(`Réservation placée en ${event.table.name}`, 'success'),
        error: (err) => this.toast.show(conflictMessage(err, "Échec de l'affectation"), 'error'),
      });
  }

  // Placement en LOT (« Tout placer ») : un seul toast de synthese au lieu d'une
  // rafale de toasts « placee en Tn ».
  assignMany(events: readonly AssignEvent[], destroyRef: DestroyRef): void {
    if (events.length === 0) {
      return;
    }
    forkJoin(events.map((e) => this.service.assign(e.reservationId, e.table)))
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe({
        next: () => {
          const n = events.length;
          this.toast.show(
            `${n} réservation${n > 1 ? 's' : ''} placée${n > 1 ? 's' : ''}`,
            'success',
          );
        },
        error: () => this.toast.show('Échec du placement automatique.', 'error'),
      });
  }

  walkIn(event: WalkInEvent, destroyRef: DestroyRef): void {
    this.service
      .createWalkIn(event.table, event.partySize)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe({
        next: () => this.toast.show(`Clients installés en ${event.table.name}`, 'success'),
        error: (err) => this.toast.show(conflictMessage(err, "Échec de l'installation"), 'error'),
      });
  }

  finish(reservation: Reservation, destroyRef: DestroyRef, onDone?: () => void): void {
    if (reservation.status !== 'seated') {
      this.toast.show('Aucun client installé à cette table.');
      return;
    }
    this.service
      .finish(reservation.id)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe({
        next: () => {
          this.toast.show('Table libérée - service terminé', 'success');
          onDone?.();
        },
        error: () => this.toast.show('Échec de la clôture', 'error'),
      });
  }

  unassign(reservation: Reservation, destroyRef: DestroyRef, onDone?: () => void): void {
    if (this.isTerminal(reservation)) {
      return;
    }
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
    if (this.isTerminal(reservation)) {
      return;
    }
    if (reservation.status !== 'pending') {
      this.toast.show(
        reservation.status === 'seated'
          ? 'Les clients sont déjà installés.'
          : 'Cette réservation est déjà confirmée.',
      );
      return;
    }
    this.service
      .confirm(reservation.id)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.toast.show('Réservation confirmée', 'success'));
  }

  // Annuler est irreversible : on demande confirmation avant tout appel reseau.
  cancel(reservation: Reservation, destroyRef: DestroyRef): void {
    if (this.isTerminal(reservation)) {
      return;
    }
    const who = reservation.customerName?.trim() || 'ce client';
    this.confirmDialog
      .ask({
        title: `Annuler la réservation de ${who} ?`,
        message:
          'Le client sera prévenu et la table redeviendra libre. Cette action ne peut pas être annulée.',
        confirmLabel: 'Annuler la réservation',
      })
      .pipe(
        filter(Boolean),
        switchMap(() => this.service.cancel(reservation.id)),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe(() => this.toast.show('Réservation annulée'));
  }

  // CLIENT ARRIVE : un client attendu se presente -> sa reservation passe installee.
  markArrived(reservation: Reservation, destroyRef: DestroyRef, onDone?: () => void): void {
    if (this.isTerminal(reservation)) {
      return;
    }
    if (reservation.status === 'seated') {
      this.toast.show('Les clients sont déjà installés.');
      return;
    }
    this.service
      .markArrived(reservation.id)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe({
        next: () => {
          this.toast.show('Clients installés', 'success');
          onDone?.();
        },
        error: () => this.toast.show("Échec de l'installation", 'error'),
      });
  }

  call(reservation: Reservation): void {
    if (this.isTerminal(reservation)) {
      return;
    }
    this.toast.show(`Appel de ${reservation.customerName}...`);
  }
}
