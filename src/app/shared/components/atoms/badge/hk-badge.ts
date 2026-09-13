import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ReservationStatus } from '@core/models/reservation.model';

// Statut = pastille colorée + libellé (jamais la couleur seule).
const STATUS_META: Record<ReservationStatus, { label: string; classes: string }> = {
  pending: { label: 'En attente', classes: 'bg-st-pending-bg text-st-pending-fg' },
  // La table est tenue, mais rien n'est acquis : à ne pas confondre avec « Confirmée ».
  awaiting_payment: {
    label: 'Paiement en attente',
    classes: 'bg-st-pending-bg text-st-pending-fg',
  },
  confirmed: { label: 'Confirmée', classes: 'bg-st-confirmed-bg text-st-confirmed-fg' },
  seated: { label: 'Installée', classes: 'bg-st-seated-bg text-st-seated-fg' },
  completed: { label: 'Terminée', classes: 'bg-st-completed-bg text-st-completed-fg' },
  cancelled: { label: 'Annulée', classes: 'bg-st-cancelled-bg text-st-cancelled-fg' },
  no_show: { label: 'Non présentée', classes: 'bg-st-noshow-bg text-st-noshow-fg' },
};

@Component({
  selector: 'hk-badge',
  template: `
    <span
      class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
      [class]="meta().classes"
    >
      {{ meta().label }}
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkBadge {
  readonly status = input.required<ReservationStatus>();
  protected readonly meta = computed(() => STATUS_META[this.status()]);
}
