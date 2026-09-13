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
import { FloorTableView, TABLE_TONE_LABEL, tableTone } from '@core/models/floor-plan.model';
import { ToastService } from '@core/services/toast.service';
import { WalkInEvent } from './hk-floor-plan-events';
import { formatTime } from '@core/utils/format';

// Garde-fou temporel du walk-in : on previent si la prochaine reservation de la
// table tombe dans moins de 90 min (le service risque de deborder dessus).
const WALK_IN_GUARD_MIN = 90;

// CARTE DE TABLE : l'etat d'UNE table et ses actions - libre = installer des
// clients (stepper + garde-fou), occupee = sa reservation (frise + actions).
// Reutilisee par l'inspector du plan (desktop/paysage) ET la vue tuiles mobile
// (bottom sheet) : un seul endroit qui sait « agir sur une table ».
@Component({
  selector: 'hk-table-card',
  imports: [HkButton, HkIcon, HkTableTimeline],
  template: `
    @if (view(); as sel) {
      <div class="flex flex-col gap-3 p-4" data-testid="table-inspector">
        <div class="flex items-start justify-between gap-2">
          <div class="flex min-w-0 flex-col gap-0.5">
            <span class="text-text-strong font-semibold" [class]="large() ? 'text-lg' : 'text-sm'">
              Table {{ sel.table.name }}
              <span class="text-text-muted font-normal">· {{ sel.table.capacity }} couv.</span>
            </span>
            <span class="text-xs font-medium" [class]="toneClass()" data-testid="table-tone">
              {{ toneLabel() }}
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

        @if (readOnly()) {
          <!-- SIMULATION : salle projetee, lecture seule -> aucune action reelle. -->
          <p class="text-text-muted text-xs" data-testid="readonly-note">
            Salle projetée à l'heure simulée. Quittez la simulation pour agir sur cette table.
          </p>
        } @else if (sel.status === 'libre' && !walkInEnabled()) {
          <!-- Autre jour consulte : des clients qui arrivent, c'est aujourd'hui. -->
          <p class="text-text-muted text-xs" data-testid="walkin-off-note">
            Table libre ce jour-là. Pour installer des clients, revenez sur le plan d'aujourd'hui.
          </p>
        } @else if (sel.status === 'libre') {
          <!-- Table LIBRE : installer des clients sans reservation. -->
          <div class="flex flex-col gap-3" data-testid="walkin-panel">
            @if (sel.nextTime) {
              <p class="text-text-muted text-xs">
                Réservée plus tard à
                <strong class="text-text-strong">{{ sel.nextTime }}</strong>
                - la table doit être libérée à temps.
              </p>
            }
            <div class="flex items-center gap-2 text-sm">
              <button
                type="button"
                class="border-border bg-surface text-text-strong inline-flex cursor-pointer items-center justify-center rounded border leading-none disabled:cursor-default disabled:opacity-40"
                [class]="large() ? 'size-11 text-2xl' : 'size-7'"
                aria-label="Moins de couverts"
                [disabled]="walkInSize() <= 1"
                (click)="stepWalkIn(-1)"
              >
                −
              </button>
              <span
                class="text-center font-mono font-semibold tabular-nums"
                [class]="large() ? 'min-w-11 text-2xl' : 'min-w-7 text-base'"
              >
                {{ walkInSize() }}
              </span>
              <button
                type="button"
                class="border-border bg-surface text-text-strong inline-flex cursor-pointer items-center justify-center rounded border leading-none disabled:cursor-default disabled:opacity-40"
                [class]="large() ? 'size-11 text-2xl' : 'size-7'"
                aria-label="Plus de couverts"
                [disabled]="walkInSize() >= sel.table.capacity"
                (click)="stepWalkIn(1)"
              >
                +
              </button>
              <span class="text-text-subtle" [class.text-base]="large()">couverts</span>
            </div>
            <hk-button
              [size]="actionSize()"
              class="block [&>button]:w-full"
              data-testid="walkin-confirm"
              (click)="confirmWalkIn()"
            >
              Installer {{ walkInSize() }} couvert{{ walkInSize() > 1 ? 's' : '' }}
            </hk-button>
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
                <hk-button
                  [size]="actionSize()"
                  class="block [&>button]:w-full"
                  (click)="finishService.emit(res)"
                >
                  Terminer le service
                </hk-button>
              } @else if (res.status === 'pending') {
                <!-- Resa EN ATTENTE (bot, web) : l'action principale est de la
                     confirmer, comme dans la liste. Le client peut aussi arriver
                     directement : on l'installe, ce qui vaut confirmation. -->
                <hk-button
                  [size]="actionSize()"
                  class="block [&>button]:w-full"
                  data-testid="card-confirm"
                  (click)="confirmReservation.emit(res)"
                >
                  Confirmer la réservation
                </hk-button>
                <hk-button
                  [size]="actionSize()"
                  variant="secondary"
                  class="block [&>button]:w-full"
                  data-testid="card-arrived"
                  (click)="markArrived.emit(res)"
                >
                  Client arrivé
                </hk-button>
                <!-- Retire la resa de CETTE table sans l'annuler : elle revient dans
                     « Réservations non placées » pour etre posee ailleurs. -->
                <hk-button
                  [size]="actionSize()"
                  variant="secondary"
                  class="block [&>button]:w-full"
                  title="La réservation reste, elle attend une autre table"
                  data-testid="card-unassign"
                  (click)="unassign.emit(res)"
                >
                  Changer de table
                </hk-button>
              } @else {
                <!-- Resa CONFIRMEE : le client qui se presente est l'action principale. -->
                <hk-button
                  [size]="actionSize()"
                  class="block [&>button]:w-full"
                  data-testid="card-arrived"
                  (click)="markArrived.emit(res)"
                >
                  Client arrivé
                </hk-button>
                <!-- Retire la resa de CETTE table sans l'annuler : elle revient dans
                     « Réservations non placées » pour etre posee ailleurs. -->
                <hk-button
                  [size]="actionSize()"
                  variant="secondary"
                  class="block [&>button]:w-full"
                  title="La réservation reste, elle attend une autre table"
                  data-testid="card-unassign"
                  (click)="unassign.emit(res)"
                >
                  Changer de table
                </hk-button>
              }
              <hk-button
                [size]="actionSize()"
                variant="secondary"
                class="block [&>button]:w-full"
                (click)="callReservation.emit(res)"
              >
                Appeler le client
              </hk-button>
              <hk-button
                [size]="actionSize()"
                variant="danger"
                class="block [&>button]:w-full"
                title="Le client ne vient plus : la réservation est annulée"
                data-testid="card-cancel"
                (click)="cancelReservation.emit(res)"
              >
                Annuler la réservation
              </hk-button>
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
  // LECTURE SEULE (simulation) : masque toute action -> pas de mutation reelle
  // depuis une salle projetee.
  readonly readOnly = input(false);
  // Installation de clients (walk-in) : seulement sur le plan du jour courant.
  readonly walkInEnabled = input(true);
  // GRAND FORMAT (mode service / poste d'accueil) : boutons et stepper agrandis
  // pour un tap rapide au comptoir et une bonne lisibilite sur ecran mural.
  readonly large = input(false);

  // Tonalite affichee en en-tete : memes mots et couleurs que les badges de la liste.
  protected readonly toneLabel = computed(() => {
    const view = this.view();
    if (!view) return '';
    const tone = tableTone(view);
    return tone === 'installee' ? 'Clients installés' : TABLE_TONE_LABEL[tone];
  });
  protected readonly toneClass = computed(() => {
    const view = this.view();
    switch (view ? tableTone(view) : 'libre') {
      case 'attente':
        return 'text-st-pending-fg';
      case 'reservee':
        return 'text-st-confirmed-fg';
      case 'installee':
        return 'text-st-seated-fg';
      default:
        return 'text-text-muted';
    }
  });

  // Taille des boutons d'action : grande en mode service, compacte ailleurs.
  protected readonly actionSize = computed(() => (this.large() ? 'lg' : 'sm'));

  readonly closeCard = output<void>();
  readonly walkIn = output<WalkInEvent>();
  readonly confirmReservation = output<Reservation>();
  readonly cancelReservation = output<Reservation>();
  readonly callReservation = output<Reservation>();
  readonly finishService = output<Reservation>();
  readonly markArrived = output<Reservation>();
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
        // Defaut a 2 couverts (le cas le plus frequent) plutot que la capacite
        // pleine : moins de « - » a taper au comptoir pour un petit groupe.
        this.walkInSize.set(Math.min(2, sel.table.capacity));
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

  // « Installer » : GARDE-FOU TEMPOREL - si la prochaine reservation tombe dans
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
