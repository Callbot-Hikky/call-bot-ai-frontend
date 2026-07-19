import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';
import { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HkBadge } from '@shared/components/atoms/badge/hk-badge';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkAvatar } from '@shared/components/atoms/avatar/hk-avatar';
import { Reservation } from '@core/models/reservation.model';
import { ACTIVE_AFTER_MIN, simulationRange } from '@core/models/floor-plan.model';
import { formatTime, telHref } from '@core/utils/format';

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
                <div class="flex flex-wrap items-center gap-2">
                  <hk-badge [status]="r.status" />
                  @if (r.source === 'callbot') {
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700"
                    >
                      <hk-icon name="lucidePhoneCall" [size]="12" />
                      Pris par le bot
                    </span>
                  }
                </div>
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
              @if (r.phone) {
                <div class="flex items-center gap-3">
                  <span
                    class="bg-muted text-text-muted flex size-8 shrink-0 items-center justify-center rounded-lg"
                  >
                    <hk-icon name="lucidePhone" [size]="16" />
                  </span>
                  <a class="text-primary font-mono text-sm tabular-nums" [href]="telHref(r.phone)">
                    {{ r.phone }}
                  </a>
                </div>
              }
              @if (r.notes) {
                <p class="text-muted-foreground border-border/70 border-t pt-4 text-sm">
                  {{ r.notes }}
                </p>
              }
            </dl>

            <!-- SOIREE DE LA TABLE : frise des resas successives de la table (le
                 « second service » devient visible — on sait si la table repart). -->
            @if (timeline(); as tl) {
              <div class="border-border/70 border-t px-6 pt-4 pb-2">
                <h3 class="text-text-strong mb-2 text-sm font-semibold">
                  Soirée de la table {{ r.table?.name }}
                </h3>
                <div
                  class="bg-muted relative h-9 overflow-hidden rounded-md"
                  data-testid="table-timeline"
                >
                  @for (b of tl.blocks; track b.id) {
                    <span
                      class="absolute inset-y-1 flex items-center justify-center overflow-hidden rounded-sm px-1 text-[10px] font-semibold whitespace-nowrap text-white"
                      [class]="b.current ? 'bg-primary z-10' : 'bg-st-confirmed-fg/60'"
                      [style.left.%]="b.left"
                      [style.width.%]="b.width"
                      [title]="b.title"
                    >
                      {{ b.label }}
                    </span>
                  }
                </div>
                <div
                  class="text-text-subtle mt-1 flex justify-between font-mono text-[10px] tabular-nums"
                >
                  <span>{{ tl.startLabel }}</span>
                  <span>{{ tl.endLabel }}</span>
                </div>
              </div>
            }

            <div class="border-border/70 mt-auto flex flex-col gap-2 border-t p-6">
              @if (r.status === 'seated') {
                <!-- Clients a table : « Confirmer » n'a plus d'objet, et liberer la
                     table passe par la fin du service (resa completed -> table libre). -->
                <hk-button (click)="endService.emit(r)">
                  <hk-icon name="lucideCircleCheck" [size]="16" />
                  Terminer le service
                </hk-button>
              } @else {
                <hk-button (click)="confirm.emit(r)">Confirmer</hk-button>
              }
              <hk-button variant="secondary" (click)="call.emit(r)">Appeler</hk-button>
              @if (showUnassign() && r.table && r.status !== 'seated') {
                <hk-button variant="secondary" (click)="unassign.emit(r)">
                  <hk-icon name="lucideUnlink" [size]="16" />
                  Libérer la table
                </hk-button>
              }
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
  // Affiche l'action "Liberer la table" (uniquement depuis le plan de salle).
  readonly showUnassign = input(false);
  // Resas VIVANTES de la meme table (triees par heure) : alimente la frise
  // « Soiree de la table ». Vide -> pas de frise (resa sans table, liste simple).
  readonly tableReservations = input<Reservation[]>([]);

  // FRISE DE LA TABLE : chaque resa devient un bloc de 2 h (duree de service
  // type, ACTIVE_AFTER_MIN) positionne sur la fenetre de la soiree
  // (simulationRange : heures pleines, 1 h avant la premiere, 2 h apres la
  // derniere). La resa AFFICHEE est mise en avant.
  protected readonly timeline = computed(() => {
    const current = this.reservation();
    const resas = this.tableReservations();
    if (!current?.table || resas.length === 0) {
      return null;
    }
    const { start, end } = simulationRange(resas);
    const span = end.getTime() - start.getTime();
    if (span <= 0) {
      return null;
    }
    const blocks = resas.map((r) => {
      const left = (100 * (new Date(r.dateTime).getTime() - start.getTime())) / span;
      const width = (100 * ACTIVE_AFTER_MIN * 60_000) / span;
      return {
        id: r.id,
        left,
        width: Math.min(width, 100 - left),
        label: `${formatTime(r.dateTime)} · ${r.partySize}`,
        title: `${r.customerName} — ${formatTime(r.dateTime)}, ${r.partySize} couverts`,
        current: r.id === current.id,
      };
    });
    return {
      startLabel: formatTime(start.toISOString()),
      endLabel: formatTime(end.toISOString()),
      blocks,
    };
  });

  readonly confirm = output<Reservation>();
  readonly cancelReservation = output<Reservation>();
  readonly call = output<Reservation>();
  readonly unassign = output<Reservation>();
  // Fin du service d'une resa `seated` (la table redevient libre par derivation).
  // Nomme `endService` (pas `finish`) : `finish` est un evenement DOM natif
  // (regle @angular-eslint/no-output-native).
  readonly endService = output<Reservation>();

  protected readonly telHref = telHref;

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
