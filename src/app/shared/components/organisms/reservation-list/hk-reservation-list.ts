import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HkReservationRow } from '@shared/components/molecules/reservation-row/hk-reservation-row';
import { HkEmptyState } from '@shared/components/molecules/empty-state/hk-empty-state';
import { HkSkeleton } from '@shared/components/atoms/skeleton/hk-skeleton';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { Reservation } from '@core/models/reservation.model';

export type SortKey = 'time' | 'status';
export interface ReservationSort {
  key: SortKey;
  dir: 'asc' | 'desc';
}

// Liste des réservations : en-têtes (tri sur Heure/Statut) + états chargement/vide/erreur.
@Component({
  selector: 'hk-reservation-list',
  imports: [HkReservationRow, HkEmptyState, HkSkeleton, HkButton, HkIcon],
  template: `
    <div class="bg-card border-border overflow-hidden rounded-md border">
      <div
        class="text-text-subtle border-border flex items-center gap-4 border-b px-3 py-2 text-xs font-medium tracking-wide uppercase"
      >
        <button
          type="button"
          class="hover:text-foreground flex w-12 cursor-pointer items-center gap-1 uppercase"
          (click)="toggleSort('time')"
        >
          Heure
          @if (sort()?.key === 'time') {
            <hk-icon
              [name]="sort()!.dir === 'asc' ? 'lucideChevronUp' : 'lucideChevronDown'"
              [size]="12"
            />
          }
        </button>
        <span class="flex-1">Client</span>
        <span class="hidden w-14 sm:block">Couv.</span>
        <span class="hidden w-20 sm:block">Table</span>
        <button
          type="button"
          class="hover:text-foreground flex cursor-pointer items-center gap-1 uppercase sm:w-28"
          (click)="toggleSort('status')"
        >
          Statut
          @if (sort()?.key === 'status') {
            <hk-icon
              [name]="sort()!.dir === 'asc' ? 'lucideChevronUp' : 'lucideChevronDown'"
              [size]="12"
            />
          }
        </button>
        <span class="sm:w-[260px]"></span>
      </div>

      @if (loading()) {
        <div class="divide-border flex flex-col divide-y">
          @for (i of placeholders; track i) {
            <div class="px-3 py-3.5">
              <hk-skeleton height="1.25rem" />
            </div>
          }
        </div>
      } @else if (error()) {
        <div class="flex flex-col items-center gap-3 py-12 text-center">
          <p class="text-muted-foreground text-sm">Une erreur est survenue.</p>
          <hk-button size="sm" variant="secondary" (click)="retry.emit()">Réessayer</hk-button>
        </div>
      } @else if (reservations().length === 0) {
        <hk-empty-state
          icon="lucideCalendar"
          title="Aucune réservation"
          subtitle="Aucune réservation ne correspond à ces critères."
        />
      } @else {
        <div class="divide-border flex flex-col divide-y">
          @for (reservation of reservations(); track reservation.id) {
            <hk-reservation-row
              [reservation]="reservation"
              (open)="open.emit($event)"
              (confirm)="confirm.emit($event)"
              (cancelReservation)="cancelReservation.emit($event)"
              (call)="call.emit($event)"
              (markArrived)="markArrived.emit($event)"
            />
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkReservationList {
  readonly reservations = input<Reservation[]>([]);
  readonly loading = input(false);
  readonly error = input(false);
  readonly sort = input<ReservationSort | null>(null);

  readonly open = output<Reservation>();
  readonly confirm = output<Reservation>();
  readonly cancelReservation = output<Reservation>();
  readonly call = output<Reservation>();
  readonly markArrived = output<Reservation>();
  readonly retry = output<void>();
  readonly sortChange = output<ReservationSort>();

  protected readonly placeholders = [1, 2, 3, 4, 5, 6];

  protected toggleSort(key: SortKey): void {
    const current = this.sort();
    const dir = current?.key === key && current.dir === 'asc' ? 'desc' : 'asc';
    this.sortChange.emit({ key, dir });
  }
}
