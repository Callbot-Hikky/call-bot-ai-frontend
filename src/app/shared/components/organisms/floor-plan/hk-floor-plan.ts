import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
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
import { HkFloorPlan3d } from './hk-floor-plan-3d';
import { HkFloorPlanLegend } from './hk-floor-plan-legend';
import { Reservation } from '@core/models/reservation.model';
import { FloorTable } from '@core/models/table.model';
import {
  FloorTableView,
  bestFitTableId,
  deriveTableStatus,
  eveningLoad,
  layoutTables,
  mergeViews,
  planAutoPlacements,
  simulationRange,
  suggestMergeGroup,
  summarizeRoom,
} from '@core/models/floor-plan.model';
import { from, of } from 'rxjs';
import { catchError, concatMap } from 'rxjs/operators';
import { GeometryMap, WallSegment, nextTableName } from '@core/models/floor-plan-editor.model';
import { TableService } from '@core/services/table.service';
import { ToastService } from '@core/services/toast.service';
import { formatTime } from '@core/utils/format';
import { downloadDataUrl } from '@core/utils/download';

export interface AssignEvent {
  reservationId: string;
  table: FloorTable;
}

// FUSION GUIDEE : « aucune table assez grande » -> le plan propose de fusionner
// des tables voisines ET d'y placer la reservation en un clic. La page fait la
// fusion (FloorPlanService.setMerges) puis l'affectation sur l'ANCRE du groupe.
export interface MergeAssignEvent {
  reservationId: string;
  // Ids des tables a fusionner (la premiere est l'ancre).
  tableIds: string[];
  // Table ANCRE (cible de l'affectation reseau).
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
  imports: [HkButton, HkIcon, HkSkeleton, HkFloorPlanCanvas, HkFloorPlan3d, HkFloorPlanLegend],
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
          <!-- Rangee stable (aide + jauge + boutons) : le bandeau d'affectation
               FLOTTE sur le plan (zero layout shift, pleine largeur). -->
          <div class="flex items-center justify-between gap-3">
            <!-- Aide condensee : une icone + tooltip (le texte complet ecrasait la rangee). -->
            <span
              class="text-text-subtle inline-flex flex-1 items-center gap-1.5 text-sm"
              title="Cliquez une table libre pour installer des clients sans réservation, une table occupée pour voir sa réservation, ou sélectionnez une réservation non placée pour l'affecter."
            >
              <hk-icon name="lucideInfo" [size]="15" />
              <span class="hidden whitespace-nowrap min-[1700px]:inline">Comment ça marche ?</span>
            </span>
            <!-- Chaque bouton porte une explication au survol (title) : on comprend
                 AVANT de cliquer, pas apres. -->
            <div class="flex items-center gap-2">
              <!-- SYNTHESE DE SALLE + JAUGE : l'etat et la charge, d'un coup d'oeil. -->
              @if (!serviceMode() && tableViews().length > 0) {
                <span
                  class="text-text-subtle mr-1 hidden text-sm whitespace-nowrap xl:inline"
                  data-testid="room-summary"
                >
                  {{ summary().libres }} libres · {{ summary().reservees }} rés. ·
                  {{ summary().installees }} inst.
                </span>
              }
              @if (!serviceMode() && load().capacity > 0) {
                <span
                  class="text-text-muted mr-1 text-sm whitespace-nowrap tabular-nums"
                  data-testid="evening-load"
                  title="Couverts attendus ce soir (réservations vivantes) rapportés à la capacité totale de la salle"
                >
                  Ce soir :
                  <strong class="text-text-strong">{{ load().couverts }}</strong>
                  / {{ load().capacity }} couv. ({{ load().pct }} %)
                </span>
              }
              <hk-button
                variant="secondary"
                size="sm"
                data-testid="toggle-3d"
                [title]="
                  view3d()
                    ? 'Revenir au plan 2D (vue de travail)'
                    : 'Voir votre salle en 3D, comme si vous y étiez'
                "
                (click)="view3d.set(!view3d())"
              >
                <hk-icon name="lucideBox" [size]="16" />
                {{ view3d() ? 'Vue 2D' : 'Vue 3D' }}
              </hk-button>
              @if (!serviceMode()) {
                <hk-button
                  [variant]="simulating() ? 'primary' : 'secondary'"
                  size="sm"
                  data-testid="toggle-sim"
                  title="Projeter votre salle à n'importe quelle heure de la soirée : voyez où seront les trous et les rushes"
                  (click)="simulating() ? stopSim() : startSim()"
                >
                  <hk-icon name="lucideCalendar" [size]="16" />
                  {{ simulating() ? 'Quitter la simulation' : 'Simuler ma soirée' }}
                </hk-button>
                <hk-button
                  variant="secondary"
                  size="sm"
                  title="Plein écran pour le poste d'accueil pendant le service"
                  (click)="onEnterService()"
                >
                  <hk-icon name="lucideMaximize" [size]="16" />
                  Mode service
                </hk-button>
                <hk-button
                  variant="secondary"
                  size="sm"
                  title="Télécharger le plan affiché en image (brief d'équipe, impression)"
                  (click)="exportPng()"
                >
                  <hk-icon name="lucideDownload" [size]="16" />
                  Exporter
                </hk-button>
                <hk-button
                  variant="secondary"
                  size="sm"
                  title="Modifier la salle : déplacer, créer, supprimer des tables et des murs"
                  (click)="edit.emit()"
                >
                  <hk-icon name="lucidePencil" [size]="16" />
                  Modifier
                </hk-button>
              }
            </div>
          </div>

