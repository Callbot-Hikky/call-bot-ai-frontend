import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkSkeleton } from '@shared/components/atoms/skeleton/hk-skeleton';
import { HkFloorPlanCanvas } from './hk-floor-plan-canvas';
import { HkFloorPlanLegend } from './hk-floor-plan-legend';
import { Reservation } from '@core/models/reservation.model';
import { FloorTable } from '@core/models/table.model';
import { FloorTableView, autoGridLayout, deriveTableStatus } from '@core/models/floor-plan.model';
import { formatTime } from '@core/utils/format';

export interface AssignEvent {
  reservationId: string;
  table: FloorTable;
}

// Plan de salle (Phase 1) : canvas Konva + panneau des non placees + legende.
// Orchestre la derivation de statut et l'affectation au clic. Etats chargement
// (skeleton) et erreur (bandeau + reessayer) geres ici.
@Component({
  selector: 'hk-floor-plan',
  imports: [HkButton, HkIcon, HkSkeleton, HkFloorPlanCanvas, HkFloorPlanLegend],
  template: `
    @if (error()) {
      <div
        class="bg-card border-border flex flex-col items-center gap-3 rounded-md border py-12 text-center"
      >
        <p class="text-muted-foreground text-sm">Impossible de charger le plan de salle.</p>
        <hk-button size="sm" variant="secondary" (click)="retry.emit()">Réessayer</hk-button>
      </div>
    } @else if (loading()) {
      <div class="grid gap-4 lg:grid-cols-[1fr_320px]">
        <hk-skeleton height="360px" />
        <hk-skeleton height="360px" />
      </div>
    } @else {
      <div class="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div class="flex flex-col gap-3">
          @if (selectedUnplaced(); as r) {
            <div
              class="bg-st-pending-bg text-st-pending-fg flex items-center gap-2 rounded-md px-3 py-2 text-sm"
            >
              <hk-icon name="lucideInfo" [size]="16" />
              <span>
                Sélectionnez une table libre pour y placer
                <strong>{{ r.customerName }}</strong>
                .
              </span>
            </div>
          } @else {
            <p class="text-text-subtle text-sm">
              Cliquez une table pour voir sa réservation, ou sélectionnez une réservation non placée
              pour l'affecter.
            </p>
          }

          @if (tableViews().length === 0) {
            <div
              class="bg-surface-2 border-border text-text-subtle flex items-center justify-center rounded-md border px-4 text-center text-sm"
              style="aspect-ratio: 16 / 10; min-height: 320px"
            >
              Aucune table n'est configurée pour ce restaurant.
            </div>
          } @else {
            <hk-floor-plan-canvas
              [tables]="tableViews()"
              [highlightFree]="!!selectedUnplaced()"
              (tableClick)="onTableClick($event)"
            />
          }

          <hk-floor-plan-legend />
        </div>

        <aside class="bg-card border-border flex flex-col rounded-md border">
          <div class="border-border flex items-center justify-between border-b px-4 py-3">
            <h3 class="text-text-strong text-sm font-semibold">Réservations non placées</h3>
            <span
              class="bg-muted text-text-muted inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium"
            >
              {{ unplaced().length }}
            </span>
          </div>

          @if (unplaced().length === 0) {
            <p class="text-text-subtle px-4 py-8 text-center text-sm">
              Toutes les réservations du jour sont placées.
            </p>
          } @else {
            <ul class="divide-border flex flex-col divide-y">
              @for (r of unplaced(); track r.id) {
                <li>
                  <button
                    type="button"
                    class="hover:bg-muted flex w-full cursor-pointer items-center gap-3 border-l-2 px-4 py-3 text-left transition-colors"
                    [class]="
                      selectedUnplacedId() === r.id
                        ? 'bg-st-pending-bg/60 border-st-pending-fg'
                        : 'border-transparent'
                    "
                    [attr.aria-pressed]="selectedUnplacedId() === r.id"
                    (click)="toggleUnplaced(r)"
                  >
                    <span class="flex min-w-0 flex-1 flex-col">
                      <span class="text-text-strong truncate text-sm font-medium">
                        {{ r.customerName }}
                      </span>
                      <span class="text-text-muted font-mono text-xs tabular-nums">
                        {{ formatTime(r.dateTime) }} · {{ r.partySize }} couv.
                      </span>
                    </span>
                    @if (selectedUnplacedId() === r.id) {
                      <hk-icon name="lucideCheck" [size]="16" class="text-st-pending-fg" />
                    }
                  </button>
                </li>
              }
            </ul>
          }
        </aside>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkFloorPlan {
  readonly reservations = input<Reservation[]>([]);
  readonly tables = input<FloorTable[]>([]);
  readonly loading = input(false);
  readonly error = input(false);

  readonly openReservation = output<Reservation>();
  readonly assign = output<AssignEvent>();
  readonly unassign = output<Reservation>();
  readonly retry = output<void>();

  protected readonly formatTime = formatTime;

  // Reservation non placee selectionnee pour affectation (clic).
  protected readonly selectedUnplacedId = signal<string | null>(null);

  // Tables positionnees (auto-grille) + statut derive des vraies reservations.
  protected readonly tableViews = computed<FloorTableView[]>(() => {
    const reservations = this.reservations();
    const placed = autoGridLayout(this.tables());
    return placed.map((p) => {
      const { status, reservation } = deriveTableStatus(p.table.id, reservations);
      return { ...p, status, reservation };
    });
  });

  // Reservations du jour sans table (callbot/web/manuel non placees).
  protected readonly unplaced = computed(() => this.reservations().filter((r) => !r.table));

  protected readonly selectedUnplaced = computed(() => {
    const id = this.selectedUnplacedId();
    return id ? (this.unplaced().find((r) => r.id === id) ?? null) : null;
  });

  protected toggleUnplaced(reservation: Reservation): void {
    this.selectedUnplacedId.update((id) => (id === reservation.id ? null : reservation.id));
  }

  protected onTableClick(view: FloorTableView): void {
    const pending = this.selectedUnplaced();
    if (pending && view.status === 'libre') {
      // Mode affectation : on place la non placee selectionnee sur cette table libre.
      this.assign.emit({ reservationId: pending.id, table: view.table });
      this.selectedUnplacedId.set(null);
      return;
    }
    if (view.reservation) {
      // Table occupee : on ouvre le detail de sa reservation.
      this.openReservation.emit(view.reservation);
    }
  }
}
