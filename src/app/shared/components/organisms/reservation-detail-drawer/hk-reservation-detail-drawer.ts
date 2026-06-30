import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';
import { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HkBadge } from '@shared/components/atoms/badge/hk-badge';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkAvatar } from '@shared/components/atoms/avatar/hk-avatar';
import { Reservation } from '@core/models/reservation.model';
import { telHref } from '@core/utils/format';

// Détail d'une réservation dans un drawer (depuis la droite), via la primitive sheet.
@Component({
  selector: 'hk-reservation-detail-drawer',
  imports: [...HlmSheetImports, BrnSheetContent, HkBadge, HkButton, HkIcon, HkAvatar],
  template: `
    <hlm-sheet side="right" [state]="state()" (stateChanged)="state.set($event)">
      <hlm-sheet-content *brnSheetContent class="w-full p-0 sm:max-w-md">
        @if (reservation(); as r) {
          <div class="flex h-full flex-col">
            <div
              class="to-card border-border/70 flex items-center gap-3 border-b bg-gradient-to-br from-green-100 p-6"
            >
              <hk-avatar [name]="r.customerName" size="lg" />
              <div class="flex min-w-0 flex-col gap-1.5">
                <h2 class="text-text-strong truncate text-xl font-semibold">
                  {{ r.customerName }}
                </h2>
                <div><hk-badge [status]="r.status" /></div>
              </div>
            </div>

            <dl class="flex flex-col gap-4 p-6">
              <div class="flex items-center gap-3">
                <span
                  class="bg-muted text-text-muted flex size-8 shrink-0 items-center justify-center rounded-lg"
                >
                  <hk-icon name="lucideCalendar" [size]="16" />
                </span>
                <span class="font-mono text-sm tabular-nums">{{ formattedDate(r.dateTime) }}</span>
              </div>
              <div class="flex items-center gap-3">
                <span
                  class="bg-muted text-text-muted flex size-8 shrink-0 items-center justify-center rounded-lg"
                >
                  <hk-icon name="lucideUsers" [size]="16" />
                </span>
                <span class="font-mono text-sm tabular-nums">{{ r.partySize }} couverts</span>
              </div>
              @if (r.table) {
                <div class="flex items-center gap-3">
                  <span
                    class="bg-muted text-text-muted flex size-8 shrink-0 items-center justify-center rounded-lg"
                  >
                    <hk-icon name="lucideGrid2x2" [size]="16" />
                  </span>
                  <span class="text-sm">Table {{ r.table.name }}</span>
                </div>
              }
              @if (displayedPhone(r); as phone) {
                <div class="flex items-center gap-3">
                  <span
                    class="bg-muted text-text-muted flex size-8 shrink-0 items-center justify-center rounded-lg"
                  >
                    <hk-icon name="lucidePhone" [size]="16" />
                  </span>
                  <a class="text-primary font-mono text-sm tabular-nums" [href]="telHref(phone)">
                    {{ phone }}
                  </a>
                </div>
              }
              @if (r.notes) {
                <p class="text-muted-foreground border-border/70 border-t pt-4 text-sm">
                  {{ r.notes }}
                </p>
              }
            </dl>

            <div class="border-border/70 mt-auto flex flex-col gap-2 border-t p-6">
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

  protected readonly telHref = telHref;

  // Fallback: si le téléphone n'est pas en base, on l'extrait des notes
  // (le numéro y est stocké sous la forme « Client : Nom — +33... »).
  protected displayedPhone(r: Reservation): string | null {
    if (r.phone?.trim()) return r.phone;
    const match = r.notes?.match(/\+[\d\s().-]{6,}/);
    return match ? match[0].trim() : null;
  }

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