          @if (tableViews().length === 0) {
            <!-- ONBOARDING (nouveau restaurant, aucune table) : deux chemins au
                 centre du plan, du plus guide au plus libre. -->
            <div
              class="border-border flex flex-col items-center justify-center gap-6 rounded-md border px-6 py-8"
              style="aspect-ratio: 16 / 10; min-height: 320px; background: #faf7f1"
              data-testid="plan-onboarding"
            >
              <div class="flex flex-col items-center gap-1 text-center">
                <h3 class="text-text-strong text-lg font-semibold">Créons votre salle</h3>
                <p class="text-text-subtle text-sm">
                  Deux minutes suffisent, tout reste modifiable ensuite.
                </p>
              </div>
              <div class="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
                <!-- Chemin 1 : configuration rapide guidee. -->
                <div class="bg-card border-border flex flex-col gap-3 rounded-md border p-4">
                  <span class="text-text-strong text-sm font-semibold">Configuration rapide</span>
                  <label class="text-text-subtle flex items-center justify-between gap-2 text-sm">
                    Combien de tables ?
                    <input
                      type="number"
                      min="1"
                      max="40"
                      data-testid="quick-tables"
                      class="border-border bg-background w-20 rounded-sm border px-2 py-1.5 text-right font-mono text-sm"
                      [value]="quickTables()"
                      (input)="onQuickTables($event)"
                    />
                  </label>
                  <label class="text-text-subtle flex items-center justify-between gap-2 text-sm">
                    Couverts par table ?
                    <input
                      type="number"
                      min="1"
                      max="20"
                      data-testid="quick-seats"
                      class="border-border bg-background w-20 rounded-sm border px-2 py-1.5 text-right font-mono text-sm"
                      [value]="quickSeats()"
                      (input)="onQuickSeats($event)"
                    />
                  </label>
                  <hk-button
                    size="sm"
                    data-testid="quick-create"
                    [disabled]="quickCreating()"
                    (click)="quickSetup()"
                  >
                    {{ quickCreating() ? 'Création…' : 'Créer ma salle' }}
                  </hk-button>
                </div>
                <!-- Chemin 2 : construction libre (editeur, templates, scan 3D). -->
                <div class="bg-card border-border flex flex-col gap-3 rounded-md border p-4">
                  <span class="text-text-strong text-sm font-semibold">Construire moi-même</span>
                  <p class="text-text-subtle flex-1 text-sm">
                    Posez vos tables une à une, partez d'un modèle de salle, ou importez un scan 3D
                    de votre restaurant (Pascal).
                  </p>
                  <hk-button size="sm" variant="secondary" (click)="edit.emit()">
                    <hk-icon name="lucidePencil" [size]="16" />
                    Ouvrir l'éditeur
                  </hk-button>
                </div>
              </div>
            </div>
          } @else {
            <!-- ZONE DU PLAN : conteneur RELATIF -> les controles contextuels
                 (simulation, vitrine) FLOTTENT au-dessus du canvas. Apparaitre /
                 disparaitre ne decale JAMAIS la mise en page (zero layout shift). -->
            <div class="relative" [class.min-h-0]="serviceMode()" [class.flex-1]="serviceMode()">
              <!-- BANDEAU D'AFFECTATION : flotte sur le plan, pleine largeur —
                   le texte respire et RIEN ne bouge en dessous (zero shift). -->
              @if (selectedUnplaced(); as r) {
                <!-- pointer-events-none : les tables sous le bandeau restent
                     cliquables ; seuls les boutons captent les clics. -->
                <div
                  class="bg-st-pending-bg/85 border-st-pending-fg/25 pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-3 rounded-xl border px-4 py-2.5 shadow-lg backdrop-blur-sm"
                  [class.right-3]="!view3d()"
                  [class.right-24]="view3d()"
                  data-testid="assign-banner"
                >
                  <hk-icon name="lucideInfo" [size]="16" class="text-st-pending-fg shrink-0" />
                  <span class="text-st-pending-fg min-w-0 flex-1 text-sm">
                    Sélectionnez une table libre pour y placer
                    <strong>{{ r.customerName }}</strong>
                    ({{ r.partySize }} couv.).
                    @if (bestTable(); as best) {
                      @if (best.shape === 'bar' && mergeSuggestion()) {
                        Seul le bar
                        <strong>{{ best.table.name }}</strong>
                        est assez grand — ou fusionnez
                        <strong>{{ mergeSuggestionLabel() }}</strong>
                        en une tablée.
                      } @else {
                        Table recommandée :
                        <strong>{{ best.table.name }}</strong>
                        ({{ best.table.capacity }} couv.)
                      }
                    } @else if (mergeSuggestion()) {
                      Aucune table libre n'est assez grande — fusionnez
                      <strong>{{ mergeSuggestionLabel() }}</strong>
                      en une tablée.
                    } @else {
                      Aucune table libre n'est assez grande pour le moment.
                    }
                  </span>
                  @if (mergeSuggestion()) {
                    <hk-button
                      size="sm"
                      class="pointer-events-auto"
                      data-testid="merge-assign"
                      title="Fusionner ces tables voisines en une tablée et y placer la réservation"
                      (click)="acceptMergeSuggestion()"
                    >
                      Fusionner et placer
                    </hk-button>
                  }
                  <button
                    type="button"
                    class="text-st-pending-fg hover:bg-st-pending-fg/10 pointer-events-auto shrink-0 cursor-pointer rounded-sm p-1"
                    title="Annuler la sélection"
                    (click)="selectedUnplacedId.set(null)"
                  >
                    <hk-icon name="lucideX" [size]="16" />
                  </button>
                </div>
              }
              @if (view3d()) {
                <!-- Vue 3D interactive (statuts live) : memes actions qu'en 2D. -->
                <hk-floor-plan-3d
                  class="block"
                  [views]="tableViews()"
                  [walls]="walls()"
                  [orbit]="vitrine()"
                  [fill]="serviceMode()"
                  [class.h-full]="serviceMode()"
                  (tableClick)="onTableClick($event)"
                />
                <!-- Vitrine : controle contextuel POSE sur la 3D (coin haut droit). -->
                <div class="absolute top-3 right-3 z-10">
                  <hk-button
                    [variant]="vitrine() ? 'primary' : 'secondary'"
                    size="sm"
                    data-testid="toggle-vitrine"
                    (click)="vitrine.set(!vitrine())"
                  >
                    Vitrine
                  </hk-button>
                </div>
              } @else {
                <hk-floor-plan-canvas
                  class="block"
                  [tables]="tableViews()"
                  [walls]="walls()"
                  [highlightFree]="!!selectedUnplaced()"
                  [bestTableId]="bestTable()?.table?.id ?? null"
                  [requiredSeats]="selectedUnplaced()?.partySize ?? null"
                  [focusTableId]="canvasFocusId()"
                  [fill]="serviceMode()"
                  [showNames]="serviceMode()"
                  [class.h-full]="serviceMode()"
                  (tableClick)="onTableClick($event)"
                />
              }

              <!-- BARRE DE SIMULATION : scrubber FLOTTANT en bas du plan (comme
                   une timeline video). Fond ambre + flou : on ne confond jamais
                   projection et direct, et rien ne bouge en dessous. -->
              @if (simulating()) {
                <div
                  class="bg-st-pending-bg/95 border-st-pending-fg/25 absolute right-4 bottom-4 left-4 z-10 flex flex-col gap-2.5 rounded-xl border px-5 py-3.5 shadow-xl backdrop-blur-md"
                  data-testid="sim-bar"
                >
                  <!-- Titre + explication : on comprend ce qu'on regarde. -->
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex min-w-0 items-center gap-2.5">
                      <span
                        class="bg-st-pending-fg rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest text-white uppercase"
                      >
                        Simulation
                      </span>
                      <span class="text-st-pending-fg/90 truncate text-xs">
                        Votre salle projetée à l'heure choisie — rien n'est modifié, glissez pour
                        explorer la soirée.
                      </span>
                    </div>
                    <hk-button
                      size="sm"
                      variant="secondary"
                      title="Quitter la projection et revenir à la salle en temps réel"
                      (click)="stopSim()"
                    >
                      Revenir au direct
                    </hk-button>
                  </div>
                  <!-- Horloge + timeline bornée + réponse de dispo. -->
                  <div class="flex items-center gap-5">
                    <span
                      class="text-st-pending-fg font-mono text-3xl leading-none font-bold tabular-nums"
                      data-testid="sim-time"
                    >
                      {{ simLabel() }}
                    </span>
                    <div class="flex min-w-32 flex-1 flex-col gap-1">
                      <input
                        type="range"
                        class="accent-st-pending-fg h-2 w-full cursor-pointer"
                        min="0"
                        [max]="simTotalMinutes()"
                        step="15"
                        [value]="simMinutes()"
                        aria-label="Heure simulée"
                        data-testid="sim-slider"
                        (input)="onSimSlide($event)"
                      />
                      <div
                        class="text-st-pending-fg/70 flex justify-between font-mono text-[10px] tabular-nums"
                      >
                        <span>{{ simStartLabel() }}</span>
                        <span>{{ simEndLabel() }}</span>
                      </div>
                    </div>
                    <span
                      class="text-st-pending-fg text-right text-sm leading-tight whitespace-nowrap"
                      data-testid="sim-summary"
                    >
                      <strong class="text-base">{{ simFree().tables }} table(s) libre(s)</strong>
                      <br />
                      <span class="text-st-pending-fg/80">
                        {{ simFree().couverts }} couverts disponibles
                      </span>
                    </span>
                  </div>
                </div>
              }
            </div>
          }

