import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';
import { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HkBadge } from '@shared/components/atoms/badge/hk-badge';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { Reservation } from '@core/models/reservation.model';

// Détail d'une réservation dans un drawer (depuis la droite), via la primitive sheet.
@Component({
  selector: 'hk-reservation-detail-drawer',
  imports: [...HlmSheetImports, BrnSheetContent, HkBadge, HkButton, HkIcon],
  template: `
    <hlm-sheet side="right" [state]="state()" (stateChanged)="state.set($event)">
      <hlm-sheet-content *brnSheetContent class="w-full sm:max-w-md">
        @if (reservation(); as r) {
          <div class="flex h-full flex-col gap-6 p-6">
            <div class="flex flex-col gap-2">
              <h2 class="text-text-strong text-xl font-semibold">{{ r.customerName }}</h2>
              <div><hk-badge [status]="r.status" /></div>
            </div>

            <dl class="flex flex-col gap-3 text-sm">
              <div class="flex items-center gap-2">
                <hk-icon name="lucideCalendar" [size]="16" class="text-text-subtle" />
                <span class="font-mono tabular-nums">{{ formattedDate(r.dateTime) }}</span>
              </div>
              <div class="flex items-center gap-2">
                <hk-icon name="lucideUsers" [size]="16" class="text-text-subtle" />
                <span class="font-mono tabular-nums">{{ r.partySize }} couverts</span>
              </div>
              @if (r.table) {
                <div class="flex items-center gap-2">
                  <hk-icon name="lucideGrid2x2" [size]="16" class="text-text-subtle" />
                  <span>Table {{ r.table.name }}</span>
                </div>
              }
              <div class="flex items-center gap-2">
                <hk-icon name="lucidePhone" [size]="16" class="text-text-subtle" />
                <a class="text-primary font-mono tabular-nums" [href]="'tel:' + r.phone">{{
                  r.phone
                }}</a>
              </div>
              @if (r.notes) {
                <p class="text-muted-foreground border-border border-t pt-3">{{ r.notes }}</p>
              }
            </dl>

            <div class="mt-auto flex flex-col gap-2">
              <hk-button (click)="confirm.emit(r)">Confirmer</hk-button>
              <hk-button variant="secondary" (click)="call.emit(r)">Appeler</hk-button>
              <hk-button variant="danger" (click)="cancelReservation.emit(r)">Annuler</hk-button>
            </div>
          </div>
        }
      </hlm-sheet-content>
    </hlm-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkReservationDetailDrawer {
  readonly reservation = input<Reservation | null>(null);
  readonly state = model<BrnDialogState>('closed');

  readonly confirm = output<Reservation>();
  readonly cancelReservation = output<Reservation>();
  readonly call = output<Reservation>();

  protected formattedDate(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
