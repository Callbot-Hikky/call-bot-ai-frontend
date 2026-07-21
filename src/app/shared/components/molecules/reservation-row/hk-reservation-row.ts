import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { HkBadge } from '@shared/components/atoms/badge/hk-badge';
import { HkIconButton } from '@shared/components/atoms/icon-button/hk-icon-button';
import { HkTooltip } from '@shared/components/atoms/tooltip/hk-tooltip';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { Reservation } from '@core/models/reservation.model';
import { reservationLateMinutes } from '@core/models/floor-plan.model';
import { formatTime } from '@core/utils/format';

// La zone d'ouverture est un bouton (focusable au clavier). Les actions sont des
// boutons frères, donc cliquer une action n'ouvre pas le détail.
@Component({
  selector: 'hk-reservation-row',
  imports: [HkBadge, HkIconButton, HkTooltip, HkIcon],
  template: `
    <div
      class="hover:bg-muted flex items-center gap-4 rounded-sm px-3 py-2.5 transition-colors duration-150"
    >
      <button
        type="button"
        class="flex min-w-0 flex-1 cursor-pointer items-center gap-4 text-left"
        [attr.title]="reservation().notes || null"
        (click)="open.emit(reservation())"
      >
        <span class="text-foreground w-12 font-mono text-sm tabular-nums">{{ time() }}</span>

        <span class="flex min-w-0 flex-1 flex-col">
          <span class="flex items-center gap-2">
            <span class="text-foreground truncate text-sm font-medium">
              {{ reservation().customerName }}
            </span>
            @if (reservation().source === 'callbot') {
              <span
                class="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700"
              >
                Bot
              </span>
            }
            @if (reservation().notes) {
              <!-- La note existe : indice discret, texte complet au survol (title). -->
              <span class="text-text-subtle truncate text-xs italic">
                {{ reservation().notes }}
              </span>
            }
          </span>
          <span class="text-muted-foreground font-mono text-xs tabular-nums">
            {{ reservation().phone }}
          </span>
        </span>

        <span
          class="text-muted-foreground hidden w-14 items-center gap-1 font-mono text-sm tabular-nums sm:flex"
        >
          <hk-icon name="lucideUsers" [size]="14" />
          {{ reservation().partySize }}
        </span>

        <span class="text-muted-foreground hidden w-20 truncate text-sm sm:block">
          {{ reservation().table?.name ?? '-' }}
        </span>

        <span class="flex flex-col gap-0.5 sm:w-28">
          <span><hk-badge [status]="reservation().status" /></span>
          @if (lateMinutes(); as minutes) {
            <!-- RETARD : la liste montre la meme urgence que la pastille du plan. -->
            <span class="text-st-cancelled-fg text-[11px] font-semibold">
              +{{ minutes }} min de retard
            </span>
          }
        </span>
      </button>

      <div class="flex items-center gap-1 sm:w-[150px] sm:justify-end">
        @if (!reservation().table && placeable()) {
          <!-- Non placee : raccourci direct vers le plan (la resa arrive preselectionnee). -->
          <hk-icon-button
            icon="lucideGrid2x2"
            label="Placer sur le plan de salle"
            hkTooltip="Placer sur le plan"
            (click)="place.emit(reservation())"
          />
        }
        <!-- Actions de cycle de vie affichees selon le statut : confirmer seulement
             si en attente, annuler/appeler seulement sur une resa vivante. Une
             resa cloturee n'affiche aucune action (plus de boutons sans effet). -->
        @if (reservation().status === 'pending') {
          <hk-icon-button
            icon="lucideCheck"
            label="Confirmer la réservation"
            hkTooltip="Confirmer"
            (click)="confirm.emit(reservation())"
          />
        }
        @if (active()) {
          <hk-icon-button
            icon="lucideX"
            label="Annuler la réservation"
            hkTooltip="Annuler"
            (click)="cancelReservation.emit(reservation())"
          />
          <hk-icon-button
            icon="lucidePhone"
            label="Appeler le client"
            hkTooltip="Appeler"
            (click)="call.emit(reservation())"
          />
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkReservationRow {
  readonly reservation = input.required<Reservation>();
  readonly open = output<Reservation>();
  readonly confirm = output<Reservation>();
  readonly cancelReservation = output<Reservation>();
  readonly call = output<Reservation>();
  // Demande de placement sur le plan (resa non placee uniquement).
  readonly place = output<Reservation>();

  protected readonly time = computed(() => formatTime(this.reservation().dateTime));

  // Retard : recalcule a chaque rafraichissement de la liste (polling 20 s).
  protected readonly lateMinutes = computed(() =>
    reservationLateMinutes(this.reservation(), new Date()),
  );

  // Resa VIVANTE (ni annulee, ni terminee, ni no-show) : elle accepte encore des
  // actions (annuler, appeler) et peut etre placee.
  protected readonly active = computed(() => {
    const status = this.reservation().status;
    return status === 'pending' || status === 'confirmed' || status === 'seated';
  });

  // Seules les resas vivantes se placent (annulee/terminee : non).
  protected readonly placeable = this.active;
}