          @if (!serviceMode()) {
            <hk-floor-plan-legend />
          }
        </div>

        <aside class="bg-card border-border flex flex-col rounded-md border">
          <!-- WALK-IN : le panneau d'action vit A DROITE, comme le drawer d'une
               table occupee -> un clic de table repond TOUJOURS au meme endroit. -->
          @if (walkInTarget(); as w) {
            <div
              class="border-border bg-st-pending-bg flex flex-col gap-3 border-b p-4"
              data-testid="walkin-panel"
            >
              <div class="text-st-pending-fg flex items-center gap-2 text-sm font-semibold">
                <hk-icon name="lucideUsers" [size]="16" />
                Installer des clients sur {{ w.table.name }}
              </div>
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
                  [disabled]="walkInSize() >= w.table.capacity"
                  (click)="stepWalkIn(1)"
                >
                  +
                </button>
                <span class="text-text-subtle">couverts</span>
              </div>
              <div class="flex items-center gap-2">
                <hk-button size="sm" class="flex-1" (click)="confirmWalkIn()">Installer</hk-button>
                <hk-button size="sm" variant="secondary" (click)="cancelWalkIn()">
                  Annuler
                </hk-button>
              </div>
            </div>
          }
          <div class="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
            <h3 class="text-text-strong text-sm font-semibold">Réservations non placées</h3>
            <div class="flex items-center gap-2">
              @if (unplaced().length > 0 && !simulating()) {
                <hk-button
                  size="sm"
                  variant="secondary"
                  data-testid="place-all"
                  title="Placer chaque réservation sur la meilleure table libre (les grandes tablées d'abord)"
                  (click)="placeAll()"
                >
                  Tout placer
                </hk-button>
              }
              <span
                class="bg-muted text-text-muted inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium"
              >
                {{ unplaced().length }}
              </span>
            </div>
          </div>

