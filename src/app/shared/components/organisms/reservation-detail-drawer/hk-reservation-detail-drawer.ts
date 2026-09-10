import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';
import { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HkBadge } from '@shared/components/atoms/badge/hk-badge';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkAvatar } from '@shared/components/atoms/avatar/hk-avatar';
import { formatCents } from '@core/models/guarantee.model';
import { Reservation } from '@core/models/reservation.model';
import { HkTableTimeline } from '@shared/components/molecules/table-timeline/hk-table-timeline';
import { telHref } from '@core/utils/format';

// Correction du nombre de couverts demandee depuis le tiroir. Le drawer ne
// tranche rien : il porte l'intention, la regle vit cote back.
export interface PartySizeChangeEvent {
  reservation: Reservation;
  partySize: number;
}

// Détail d'une réservation dans un drawer (depuis la droite), via la primitive sheet.
@Component({
  selector: 'hk-reservation-detail-drawer',
  imports: [
    ...HlmSheetImports,
    BrnSheetContent,
    HkBadge,
    HkButton,
    HkIcon,
    HkAvatar,
    HkTableTimeline,
  ],
  template: `
    <hlm-sheet side="right" [state]="state()" (stateChanged)="state.set($event)">
      <hlm-sheet-content *brnSheetContent class="w-full p-0 sm:max-w-md">
        @if (reservation(); as r) {
          <div class="flex h-full flex-col">
            <div
              class="to-card border-border/70 from-brand-100 flex items-center gap-3 border-b bg-gradient-to-br p-6"
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
                <!-- COUVERTS : correction sur place. Le back porte la regle (baisse
                     libre, hausse conditionnee a une table, complement a regler en droit
                     de reservation) et renvoie sa reponse, affichee en toast. -->
                <div class="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    class="border-border/70 text-text-muted hover:bg-muted flex size-7 items-center justify-center rounded-md border disabled:opacity-40"
                    [disabled]="r.partySize <= 1"
                    aria-label="Retirer un couvert"
                    (click)="changePartySize.emit({ reservation: r, partySize: r.partySize - 1 })"
                  >
                    <hk-icon name="lucideMinus" [size]="14" />
                  </button>
                  <button
                    type="button"
                    class="border-border/70 text-text-muted hover:bg-muted flex size-7 items-center justify-center rounded-md border"
                    aria-label="Ajouter un couvert"
                    (click)="changePartySize.emit({ reservation: r, partySize: r.partySize + 1 })"
                  >
                    <hk-icon name="lucidePlus" [size]="14" />
                  </button>
                </div>
              </div>
              <!-- COMPLEMENT EN ATTENTE : la tablee au-dessus n'a pas bouge et ne
                   bougera pas tant que le convive n'aura pas regle. Le personnel doit
                   voir le montant et l'echeance sans avoir a les demander. -->
              @if (r.pendingTopUp; as topUp) {
                <div
                  class="border-border/70 bg-muted/50 flex items-start gap-3 rounded-lg border p-3"
                >
                  <span class="text-text-muted flex size-8 shrink-0 items-center justify-center">
                    <hk-icon name="lucideHourglass" [size]="16" />
                  </span>
                  <div class="text-sm">
                    <p class="font-medium">
                      Complément en attente :
                      {{ formattedAmount(topUp.amountCents, topUp.currency) }}
                    </p>
                    <p class="text-muted-foreground">
                      Passage à {{ topUp.targetPartySize }} couverts demandé.
                      @if (topUp.expiresAt) {
                        À régler avant {{ formattedTime(topUp.expiresAt) }}.
                      }
                    </p>
                    <p class="text-muted-foreground">
                      La table n'est pas tenue : la disponibilité sera revérifiée au règlement.
                    </p>
                  </div>
                </div>
              }
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

            <!-- SOIREE DE LA TABLE : frise partagee (drawer + inspector du plan). -->
            @if (r.table && tableReservations().length > 0) {
              <div class="border-border/70 border-t px-6 pt-4 pb-2">
                <h3 class="text-text-strong mb-2 text-sm font-semibold">
                  Soirée de la table {{ r.table.name }}
                </h3>
                <hk-table-timeline [reservations]="tableReservations()" [currentId]="r.id" />
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
                @if (r.table) {
                  <!-- Resa placee : le client attendu se presente -> installe. -->
                  <hk-button (click)="markArrived.emit(r)">
                    <hk-icon name="lucideCircleCheck" [size]="16" />
                    Client arrivé
                  </hk-button>
                  <hk-button variant="secondary" (click)="confirm.emit(r)">Confirmer</hk-button>
                } @else {
                  <hk-button (click)="confirm.emit(r)">Confirmer</hk-button>
                }
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

  readonly confirm = output<Reservation>();
  readonly cancelReservation = output<Reservation>();
  readonly call = output<Reservation>();
  readonly markArrived = output<Reservation>();
  readonly unassign = output<Reservation>();
  // Fin du service d'une resa `seated` (la table redevient libre par derivation).
  // Nomme `endService` (pas `finish`) : `finish` est un evenement DOM natif
  // (regle @angular-eslint/no-output-native).
  readonly endService = output<Reservation>();
  readonly changePartySize = output<PartySizeChangeEvent>();

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

  // Echeance d'un complement : quelques dizaines de minutes, l'heure suffit.
  protected formattedTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  protected formattedAmount(amountCents: number, currency: string): string {
    return formatCents(amountCents, currency);
  }
}
