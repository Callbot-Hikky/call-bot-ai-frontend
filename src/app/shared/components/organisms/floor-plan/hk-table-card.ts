import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkTableTimeline } from '@shared/components/molecules/table-timeline/hk-table-timeline';
import { Reservation } from '@core/models/reservation.model';
import { FloorTableView } from '@core/models/floor-plan.model';
import { ToastService } from '@core/services/toast.service';
import { WalkInEvent } from './hk-floor-plan-events';
import { formatTime } from '@core/utils/format';

// Garde-fou temporel du walk-in : on previent si la prochaine reservation de la
// table tombe dans moins de 90 min (le service risque de deborder dessus).
const WALK_IN_GUARD_MIN = 90;

// CARTE DE TABLE : l'etat d'UNE table et ses actions — libre = installer des
// clients (stepper + garde-fou), occupee = sa reservation (frise + actions).
// Reutilisee par l'inspector du plan (desktop/paysage) ET la vue tuiles mobile
// (bottom sheet) : un seul endroit qui sait « agir sur une table ».
@Component({
  selector: 'hk-table-card',
  imports: [HkButton, HkIcon, HkTableTimeline],
  template: `
    @if (view(); as sel) {
      <div
        class="flex flex-col gap-3 p-4"
        [class.bg-st-pending-bg]="sel.status === 'libre'"
        data-testid="table-inspector"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="flex min-w-0 flex-col gap-0.5">
            <span class="text-text-strong text-sm font-semibold">
              Table {{ sel.table.name }}
              <span class="text-text-muted font-normal">· {{ sel.table.capacity }} couv.</span>
            </span>
            <span
              class="text-xs font-medium"
              [class]="
                sel.status === 'libre'
                  ? 'text-st-pending-fg'
                  : sel.status === 'installee'
                    ? 'text-st-seated-fg'
                    : 'text-st-confirmed-fg'
              "
            >
              {{
                sel.status === 'libre'
                  ? 'Libre'
                  : sel.status === 'installee'
                    ? 'Clients installés'
                    : 'Réservée'
              }}
              @if (sel.lateMinutes; as late) {
                <span class="text-st-cancelled-fg">· +{{ late }} min de retard</span>
              }
            </span>
          </div>
          @if (showClose()) {
            <button
              type="button"
              class="text-text-subtle hover:bg-muted cursor-pointer rounded-sm p-1 max-lg:hidden"
              title="Fermer"
              data-testid="close-inspector"
              (click)="closeCard.emit()"
            >
              <hk-icon name="lucideX" [size]="15" />
            </button>
          }
        </div>

        @if (sel.status === 'libre') {
          <!-- Table LIBRE : installer des clients sans reservation. -->
          <div class="flex flex-col gap-3" data-testid="walkin-panel">
            @if (sel.nextTime) {
              <p class="text-text-muted text-xs">
                Réservée plus tard à
                <strong class="text-text-strong">{{ sel.nextTime }}</strong>
                — la table doit être libérée à temps.
              </p>
            }
            <div class="flex items-center gap-2 text-sm">
              <button
                type="button"
                class="border-border bg-surface text-text-strong inline-flex size-7 cursor-pointer items-center justify-center rounded border leading-none disabled:cursor-default disabled:opacity-40"
                aria-label="Moins de couverts"
                [disabled]="walkInSize() <= 1"
                (click)="stepWalkIn(-1)"
              >
                −
              </button>
              <span class="min-w-7 text-center font-mono text-base font-semibold tabular-nums">
                {{ walkInSize() }}
              </span>
              <button
                type="button"
                class="border-border bg-surface text-text-strong inline-flex size-7 cursor-pointer items-center justify-center rounded border leading-none disabled:cursor-default disabled:opacity-40"
                aria-label="Plus de couverts"
                [disabled]="walkInSize() >= sel.table.capacity"
                (click)="stepWalkIn(1)"
              >
                +
              </button>
              <span class="text-text-subtle">couverts</span>
            </div>
            <div class="flex items-center gap-2">
              <hk-button size="sm" class="flex-1" (click)="confirmWalkIn()">Installer</hk-button>
            </div>
          </div>
        } @else if (sel.reservation; as res) {
          <!-- Table OCCUPEE : la reservation, sa frise et ses actions. -->
          <div class="flex flex-col gap-3" data-testid="reservation-panel">
            <div class="flex flex-col gap-0.5">
              <span class="text-text-strong truncate text-sm font-medium">
                {{ res.customerName }}
              </span>
              <span class="text-text-muted font-mono text-xs tabular-nums">
                {{ formatTime(res.dateTime) }} · {{ res.partySize }} couv.
              </span>
              @if (res.notes) {
                <span class="text-text-subtle text-xs italic">{{ res.notes }}</span>
              }
            </div>
            @if (tableReservations().length > 0) {
              <hk-table-timeline [reservations]="tableReservations()" [currentId]="res.id" />
            }
            <div class="flex flex-col gap-1.5">
              @if (sel.status === 'installee') {
                <hk-button size="sm" (click)="finishService.emit(res)">
                  Terminer le service
                </hk-button>
              } @else {
                @if (res.status === 'pending') {
                  <hk-button size="sm" (click)="confirmReservation.emit(res)">Confirmer</hk-button>
                }
                <hk-button size="sm" variant="secondary" (click)="unassign.emit(res)">
                  Libérer la table
                </hk-button>
              }
              <div class="flex items-center gap-1.5">
                <hk-button
                  size="sm"
                  variant="secondary"
                  class="flex-1"
                  (click)="callReservation.emit(res)"
                >
                  Appeler
                </hk-button>
                <hk-button
                  size="sm"
                  variant="danger"
                  class="flex-1"
                  (click)="cancelReservation.emit(res)"
                >
                  Annuler
                </hk-button>
              </div>
            </div>
          </div>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkTableCard {
  private readonly toast = inject(ToastService);

  // Vue COURANTE de la table (statut derive) : la carte suit l'etat reel.
  readonly view = input<FloorTableView | null>(null);
  // Resas VIVANTES de la meme table (frise), triees par heure.
  readonly tableReservations = input<Reservation[]>([]);
  // Croix de fermeture (desktop) : l'hote (inspector) decide.
  readonly showClose = input(true);

  readonly closeCard = output<void>();
  readonly walkIn = output<WalkInEvent>();
  readonly confirmReservation = output<Reservation>();
  readonly cancelReservation = output<Reservation>();
  readonly callReservation = output<Reservation>();
  readonly finishService = output<Reservation>();
  readonly unassign = output<Reservation>();

  protected readonly formatTime = formatTime;
  protected readonly walkInSize = signal(1);
  private walkInInitFor: string | null = null;

  constructor() {
    // Stepper initialise a la capacite de la table (une fois par table).
    effect(() => {
      const sel = this.view();
      if (!sel) {
        this.walkInInitFor = null;
        return;
      }
      if (sel.status === 'libre' && this.walkInInitFor !== sel.table.id) {
        this.walkInInitFor = sel.table.id;
        this.walkInSize.set(sel.table.capacity);
      }
    });
  }

  protected readonly freeView = computed(() => {
    const sel = this.view();
    return sel && sel.status === 'libre' ? sel : null;
  });

  protected stepWalkIn(delta: number): void {
    const max = this.freeView()?.table.capacity ?? 1;
    this.walkInSize.update((n) => Math.min(max, Math.max(1, n + delta)));
  }

  // « Installer » : GARDE-FOU TEMPOREL — si la prochaine reservation tombe dans
  // moins de 90 min, pas d'installation directe (toast avec action).
  protected confirmWalkIn(): void {
    const target = this.freeView();
    if (!target) {
      return;
    }
    const partySize = this.walkInSize();
    if (target.nextDateTime) {
      const minutesUntil = (new Date(target.nextDateTime).getTime() - Date.now()) / 60_000;
      if (minutesUntil < WALK_IN_GUARD_MIN) {
        this.toast.show(
          `${target.table.name} est réservée à ${target.nextTime} (dans ${Math.max(0, Math.round(minutesUntil))} min).`,
          'default',
          {
            label: 'Installer quand même',
            run: () => this.walkIn.emit({ table: target.table, partySize }),
          },
        );
        return;
      }
    }
    this.walkIn.emit({ table: target.table, partySize });
  }
}