          @if (unplaced().length === 0) {
            <p class="text-text-subtle px-4 py-8 text-center text-sm">
              Toutes les réservations du jour sont placées.
            </p>
          } @else {
            <ul class="divide-border flex flex-col divide-y">
              @for (r of unplaced(); track r.id) {
                <!-- SURVOL : la meilleure table pulse sur le plan avant tout clic
                     (mouseenter/mouseleave -> bestTable via hoveredUnplacedId). -->
                <li class="flex items-center">
                  <button
                    type="button"
                    class="hover:bg-muted flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-l-2 px-4 py-3 text-left transition-colors"
                    [class]="
                      selectedUnplacedId() === r.id
                        ? 'bg-st-pending-bg/60 border-st-pending-fg'
                        : 'border-transparent'
                    "
                    [attr.aria-pressed]="selectedUnplacedId() === r.id"
                    (click)="toggleUnplaced(r)"
                    (mouseenter)="hoveredUnplacedId.set(r.id)"
                    (mouseleave)="hoveredUnplacedId.set(null)"
                  >
                    <span class="flex min-w-0 flex-1 flex-col">
                      <span class="text-text-strong truncate text-sm font-medium">
                        {{ r.customerName }}
                      </span>
                      <span class="text-text-muted font-mono text-xs tabular-nums">
                        {{ formatTime(r.dateTime) }} · {{ r.partySize }} couv.
                      </span>
                      @if (r.notes) {
                        <!-- La note du client (« Anniversaire ») : le contexte
                             qui aide a choisir la bonne table. -->
                        <span class="text-text-subtle truncate text-xs italic">
                          {{ r.notes }}
                        </span>
                      }
                    </span>
                    @if (selectedUnplacedId() === r.id) {
                      <hk-icon name="lucideCheck" [size]="16" class="text-st-pending-fg" />
                    }
                  </button>
                  @if (!simulating()) {
                    <div class="pr-3">
                      <hk-button
                        size="sm"
                        variant="ghost"
                        [attr.data-testid]="'place-one-' + r.id"
                        title="Placer sur la meilleure table libre"
                        (click)="placeOne(r, $event)"
                      >
                        Placer
                      </hk-button>
                    </div>
                  }
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

  // Derniere preselection APPLIQUEE : l'effect ne rejoue pas la meme valeur
  // (sinon chaque refresh 20 s rouvrirait un bandeau que l'hote a ferme).
  private appliedPreselectId: string | null = null;

  constructor() {
    // PRESELECTION (« Placer » depuis la liste) : appliquee UNE fois par id,
    // des que la resa figure dans les non placees.
    effect(() => {
      const id = this.preselectId();
      if (id && id !== this.appliedPreselectId && this.unplaced().some((r) => r.id === id)) {
        this.appliedPreselectId = id;
        this.walkInTableId.set(null);
        this.selectedUnplacedId.set(id);
      }
    });
  }

  // Configuration rapide (onboarding) : creation directe de vraies tables.
  private readonly tableService = inject(TableService);
  // Canvas Konva reel (undefined pendant loading/error/vide, ou stub en test).
  private readonly canvas = viewChild(HkFloorPlanCanvas);
  private readonly canvas3d = viewChild(HkFloorPlan3d);

  readonly reservations = input<Reservation[]>([]);
  readonly tables = input<FloorTable[]>([]);
  // Geometrie du plan EDITE (FloorPlanService, keyee par id back) : quand une table
  // a une entree, la vue service rend sa position + forme + taille + rotation ;
  // sinon repli auto-grille. C'est le bridge editeur -> service (fix D1).
  readonly geometry = input<GeometryMap>({});
  // Murs decoratifs (import Pascal) : fond du canvas, purement visuel.
  readonly walls = input<WallSegment[]>([]);
  // Groupes de tables FUSIONNEES : rendus comme UNE tablee (bloc englobant).
  readonly merges = input<string[][]>([]);
  readonly loading = input(false);
  readonly error = input(false);
  // MODE SERVICE : le plan remplit son conteneur (pas d'aspect-ratio), affiche les
  // noms clients, masque legende + boutons Exporter/Modifier/Mode service. Les
  // interactions (walk-in, drawer, affectation) restent identiques.
  readonly serviceMode = input(false);
  // Nom du restaurant, imprime en en-tete de l'export PNG.
  readonly restaurantName = input('Le Bistrot du Coin');
  // FOCUS : table dont le drawer de detail est ouvert (fourni par la page) ->
  // elle reste allumee, les autres s'attenuent sur le canvas.
  readonly focusTableId = input<string | null>(null);
  // PRESELECTION (« Placer » depuis la liste, /plan?placer=id) : la resa arrive
  // deja selectionnee, bandeau d'affectation ouvert, meilleure table surlignee.
  readonly preselectId = input<string | null>(null);

  // Vue 3D decorative (Three.js, statuts live). La 2D reste la vue d'ACTION
  // (clics, affectation) : la 3D est un ecran de presentation / d'accueil.
  protected readonly view3d = signal(false);
  // Mode VITRINE de la 3D : orbite lente automatique (ecran d'accueil/mural).
  protected readonly vitrine = signal(false);

  // --- Configuration rapide (onboarding, aucune table) --------------------------
  // « Combien de tables ? Combien de couverts ? » -> creation de N vraies tables
  // (POST sequentiels), positions auto-grille ; l'editeur affine ensuite.
  protected readonly quickTables = signal(10);
  protected readonly quickSeats = signal(4);
  protected readonly quickCreating = signal(false);

  protected onQuickTables(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(raw)) {
      this.quickTables.set(Math.max(1, Math.min(40, Math.round(raw))));
    }
  }

  protected onQuickSeats(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(raw)) {
      this.quickSeats.set(Math.max(1, Math.min(20, Math.round(raw))));
    }
  }

