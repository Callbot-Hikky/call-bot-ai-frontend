import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { HkBadge } from '@shared/components/atoms/badge/hk-badge';
import { HkIconButton } from '@shared/components/atoms/icon-button/hk-icon-button';
import { HkTooltip } from '@shared/components/atoms/tooltip/hk-tooltip';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { Reservation } from '@core/models/reservation.model';

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

        <hk-badge [status]="reservation().status" />
      </button>

      <div class="flex items-center gap-1">
        <hk-icon-button
          icon="lucideCheck"
          label="Confirmer la réservation"
          hkTooltip="Confirmer"
          (click)="confirm.emit(reservation())"
        />
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

  protected readonly time = computed(() =>
    new Date(this.reservation().dateTime).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  );
}
