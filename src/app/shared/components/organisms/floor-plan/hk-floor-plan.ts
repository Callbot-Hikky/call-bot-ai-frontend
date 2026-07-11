import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkSkeleton } from '@shared/components/atoms/skeleton/hk-skeleton';
import { HkFloorPlanCanvas } from './hk-floor-plan-canvas';
import { HkFloorPlanLegend } from './hk-floor-plan-legend';
import { Reservation } from '@core/models/reservation.model';
import { FloorTable } from '@core/models/table.model';
import {
  FloorTableView,
  bestFitTableId,
  deriveTableStatus,
  layoutTables,
} from '@core/models/floor-plan.model';
import { GeometryMap, WallSegment } from '@core/models/floor-plan-editor.model';
import { ToastService } from '@core/services/toast.service';
import { formatTime } from '@core/utils/format';
import { downloadDataUrl } from '@core/utils/download';

export interface AssignEvent {
  reservationId: string;
  table: FloorTable;
}

// WALK-IN : installation immediate de clients sans reservation sur une table libre.
export interface WalkInEvent {
  table: FloorTable;
  partySize: number;
}

// Garde-fou temporel du walk-in : on previent si la prochaine reservation de la
// table tombe dans moins de 90 min (le service risque de deborder dessus).
const WALK_IN_GUARD_MIN = 90;

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
      <div class="grid gap-4 lg:grid-cols-[1fr_320px]" [class.h-full]="serviceMode()">
        <div class="flex flex-col gap-3" [class.min-h-0]="serviceMode()">
          <div class="flex items-start justify-between gap-3">
            @if (selectedUnplaced(); as r) {
              <div
                class="bg-st-pending-bg text-st-pending-fg flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm"
              >
                <hk-icon name="lucideInfo" [size]="16" />
                <span>
                  Sélectionnez une table libre pour y placer
                  <strong>{{ r.customerName }}</strong>
                  .
                  @if (bestTable(); as best) {
                    Table recommandée :
                    <strong>{{ best.table.name }}</strong>
                    ({{ best.table.capacity }} couv.)
                  }
                </span>
              </div>
            } @else if (walkInTarget(); as w) {
              <div
                class="bg-st-pending-bg text-st-pending-fg flex flex-1 flex-wrap items-center gap-3 rounded-md px-3 py-2 text-sm"
              >
                <hk-icon name="lucideUsers" [size]="16" />
                <span>
                  Installer des clients sur
                  <strong>{{ w.table.name }}</strong>
                </span>
                <span class="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    class="border-border bg-surface text-text-strong inline-flex size-6 cursor-pointer items-center justify-center rounded border leading-none disabled:cursor-default disabled:opacity-40"
                    aria-label="Moins de couverts"
                    [disabled]="walkInSize() <= 1"
                    (click)="stepWalkIn(-1)"
                  >
                    −
                  </button>
                  <span class="min-w-6 text-center font-mono font-semibold tabular-nums">
                    {{ walkInSize() }}
                  </span>
                  <button
                    type="button"
                    class="border-border bg-surface text-text-strong inline-flex size-6 cursor-pointer items-center justify-center rounded border leading-none disabled:cursor-default disabled:opacity-40"
                    aria-label="Plus de couverts"
                    [disabled]="walkInSize() >= w.table.capacity"
                    (click)="stepWalkIn(1)"
                  >
                    +
                  </button>
                  couverts
                </span>
                <span class="ml-auto flex items-center gap-2">
                  <hk-button size="sm" (click)="confirmWalkIn()">Installer</hk-button>
                  <hk-button size="sm" variant="secondary" (click)="cancelWalkIn()">
                    Annuler
                  </hk-button>
                </span>
              </div>
            } @else {
              <p class="text-text-subtle flex-1 text-sm">
                Cliquez une table libre pour installer des clients sans réservation, une table
                occupée pour voir sa réservation, ou sélectionnez une réservation non placée pour
                l'affecter.
              </p>
            }
            @if (!serviceMode()) {
              <div class="flex items-center gap-2">
                <hk-button variant="secondary" size="sm" (click)="enterService.emit()">
                  <hk-icon name="lucideMaximize" [size]="16" />
                  Mode service
                </hk-button>
                <hk-button variant="secondary" size="sm" (click)="exportPng()">
                  <hk-icon name="lucideDownload" [size]="16" />
                  Exporter
                </hk-button>
                <hk-button variant="secondary" size="sm" (click)="edit.emit()">
                  <hk-icon name="lucidePencil" [size]="16" />
                  Modifier
                </hk-button>
              </div>
            }
          </div>

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
              [walls]="walls()"
              [highlightFree]="!!selectedUnplaced()"
              [bestTableId]="bestTable()?.table?.id ?? null"
              [requiredSeats]="selectedUnplaced()?.partySize ?? null"
              [fill]="serviceMode()"
              [showNames]="serviceMode()"
              [class.block]="serviceMode()"
              [class.min-h-0]="serviceMode()"
              [class.flex-1]="serviceMode()"
              (tableClick)="onTableClick($event)"
            />
          }

          @if (!serviceMode()) {
            <hk-floor-plan-legend />
          }
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
  private readonly toast = inject(ToastService);
  // Canvas Konva reel (undefined pendant loading/error/vide, ou stub en test).
  private readonly canvas = viewChild(HkFloorPlanCanvas);

  readonly reservations = input<Reservation[]>([]);
  readonly tables = input<FloorTable[]>([]);
  // Geometrie du plan EDITE (FloorPlanService, keyee par id back) : quand une table
  // a une entree, la vue service rend sa position + forme + taille + rotation ;
  // sinon repli auto-grille. C'est le bridge editeur -> service (fix D1).
  readonly geometry = input<GeometryMap>({});
  // Murs decoratifs (import Pascal) : fond du canvas, purement visuel.
  readonly walls = input<WallSegment[]>([]);
  readonly loading = input(false);
  readonly error = input(false);
  // MODE SERVICE : le plan remplit son conteneur (pas d'aspect-ratio), affiche les
  // noms clients, masque legende + boutons Exporter/Modifier/Mode service. Les
  // interactions (walk-in, drawer, affectation) restent identiques.
  readonly serviceMode = input(false);

  readonly openReservation = output<Reservation>();
  readonly assign = output<AssignEvent>();
  readonly unassign = output<Reservation>();
  // WALK-IN : installation immediate sur une table libre (la page fait le POST).
  readonly walkIn = output<WalkInEvent>();
  readonly retry = output<void>();
  // Demande d'ouverture de l'editeur de plan (Phase 2).
  readonly edit = output<void>();
  // Demande de passage en mode service plein ecran (gere par la page).
  // Nom NON DOM-natif (evite @angular-eslint/no-output-native).
  readonly enterService = output<void>();

  protected readonly formatTime = formatTime;

  // Reservation non placee selectionnee pour affectation (clic).
  protected readonly selectedUnplacedId = signal<string | null>(null);

  // Placement : geometrie sauvegardee quand elle existe, auto-grille sinon.
  // Ne depend QUE des tables + du plan, pas des reservations, pour ne pas
  // recalculer le layout a chaque changement de reservation.
  private readonly placed = computed(() => layoutTables(this.tables(), this.geometry()));

  // Tables positionnees + statut derive des vraies reservations.
  // HEURE COURANTE : capturee ICI, a chaque reevaluation du computed — donc a
  // chaque refresh du polling (20 s) qui remplace le signal `reservations`.
  // Fraicheur suffisante pour des fenetres de 45/120 min, sans timer dedie.
  protected readonly tableViews = computed<FloorTableView[]>(() => {
    const reservations = this.reservations();
    const now = new Date();
    return this.placed().map((p) => ({
      ...p,
      ...deriveTableStatus(p.table.id, reservations, now),
    }));
  });

  // Reservations du jour ACTIVES sans table (a placer). On exclut annulees /
  // no_show / terminees : les "affecter" laisserait la table Libre (incoherent).
  protected readonly unplaced = computed(() =>
    this.reservations().filter(
      (r) =>
        !r.table && (r.status === 'pending' || r.status === 'confirmed' || r.status === 'seated'),
    ),
  );

  protected readonly selectedUnplaced = computed(() => {
    const id = this.selectedUnplacedId();
    return id ? (this.unplaced().find((r) => r.id === id) ?? null) : null;
  });

  // MEILLEUR FIT (LOT B2) : table libre de capacite minimale suffisante pour la
  // reservation en cours d'affectation. Calcule ICI (le composant a la selection
  // ET les vues de tables) puis passe au canvas via l'input `bestTableId`.
  protected readonly bestTable = computed<FloorTableView | null>(() => {
    const pending = this.selectedUnplaced();
    if (!pending) {
      return null;
    }
    const views = this.tableViews();
    const id = bestFitTableId(views, pending.partySize);
    return id ? (views.find((v) => v.table.id === id) ?? null) : null;
  });

  // WALK-IN : table libre visee par le bandeau « Installer des clients ».
  // On stocke l'ID et on derive la vue COURANTE : si la table cesse d'etre libre
  // (polling, affectation), le bandeau se ferme tout seul — jamais d'etat perime.
  private readonly walkInTableId = signal<string | null>(null);
  protected readonly walkInSize = signal(1);
  protected readonly walkInTarget = computed<FloorTableView | null>(() => {
    const id = this.walkInTableId();
    if (!id) {
      return null;
    }
    return this.tableViews().find((v) => v.table.id === id && v.status === 'libre') ?? null;
  });

  protected toggleUnplaced(reservation: Reservation): void {
    // Les deux bandeaux (affectation / walk-in) sont exclusifs.
    this.walkInTableId.set(null);
    this.selectedUnplacedId.update((id) => (id === reservation.id ? null : reservation.id));
  }

  // Clic table. GARDE-FOU CAPACITE (LOT B1) place ICI (et pas dans la page) : c'est
  // le seul endroit qui connait a la fois la selection, la capacite de la table
  // cliquee et le nombre de couverts — l'output `assign` garde son contrat intact
  // (la page continue de faire l'appel reseau + les toasts succes/erreur).
  protected onTableClick(view: FloorTableView): void {
    const pending = this.selectedUnplaced();
    if (pending && view.status === 'libre') {
      if (pending.partySize > view.table.capacity) {
        // Table trop petite : pas d'affectation directe. Toast d'avertissement avec
        // action « Placer quand meme » ; la selection est CONSERVEE pour permettre
        // de choisir une autre table si l'utilisateur ignore le toast.
        this.toast.show(
          `${view.table.name} n'a que ${view.table.capacity} places pour ${pending.partySize} couverts.`,
          'default',
          {
            label: 'Placer quand même',
            run: () => this.doAssign(pending.id, view.table),
          },
        );
        return;
      }
      // Mode affectation : on place la non placee selectionnee sur cette table libre.
      this.doAssign(pending.id, view.table);
      return;
    }
    if (view.status === 'libre') {
      // WALK-IN (le geste metier n°1) : table libre cliquee sans affectation en
      // cours -> bandeau « Installer des clients » (stepper, defaut = capacite).
      this.walkInSize.set(view.table.capacity);
      this.walkInTableId.set(view.table.id);
      return;
    }
    if (view.reservation) {
      // Table occupee : on ouvre le detail de sa reservation.
      this.openReservation.emit(view.reservation);
    }
  }

  protected stepWalkIn(delta: number): void {
    const max = this.walkInTarget()?.table.capacity ?? 1;
    this.walkInSize.update((n) => Math.min(max, Math.max(1, n + delta)));
  }

  protected cancelWalkIn(): void {
    this.walkInTableId.set(null);
  }

  // « Installer » : GARDE-FOU TEMPOREL (meme pattern que le garde-fou capacite B1) —
  // si la prochaine reservation de la table tombe dans moins de 90 min, pas
  // d'installation directe : toast avec action « Installer quand meme ». Le bandeau
  // reste ouvert pour laisser le choix d'une autre table si le toast est ignore.
  protected confirmWalkIn(): void {
    const target = this.walkInTarget();
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
            run: () => this.doWalkIn(target.table, partySize),
          },
        );
        return;
      }
    }
    this.doWalkIn(target.table, partySize);
  }

  private doWalkIn(table: FloorTable, partySize: number): void {
    this.walkIn.emit({ table, partySize });
    this.walkInTableId.set(null);
  }

  private doAssign(reservationId: string, table: FloorTable): void {
    this.assign.emit({ reservationId, table });
    this.selectedUnplacedId.set(null);
  }

  // PULSE (LOT B3) : relaye vers le canvas la mise en avant d'une table qui vient
  // de recevoir une nouvelle reservation (detectee par le polling de la page).
  pulseTable(tableId: string): void {
    this.canvas()?.pulseTable(tableId);
  }

  // EXPORT PNG (LOT B4) : capture le stage Konva et declenche le telechargement.
  protected exportPng(): void {
    const dataUrl = this.canvas()?.exportPng();
    if (dataUrl) {
      downloadDataUrl(dataUrl, 'plan-de-salle.png');
    }
  }
}