  protected quickSetup(): void {
    if (this.quickCreating()) {
      return;
    }
    const count = this.quickTables();
    const capacity = this.quickSeats();
    this.quickCreating.set(true);
    let failed = false;

    from(Array.from({ length: count }))
      .pipe(
        concatMap(() =>
          this.tableService
            .create({
              name: nextTableName(this.tableService.tables().map((t) => t.name)),
              capacity,
            })
            .pipe(
              catchError(() => {
                failed = true;
                return of(null);
              }),
            ),
        ),
      )
      .subscribe({
        complete: () => {
          this.quickCreating.set(false);
          if (failed) {
            this.toast.show('Certaines tables n’ont pas pu être créées. Réessayez.', 'error');
          } else {
            this.toast.show(`${count} tables créées. Ouvrez l'éditeur pour organiser votre salle.`);
          }
        },
      });
  }

  readonly openReservation = output<Reservation>();
  readonly assign = output<AssignEvent>();
  // Fusion guidee + affectation (« aucune table assez grande »).
  readonly mergeAssign = output<MergeAssignEvent>();
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
  // Reservation non placee SURVOLEE : la meilleure table pulse deja sur le plan
  // avant tout clic (la salle « repond » au survol).
  protected readonly hoveredUnplacedId = signal<string | null>(null);

  // Placement : geometrie sauvegardee quand elle existe, auto-grille sinon.
  // Ne depend QUE des tables + du plan, pas des reservations, pour ne pas
  // recalculer le layout a chaque changement de reservation.
  private readonly placed = computed(() => layoutTables(this.tables(), this.geometry()));

  // Tables positionnees + statut derive des vraies reservations.
  // HEURE DE REFERENCE des statuts :
  //  - en direct : capturee a chaque reevaluation du computed — donc a chaque
  //    refresh du polling (20 s). Fraicheur suffisante, sans timer dedie ;
  //  - en SIMULATION : l'heure du slider remplace l'horloge — toute la salle
  //    (2D ET 3D, memes vues) se projette a l'instant choisi.
  protected readonly tableViews = computed<FloorTableView[]>(() => {
    const reservations = this.reservations();
    const simulated = this.simNow();
    const now = simulated ?? new Date();
    const views = this.placed().map((p) => ({
      ...p,
      // `projected` en simulation : les tables installees se liberent apres la
      // duree de service estimee (sinon la projection mentirait sur le futur).
      ...deriveTableStatus(p.table.id, reservations, now, simulated !== null),
    }));
    // Tables fusionnees : chaque groupe devient UNE tablee (2D ET 3D).
    return mergeViews(views, this.merges());
  });

  // --- Simulation de la soiree (« Simuler ma soiree ») ---------------------------
  // La derivation de statut est une fonction PURE de `now` : simuler = glisser
  // l'heure de reference. Aucune donnee modifiee, aucune requete — projection pure.
  protected readonly simulating = signal(false);
  // Position du slider : minutes ecoulees depuis le debut de la plage.
  protected readonly simMinutes = signal(0);

  // Bornes de la soiree, derivees des reservations du jour (arrondies a l'heure).
  protected readonly simRange = computed(() => simulationRange(this.reservations()));
  // Longueur du slider (minutes).
  protected readonly simTotalMinutes = computed(() =>
    Math.max(60, (this.simRange().end.getTime() - this.simRange().start.getTime()) / 60_000),
  );
  // Heure simulee (null hors simulation) : l'horloge de TOUTE la salle.
  // `simMinutes` est re-borne ICI : si la plage retrecit pendant la simulation
  // (resa annulee au polling), la projection reste dans la fenetre.
  protected readonly simNow = computed<Date | null>(() =>
    this.simulating()
      ? new Date(
          this.simRange().start.getTime() +
            Math.min(this.simMinutes(), this.simTotalMinutes()) * 60_000,
        )
      : null,
  );
  protected readonly simLabel = computed(() => {
    const d = this.simNow();
    return d ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
  });
  // Bornes affichees sous la timeline (l'utilisateur voit l'etendue de la soiree).
  protected readonly simStartLabel = computed(() =>
    this.simRange().start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  );
  protected readonly simEndLabel = computed(() =>
    this.simRange().end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  );
  // « A 20:30 : 5 tables libres · 18 couverts disponibles » — la reponse a
  // « puis-je accepter une resa a cette heure-la ? », lisible sans compter.
  protected readonly simFree = computed(() => {
    const free = this.tableViews().filter((v) => v.status === 'libre');
    return {
      tables: free.length,
      couverts: free.reduce((sum, v) => sum + v.table.capacity, 0),
    };
  });

  protected startSim(): void {
    // Le slider demarre a l'heure COURANTE si elle tombe dans la plage (on part
    // de la realite), sinon au debut de la soiree.
    const { start } = this.simRange();
    const offset = Math.round((Date.now() - start.getTime()) / 60_000);
    this.simMinutes.set(Math.max(0, Math.min(this.simTotalMinutes(), offset)));
    this.simulating.set(true);
    // Les actions live n'ont pas de sens sur une salle projetee : on ferme le
    // walk-in ET l'affectation en cours (sinon le surlignage « meilleure table »
    // continuerait de suggerer une action impossible).
    this.cancelWalkIn();
    this.selectedUnplacedId.set(null);
  }

  protected stopSim(): void {
    this.simulating.set(false);
  }

  protected onSimSlide(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(raw)) {
      this.simMinutes.set(Math.max(0, Math.min(this.simTotalMinutes(), Math.round(raw))));
    }
  }

  // Passage en mode service : toujours en DIRECT (la simulation est un outil de
  // preparation, pas de rush).
  protected onEnterService(): void {
    this.stopSim();
    this.enterService.emit();
  }

  // Reservations du jour ACTIVES sans table (a placer). On exclut annulees /
  // no_show / terminees : les "affecter" laisserait la table Libre (incoherent).
  protected readonly unplaced = computed(() =>
    this.reservations()
      .filter(
        (r) =>
          !r.table && (r.status === 'pending' || r.status === 'confirmed' || r.status === 'seated'),
      )
      // Triees par heure : l'hote traite la file chronologiquement.
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime)),
  );

  protected readonly selectedUnplaced = computed(() => {
    const id = this.selectedUnplacedId();
    return id ? (this.unplaced().find((r) => r.id === id) ?? null) : null;
  });

  // MEILLEUR FIT (LOT B2) : table libre de capacite minimale suffisante pour la
  // reservation en cours d'affectation OU survolee. Calcule ICI (le composant a
  // la selection ET les vues) puis passe au canvas via l'input `bestTableId`.
  // Garde-fou horaire : l'heure de la resa ecarte les tables au prochain service.
  protected readonly bestTable = computed<FloorTableView | null>(() => {
    if (this.simulating()) {
      return null; // salle projetee : aucune suggestion d'action live.
    }
    const pending = this.selectedUnplaced() ?? this.hoveredUnplaced();
    if (!pending) {
      return null;
    }
    const views = this.tableViews();
    const id = bestFitTableId(views, pending.partySize, pending.dateTime);
    return id ? (views.find((v) => v.table.id === id) ?? null) : null;
  });

  // JAUGE DE SOIREE : couverts attendus / capacite totale (fonction pure).
  protected readonly load = computed(() => eveningLoad(this.reservations(), this.tables()));

  // SYNTHESE DE SALLE compacte (libres / reservees / installees) hors mode
  // service — la meme que le bandeau service, disponible en permanence.
  protected readonly summary = computed(() => summarizeRoom(this.tableViews()));

  // FOCUS effectif du canvas : la table visee par le bandeau walk-in (interne)
  // prime, sinon la table du drawer ouvert (input de la page). Une table membre
  // d'une tablee fusionnee est resolue vers son ANCRE (seul noeud rendu).
  protected readonly canvasFocusId = computed(() => {
    const walkInId = this.walkInTarget()?.table.id;
    if (walkInId) {
      return walkInId;
    }
    const id = this.focusTableId();
    if (!id) {
      return null;
    }
    const group = this.merges().find((g) => g.includes(id));
    const anchor = group && this.tableViews().find((v) => group.includes(v.table.id));
    return anchor?.table.id ?? id;
  });

  protected readonly hoveredUnplaced = computed(() => {
    const id = this.hoveredUnplacedId();
    return id ? (this.unplaced().find((r) => r.id === id) ?? null) : null;
  });

  // SUGGESTION DE FUSION : la resa selectionnee ne tient sur aucune VRAIE table
  // libre (le bar en dernier recours ne compte pas — on n'assoit pas une tablee
  // au comptoir sans proposer mieux) -> groupe de tables voisines fusionnables.
  protected readonly mergeSuggestion = computed<FloorTableView[] | null>(() => {
    const pending = this.selectedUnplaced();
    const best = this.bestTable();
    if (!pending || this.simulating() || (best && best.shape !== 'bar')) {
      return null;
    }
    return suggestMergeGroup(this.tableViews(), pending.partySize, this.merges());
  });

  // Libelle « T10+T11 (8 couv.) » de la suggestion de fusion.
  protected readonly mergeSuggestionLabel = computed(() => {
    const group = this.mergeSuggestion();
    if (!group) {
      return '';
    }
    const capacity = group.reduce((sum, v) => sum + v.table.capacity, 0);
    return `${group.map((v) => v.table.name).join('+')} (${capacity} couv.)`;
  });

  protected acceptMergeSuggestion(): void {
    const pending = this.selectedUnplaced();
    const group = this.mergeSuggestion();
    if (!pending || !group) {
      return;
    }
    this.mergeAssign.emit({
      reservationId: pending.id,
      tableIds: group.map((v) => v.table.id),
      table: group[0].table,
    });
    this.selectedUnplacedId.set(null);
  }

  // PLACEMENT AUTO : place TOUTES les resas non placees possibles en un clic
  // (glouton, les grandes tablees d'abord). Les resas sans table restent listees.
  protected placeAll(): void {
    const placements = planAutoPlacements(this.tableViews(), this.unplaced());
    if (placements.length === 0) {
      this.toast.show('Aucune table libre ne convient pour le moment.');
      return;
    }
    const views = this.tableViews();
    for (const p of placements) {
      const view = views.find((v) => v.table.id === p.tableId);
      if (view) {
        this.assign.emit({ reservationId: p.reservationId, table: view.table });
      }
    }
    this.selectedUnplacedId.set(null);
  }

  // Place UNE resa sur sa meilleure table ; sans solution, la selectionne pour
  // afficher la suggestion de fusion (ou l'absence de solution).
  protected placeOne(reservation: Reservation, event: Event): void {
    event.stopPropagation();
    const views = this.tableViews();
    const id = bestFitTableId(views, reservation.partySize, reservation.dateTime);
    const view = id ? views.find((v) => v.table.id === id) : null;
    if (view) {
      this.assign.emit({ reservationId: reservation.id, table: view.table });
      if (this.selectedUnplacedId() === reservation.id) {
        this.selectedUnplacedId.set(null);
      }
      return;
    }
    this.walkInTableId.set(null);
    this.selectedUnplacedId.set(reservation.id);
  }

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
    // SIMULATION : la salle affichee est une projection — agir sur une table
    // libre « du futur » creerait une resa au present. On guide vers le direct.
    if (this.simulating() && view.status === 'libre') {
      this.toast.show('Mode simulation : revenez au direct pour agir sur les tables.', 'default', {
        label: 'Revenir au direct',
        run: () => this.stopSim(),
      });
      return;
    }
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

  // PULSE (LOT B3) : relaye vers la vue AFFICHEE la mise en avant d'une table qui
  // vient de recevoir une nouvelle reservation (detectee par le polling de la page).
  // Table membre d'une tablee fusionnee : le pulse vise l'ANCRE du groupe (seul
  // noeud rendu pour le groupe).
  pulseTable(tableId: string): void {
    const group = this.merges().find((g) => g.includes(tableId));
    // L'ancre est le noeud effectivement rendu pour le groupe (id d'une vue).
    const anchor = group && this.tableViews().find((v) => group.includes(v.table.id));
    const targetId = anchor?.table.id ?? tableId;
    this.canvas()?.pulseTable(targetId);
    this.canvas3d()?.pulseTable(targetId);
  }

  // EXPORT PNG (LOT B4) : capture le stage Konva et declenche le telechargement.
  // EN-TETE contextualise : nom du restaurant + date/heure + jauge composes
  // au-dessus de la capture -> l'image imprimee est AUTOPORTANTE (brief d'equipe,
  // affichage en cuisine) sans avoir a se souvenir de quand elle date.
  protected exportPng(): void {
    // Exporte la vue AFFICHEE : plan 2D (Konva) ou maquette 3D (WebGL).
    const dataUrl = this.view3d() ? this.canvas3d()?.exportPng() : this.canvas()?.exportPng();
    if (!dataUrl) {
      return;
    }
    const image = new Image();
    // Si la composition echoue (contexte 2D indisponible), on livre la capture brute.
    image.onerror = () => downloadDataUrl(dataUrl, 'plan-de-salle.png');
    image.onload = () => {
      const header = 72;
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height + header;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        downloadDataUrl(dataUrl, 'plan-de-salle.png');
        return;
      }
      ctx.fillStyle = '#faf7f1';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1c1917';
      ctx.font = '600 26px system-ui, sans-serif';
      ctx.fillText(this.restaurantName(), 24, header / 2);
      const stamp = new Date().toLocaleString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
      const load = this.load();
      const context =
        load.capacity > 0 ? `${stamp} · ${load.couverts}/${load.capacity} couv.` : stamp;
      ctx.font = '17px system-ui, sans-serif';
      ctx.fillStyle = '#57534e';
      ctx.textAlign = 'right';
      ctx.fillText(context, canvas.width - 24, header / 2);
      ctx.drawImage(image, 0, header);
      downloadDataUrl(canvas.toDataURL('image/png'), 'plan-de-salle.png');
    };
    image.src = dataUrl;
  }
}
