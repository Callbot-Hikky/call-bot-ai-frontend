import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  model,
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
import { HkTableTimeline } from '@shared/components/molecules/table-timeline/hk-table-timeline';
import { HkTableCard } from './hk-table-card';
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

import { AssignEvent, MergeAssignEvent, WalkInEvent } from './hk-floor-plan-events';
export type { AssignEvent, MergeAssignEvent, WalkInEvent } from './hk-floor-plan-events';

// Plan de salle (Phase 1) : canvas Konva + panneau des non placees + legende.
// Orchestre la derivation de statut et l'affectation au clic. Etats chargement
// (skeleton) et erreur (bandeau + reessayer) geres ici.
@Component({
  selector: 'hk-floor-plan',
  imports: [
    HkButton,
    HkIcon,
    HkSkeleton,
    HkFloorPlanCanvas,
    HkFloorPlan3d,
    HkFloorPlanLegend,
    HkTableTimeline,
    HkTableCard,
  ],
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
    } @else if (portrait()) {
      <!-- MOBILE PORTRAIT : tuiles triees par urgence + bottom sheet d'action.
           Le plan spatial revient en paysage ; ici on OPERE la salle. -->
      <div class="flex flex-col gap-3">
        <div class="text-text-muted flex items-center justify-between px-1 text-xs">
          <span>{{ summary().libres }} libres · {{ summary().installees }} occupées</span>
          @if (unplaced().length > 0) {
            <span class="text-st-cancelled-fg font-semibold">
              {{ unplaced().length }} à placer
            </span>
          }
        </div>

        <!-- A PLACER (portrait) : les resas sans table. Toucher une resa la
             selectionne, puis toucher une tuile LIBRE l'affecte (garde capacite).
             Sans ca, « Placer » depuis la liste serait un cul-de-sac en portrait. -->
        @if (unplaced().length > 0) {
          <div
            class="border-st-pending-fg/25 bg-st-pending-bg/60 flex flex-col gap-2 rounded-xl border p-3"
            data-testid="portrait-unplaced"
          >
            @if (selectedUnplaced(); as r) {
              <p class="text-st-pending-fg text-xs font-medium">
                Touchez une table libre pour y placer
                <strong>{{ r.customerName }}</strong>
                ({{ r.partySize }} couv.).
                <button
                  type="button"
                  class="text-st-pending-fg ml-1 cursor-pointer underline"
                  (click)="selectedUnplacedId.set(null)"
                >
                  Annuler
                </button>
              </p>
            } @else {
              <p class="text-text-muted text-xs">À placer - touchez une réservation :</p>
            }
            <div class="flex flex-wrap gap-1.5">
              @for (r of unplaced(); track r.id) {
                <button
                  type="button"
                  class="border-border bg-surface cursor-pointer rounded-lg border px-2.5 py-1.5 text-left text-xs"
                  [class.ring-2]="r.id === selectedUnplacedId()"
                  [class.ring-primary]="r.id === selectedUnplacedId()"
                  (click)="selectedUnplacedId.set(r.id === selectedUnplacedId() ? null : r.id)"
                >
                  <span class="text-text-strong font-semibold">{{ r.customerName }}</span>
                  <span class="text-text-subtle"
                    >· {{ r.partySize }}c · {{ formatTime(r.dateTime) }}</span
                  >
                </button>
              }
            </div>
          </div>
        }

        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="portrait-tiles">
          @for (v of tilesOrder(); track v.table.id) {
            <button
              type="button"
              class="flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors"
              [class]="tileClasses(v)"
              (click)="selectTile(v)"
            >
              <span class="flex items-center justify-between">
                <span class="text-text-strong text-sm font-bold">{{ v.table.name }}</span>
                <span class="text-text-subtle text-[11px]">{{ v.table.capacity }} c.</span>
              </span>
              <span class="text-[11px] font-medium" [class]="tileStatusClass(v)">
                @if (v.lateMinutes; as late) {
                  +{{ late }} min de retard
                } @else if (v.status === 'installee') {
                  Installée{{ v.reservation ? ' · ' + formatTime(v.reservation.dateTime) : '' }}
                } @else if (v.status === 'reservee') {
                  Réservée{{ v.reservation ? ' · ' + formatTime(v.reservation.dateTime) : '' }}
                } @else {
                  Libre{{ v.nextTime ? ' · → ' + v.nextTime : '' }}
                }
              </span>
            </button>
          }
        </div>
      </div>

      <!-- BOTTOM SHEET : la carte de la table remonte du bas (portrait ET
           paysage compact). On garde le contexte du plan/tuiles derriere. -->
      @if (selectedTableView()) {
        <button
          type="button"
          class="fixed inset-0 z-40 cursor-default bg-black/30"
          aria-label="Fermer la carte de table"
          data-testid="sheet-backdrop"
          (click)="closeInspector()"
        ></button>
        <div
          class="bg-card fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t shadow-2xl"
          data-testid="table-sheet"
        >
          <div class="flex justify-center pt-2">
            <span class="bg-border h-1 w-10 rounded-full"></span>
          </div>
          <hk-table-card
            [view]="selectedTableView()"
            [tableReservations]="selectedTableReservations()"
            [readOnly]="simulating()"
            [large]="serviceMode()"
            [showClose]="false"
            (walkIn)="confirmWalkInFromCard($event)"
            (confirmReservation)="confirmReservation.emit($event)"
            (cancelReservation)="cancelReservation.emit($event)"
            (callReservation)="callReservation.emit($event)"
            (finishService)="finishService.emit($event)"
            (markArrived)="markArrived.emit($event)"
            (unassign)="unassign.emit($event)"
          />
        </div>
      }
    } @else {
      <div
        class="grid gap-4"
        [class]="serviceMode() ? 'lg:grid-cols-[1fr_400px]' : 'lg:grid-cols-[1fr_320px]'"
        [class.h-full]="serviceMode()"
      >
        <div class="flex flex-col gap-3" [class.min-h-0]="serviceMode()">
          <!-- Rangee stable (aide + jauge + boutons) : le bandeau d'affectation
               FLOTTE sur le plan (zero layout shift, pleine largeur). -->
          <div class="flex items-center justify-between gap-3">
            <!-- AIDE : bouton qui ouvre un panneau explicatif des gestes et des
                 modes (2D/3D, simulation, service) - flottant, zero shift.
                 Masque en mode service (poste d'accueil) : pas de bruit d'aide. -->
            @if (!serviceMode()) {
              <button
                type="button"
                data-testid="toggle-help"
                class="text-text-subtle hover:text-text-strong inline-flex flex-1 cursor-pointer items-center gap-1.5 text-sm"
                [attr.aria-expanded]="helpOpen()"
                (click)="helpOpen.set(!helpOpen())"
              >
                <hk-icon name="lucideInfo" [size]="15" />
                <span class="hidden whitespace-nowrap lg:inline">Comment ça marche ?</span>
              </button>
            } @else {
              <span class="flex-1"></span>
            }
            <!-- Chaque bouton porte une explication au survol (title) : on comprend
                 AVANT de cliquer, pas apres. -->
            <div class="flex shrink-0 items-center gap-2 whitespace-nowrap">
              <!-- Vue 3D / Simuler / Mode service / Exporter n'ont de sens qu'avec
                   des tables : masques en onboarding (salle vide) pour eviter les
                   boutons sans effet. Seul « Modifier » reste, pour creer la salle. -->
              @if (tableViews().length > 0) {
                <hk-button
                  variant="secondary"
                  size="sm"
                  data-testid="toggle-3d"
                  [title]="view3d() ? 'Revenir au plan 2D' : 'Afficher la salle en 3D'"
                  (click)="view3d.set(!view3d())"
                >
                  <hk-icon name="lucideBox" [size]="16" />
                  <span class="hidden lg:inline">{{ view3d() ? 'Vue 2D' : 'Vue 3D' }}</span>
                </hk-button>
              }
              @if (!serviceMode()) {
                @if (tableViews().length > 0) {
                  <hk-button
                    [variant]="simulating() ? 'primary' : 'secondary'"
                    size="sm"
                    data-testid="toggle-sim"
                    title="Voir la salle à une heure choisie de la soirée"
                    (click)="simulating() ? stopSim() : startSim()"
                  >
                    <hk-icon name="lucideCalendar" [size]="16" />
                    <span class="hidden lg:inline">
                      {{ simulating() ? 'Quitter la simulation' : 'Simuler ma soirée' }}
                    </span>
                  </hk-button>
                  <hk-button
                    variant="secondary"
                    size="sm"
                    title="Affichage plein écran pour le poste d'accueil"
                    (click)="onEnterService()"
                  >
                    <hk-icon name="lucideMaximize" [size]="16" />
                    <span class="hidden lg:inline">Mode service</span>
                  </hk-button>
                  <hk-button
                    variant="secondary"
                    size="sm"
                    title="Télécharger le plan en image"
                    (click)="exportPng()"
                  >
                    <hk-icon name="lucideDownload" [size]="16" />
                    <span class="hidden lg:inline">Exporter</span>
                  </hk-button>
                }
                <hk-button
                  variant="secondary"
                  size="sm"
                  title="Modifier la salle (tables et murs)"
                  (click)="edit.emit()"
                >
                  <hk-icon name="lucidePencil" [size]="16" />
                  <span class="hidden lg:inline">Modifier</span>
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
            <div
              class="relative max-lg:landscape:h-[calc(100dvh-7.5rem)]"
              [class.min-h-0]="serviceMode()"
              [class.flex-1]="serviceMode()"
            >
              <!-- MOBILE : acces au panneau (inspector + non placees) via un
                   bouton flottant avec badge - le plan garde tout l'ecran. -->
              <button
                type="button"
                class="bg-primary text-primary-foreground absolute right-3 bottom-3 z-30 hidden size-11 cursor-pointer items-center justify-center rounded-full shadow-lg max-lg:flex"
                title="Réservations non placées et détail de table"
                data-testid="open-aside"
                (click)="asideOpen.set(!asideOpen())"
              >
                <hk-icon name="lucideUsers" [size]="18" />
                @if (unplaced().length > 0) {
                  <span
                    class="bg-st-cancelled-fg absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  >
                    {{ unplaced().length }}
                  </span>
                }
              </button>

              <!-- PANNEAU D'AIDE : les gestes et les modes, expliques la ou on
                   en a besoin. Flottant (zero shift), fermeture au clic. -->
              @if (helpOpen()) {
                <div
                  class="bg-card/95 border-border absolute top-3 left-3 z-20 flex max-w-md flex-col gap-2.5 rounded-xl border p-4 text-sm shadow-xl backdrop-blur-md"
                  data-testid="help-panel"
                >
                  <div class="flex items-start justify-between gap-3">
                    <h3 class="text-text-strong font-semibold">Comment ça marche ?</h3>
                    <button
                      type="button"
                      class="text-text-subtle hover:bg-muted cursor-pointer rounded-sm p-0.5"
                      title="Fermer"
                      (click)="helpOpen.set(false)"
                    >
                      <hk-icon name="lucideX" [size]="15" />
                    </button>
                  </div>
                  <p class="text-text-muted">
                    <strong class="text-text-strong">Sur le plan :</strong>
                    cliquez une table libre pour y installer des clients, une table colorée pour
                    ouvrir sa réservation. Sélectionnez une réservation non placée (à droite) puis
                    une table libre pour l'affecter ; la table conseillée est surlignée.
                  </p>
                  <p class="text-text-muted">
                    <strong class="text-text-strong">Vue 3D :</strong>
                    la salle en trois dimensions, les tables restent cliquables.
                  </p>
                  <p class="text-text-muted">
                    <strong class="text-text-strong">Simuler ma soirée :</strong>
                    affiche la salle à une heure choisie pour anticiper les creux et les pics.
                    Aucune réservation n'est modifiée.
                  </p>
                  <p class="text-text-muted">
                    <strong class="text-text-strong">Mode service :</strong>
                    affichage plein écran pour le poste d'accueil.
                  </p>
                  <p class="text-text-muted">
                    <strong class="text-text-strong">Modifier :</strong>
                    déplacez et créez des tables, tracez des murs, fusionnez des tablées.
                  </p>
                </div>
              }

              <!-- BANDEAU D'AFFECTATION : flotte sur le plan, pleine largeur -
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
                        est assez grand - ou fusionnez
                        <strong>{{ mergeSuggestionLabel() }}</strong>
                        en une tablée.
                      } @else {
                        Table recommandée :
                        <strong>{{ best.table.name }}</strong>
                        ({{ best.table.capacity }} couv.)
                      }
                    } @else if (mergeSuggestion()) {
                      Aucune table libre n'est assez grande - fusionnez
                      <strong>{{ mergeSuggestionLabel() }}</strong>
                      en une tablée.
                    } @else if (summary().libres > 0) {
                      Aucune table libre n'est assez grande. Choisissez-en une plus petite
                      (installer quand même) ou libérez une table.
                    } @else {
                      Toutes les tables sont occupées. Libérez-en une pour placer cette réservation.
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
                  [focusTableId]="canvasFocusId()"
                  [fill]="serviceMode() || compactLandscape()"
                  [class.h-full]="serviceMode() || compactLandscape()"
                  (tableClick)="onTableClick($event)"
                  (backgroundClick)="closeInspector()"
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
                  [fill]="serviceMode() || compactLandscape()"
                  [showNames]="serviceMode()"
                  [class.h-full]="serviceMode() || compactLandscape()"
                  (tableClick)="onTableClick($event)"
                  (backgroundClick)="closeInspector()"
                />
              }

              <!-- BARRE DE SIMULATION : scrubber FLOTTANT en bas du plan (comme
                   une timeline video). Fond ambre + flou : on ne confond jamais
                   projection et direct, et rien ne bouge en dessous. -->
              @if (simulating()) {
                <!-- Carte en DEUX etages : bandeau d'identite (badge + retour au
                     direct), puis l'heure en HEROS, la timeline et la reponse de
                     dispo en pastille verte - on lit le resultat, pas un formulaire. -->
                <div
                  class="border-st-pending-fg/20 absolute right-4 bottom-4 left-4 z-10 overflow-hidden rounded-2xl border bg-white/95 shadow-2xl backdrop-blur-xl"
                  data-testid="sim-bar"
                >
                  <div
                    class="bg-st-pending-bg/80 border-st-pending-fg/10 flex items-center justify-between gap-3 border-b px-5 py-2"
                  >
                    <div class="flex min-w-0 items-center gap-2.5">
                      <span
                        class="bg-st-pending-fg rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest text-white uppercase"
                      >
                        Simulation
                      </span>
                      <span class="text-st-pending-fg/90 hidden truncate text-xs sm:inline">
                        Projection : aucune réservation n'est modifiée.
                      </span>
                    </div>
                    <hk-button
                      size="sm"
                      title="Quitter la projection et revenir à la salle en temps réel"
                      (click)="stopSim()"
                    >
                      Revenir au direct
                    </hk-button>
                  </div>
                  <div class="flex items-center gap-5 px-5 py-3">
                    <span
                      class="text-text-strong font-mono text-4xl leading-none font-bold tabular-nums"
                      data-testid="sim-time"
                    >
                      {{ simLabel() }}
                    </span>
                    <div class="flex min-w-32 flex-1 flex-col gap-1.5">
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
                        class="text-text-subtle flex justify-between font-mono text-[10px] tabular-nums"
                      >
                        <span>{{ simStartLabel() }}</span>
                        <span>{{ simEndLabel() }}</span>
                      </div>
                    </div>
                    <span
                      class="bg-st-confirmed-bg text-st-confirmed-fg hidden flex-col items-center rounded-xl px-4 py-1.5 text-center leading-tight sm:flex"
                      data-testid="sim-summary"
                    >
                      <strong class="text-lg tabular-nums">{{ simFree().tables }}</strong>
                      <span class="text-[11px]">
                        table(s) libre(s) · {{ simFree().couverts }} couv.
                      </span>
                    </span>
                  </div>
                </div>
              }
            </div>
          }

          @if (!serviceMode()) {
            <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <span class="hidden lg:block"><hk-floor-plan-legend /></span>
              <!-- SYNTHESE + JAUGE : sur la ligne de legende (la rangee de
                   boutons du haut garde ses libelles sur UNE ligne). -->
              <div class="text-text-muted flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                @if (tableViews().length > 0) {
                  <span data-testid="room-summary">
                    {{ summary().libres }} libres · {{ summary().reservees }} réservées ·
                    {{ summary().installees }} installées
                  </span>
                }
                @if (load().capacity > 0) {
                  <span
                    class="whitespace-nowrap tabular-nums"
                    data-testid="evening-load"
                    title="Couverts attendus ce soir (réservations vivantes) rapportés à la capacité totale de la salle"
                  >
                    Ce soir :
                    <strong class="text-text-strong">{{ load().couverts }}</strong>
                    / {{ load().capacity }} couv. ({{ load().pct }} %)
                  </span>
                }
              </div>
            </div>
          }
        </div>

        <!-- MOBILE (paysage) : l'aside devient un TIROIR au-dessus du plan,
             ouvert par le bouton flottant - le plan garde toute la largeur. -->
        <aside
          class="bg-card border-border flex flex-col rounded-md border max-lg:fixed max-lg:top-14 max-lg:right-0 max-lg:bottom-0 max-lg:z-40 max-lg:w-80 max-lg:overflow-y-auto max-lg:rounded-none max-lg:border-y-0 max-lg:border-r-0 max-lg:shadow-2xl max-lg:transition-transform max-lg:duration-200"
          [class.max-lg:translate-x-full]="!asideOpen()"
          data-testid="plan-aside"
        >
          <button
            type="button"
            class="text-text-subtle hover:bg-muted absolute top-2 right-2 z-10 hidden cursor-pointer rounded-sm p-1 max-lg:block"
            title="Fermer le panneau"
            (click)="asideOpen.set(false)"
          >
            <hk-icon name="lucideX" [size]="16" />
          </button>
          <!-- INSPECTOR : la table SELECTIONNEE s'affiche ICI, a droite - meme
               endroit pour tout (libre = installer, occupee = sa reservation).
               En paysage compact la carte passe en BOTTOM SHEET (plus bas) :
               ici on la masque pour eviter le doublon. -->
          @if (selectedTableView() && !compactLandscape()) {
            <div class="border-border border-b">
              <hk-table-card
                [view]="selectedTableView()"
                [tableReservations]="selectedTableReservations()"
                [readOnly]="simulating()"
                [large]="serviceMode()"
                (closeCard)="closeInspector()"
                (walkIn)="confirmWalkInFromCard($event)"
                (confirmReservation)="confirmReservation.emit($event)"
                (cancelReservation)="cancelReservation.emit($event)"
                (callReservation)="callReservation.emit($event)"
                (finishService)="finishService.emit($event)"
                (markArrived)="markArrived.emit($event)"
                (unassign)="unassign.emit($event)"
              />
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
              @if (reservations().length === 0) {
                Aucune réservation aujourd'hui.
              } @else {
                Toutes les réservations du jour sont placées.
              }
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

      <!-- BOTTOM SHEET (paysage compact) : la carte de table remonte du bas
           plutot que le tiroir lateral qui mangeait la largeur du plan. -->
      @if (selectedTableView() && compactLandscape()) {
        <button
          type="button"
          class="fixed inset-0 z-40 cursor-default bg-black/30"
          aria-label="Fermer la carte de table"
          data-testid="sheet-backdrop"
          (click)="closeInspector()"
        ></button>
        <div
          class="bg-card fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t shadow-2xl"
          data-testid="table-sheet"
        >
          <div class="flex justify-center pt-2">
            <span class="bg-border h-1 w-10 rounded-full"></span>
          </div>
          <hk-table-card
            [view]="selectedTableView()"
            [tableReservations]="selectedTableReservations()"
            [readOnly]="simulating()"
            [large]="serviceMode()"
            [showClose]="false"
            (walkIn)="confirmWalkInFromCard($event)"
            (confirmReservation)="confirmReservation.emit($event)"
            (cancelReservation)="cancelReservation.emit($event)"
            (callReservation)="callReservation.emit($event)"
            (finishService)="finishService.emit($event)"
            (markArrived)="markArrived.emit($event)"
            (unassign)="unassign.emit($event)"
          />
        </div>
      }
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
    // Suivi du paysage compact (telephone couche) pour dimensionner le canvas.
    // Garde jsdom : matchMedia absent en environnement de test.
    if (typeof window.matchMedia === 'function') {
      const compactQuery = window.matchMedia('(max-width: 1023px) and (orientation: landscape)');
      this.compactLandscape.set(compactQuery.matches);
      const onCompact = (e: MediaQueryListEvent): void => this.compactLandscape.set(e.matches);
      compactQuery.addEventListener('change', onCompact);
      inject(DestroyRef).onDestroy(() => compactQuery.removeEventListener('change', onCompact));
    }

    // PRESELECTION (« Placer » depuis la liste) : appliquee UNE fois par id,
    // des que la resa figure dans les non placees.
    effect(() => {
      const id = this.preselectId();
      if (id && id !== this.appliedPreselectId && this.unplaced().some((r) => r.id === id)) {
        this.appliedPreselectId = id;
        this.selectedTableId.set(null);
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
  // MODE TUILES (mobile PORTRAIT) : le plan spatial ne se lit pas sur un ecran
  // etroit -> on affiche les tables en GRILLE triee par urgence, avec la meme
  // carte d'action (bottom sheet). Le geste et l'info sont identiques.
  readonly portrait = input(false);
  // Nom du restaurant, imprime en en-tete de l'export PNG.
  readonly restaurantName = input('Le Bistrot du Coin');
  // PRESELECTION (« Placer » depuis la liste, /plan?placer=id) : la resa arrive
  // deja selectionnee, bandeau d'affectation ouvert, meilleure table surlignee.
  readonly preselectId = input<string | null>(null);

  // Vue 3D decorative (Three.js, statuts live). La 2D reste la vue d'ACTION
  // (clics, affectation) : la 3D est un ecran de presentation / d'accueil.
  // model() : l'etat 2D/3D est PARTAGE avec la page, donc il survit au passage
  // en mode service (deux instances du plan) - la 3D ne retombe plus en 2D.
  readonly view3d = model(false);
  // Mode VITRINE de la 3D : orbite lente automatique (ecran d'accueil/mural).
  // model() partage : l'orbite choisie survit au passage en mode service (un
  // ecran mural en 3D garde son orbite auto).
  readonly vitrine = model(false);
  // Panneau d'aide (« Comment ça marche ? ») : flottant sur le plan.
  protected readonly helpOpen = signal(false);
  // MOBILE : tiroir droit (inspector + non placees) ouvert/ferme.
  protected readonly asideOpen = signal(false);
  // PAYSAGE COMPACT (telephone couche) : le plan remplit la hauteur restante.
  protected readonly compactLandscape = signal(false);

  // --- Configuration rapide (onboarding, aucune table) --------------------------
  // « Combien de tables ? Combien de couverts ? » -> creation de N vraies tables
  // (POST sequentiels), positions auto-grille ; l'editeur affine ensuite.
  protected readonly quickTables = signal(10);
  protected readonly quickSeats = signal(4);
  protected readonly quickCreating = signal(false);

  protected onQuickTables(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value === '') {
      return; // champ vide en cours de frappe : on ne force pas 1 sous les doigts.
    }
    const raw = Number(value);
    if (Number.isFinite(raw)) {
      this.quickTables.set(Math.max(1, Math.min(40, Math.round(raw))));
    }
  }

  protected onQuickSeats(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value === '') {
      return;
    }
    const raw = Number(value);
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

  readonly assign = output<AssignEvent>();
  // Placement en LOT (« Tout placer ») : un seul evenement -> un seul toast.
  readonly assignMany = output<AssignEvent[]>();
  // Actions de l'inspector (table occupee) : la page fait le reseau + le toast.
  readonly confirmReservation = output<Reservation>();
  readonly cancelReservation = output<Reservation>();
  readonly callReservation = output<Reservation>();
  readonly finishService = output<Reservation>();
  readonly markArrived = output<Reservation>();
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
  //  - en direct : capturee a chaque reevaluation du computed - donc a chaque
  //    refresh du polling (20 s). Fraicheur suffisante, sans timer dedie ;
  //  - en SIMULATION : l'heure du slider remplace l'horloge - toute la salle
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
  // l'heure de reference. Aucune donnee modifiee, aucune requete - projection pure.
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
  // « A 20:30 : 5 tables libres · 18 couverts disponibles » - la reponse a
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
    this.closeInspector();
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
  // Une resa dont la table n'existe PLUS (supprimee/desync polling) est traitee
  // comme non placee -> elle reste visible dans « a placer » au lieu de devenir
  // une orpheline invisible sur le plan.
  protected readonly unplaced = computed(() => {
    const tableIds = new Set(this.tables().map((t) => t.id));
    return (
      this.reservations()
        .filter(
          (r) =>
            (!r.table || !tableIds.has(r.table.id)) &&
            (r.status === 'pending' || r.status === 'confirmed' || r.status === 'seated'),
        )
        // Triees par heure : l'hote traite la file chronologiquement.
        .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
    );
  });

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
  // service - la meme que le bandeau service, disponible en permanence.
  protected readonly summary = computed(() => summarizeRoom(this.tableViews()));

  // TUILES (portrait) : tables triees par URGENCE - en retard d'abord, puis
  // reservees (par heure), installees, libres. L'hote traite le plus pressant.
  protected readonly tilesOrder = computed<FloorTableView[]>(() => {
    const rank = (v: FloorTableView): number => {
      if (v.lateMinutes != null) {
        return 0;
      }
      if (v.status === 'reservee') {
        return 1;
      }
      if (v.status === 'installee') {
        return 2;
      }
      return 3;
    };
    return [...this.tableViews()].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) {
        return r;
      }
      const at = a.reservation?.dateTime ?? a.nextDateTime ?? '';
      const bt = b.reservation?.dateTime ?? b.nextDateTime ?? '';
      return at.localeCompare(bt) || a.table.name.localeCompare(b.table.name);
    });
  });

  // FOCUS effectif du canvas : la table selectionnee dans l'inspector. Une
  // table membre d'une tablee fusionnee est resolue vers son ANCRE (seul noeud
  // rendu pour le groupe).
  protected readonly canvasFocusId = computed(() => {
    const id = this.selectedTableId();
    if (!id) {
      return null;
    }
    const views = this.tableViews();
    const group = this.merges().find((g) => g.includes(id));
    const anchor = group && views.find((v) => group.includes(v.table.id));
    if (anchor) {
      return anchor.table.id;
    }
    // Anti focus-fantome : si la table selectionnee n'est plus rendue (polling,
    // suppression, desactivation), aucun focus -> pas de grisage global.
    return views.some((v) => v.table.id === id) ? id : null;
  });

  protected readonly hoveredUnplaced = computed(() => {
    const id = this.hoveredUnplacedId();
    return id ? (this.unplaced().find((r) => r.id === id) ?? null) : null;
  });

  // SUGGESTION DE FUSION : la resa selectionnee ne tient sur aucune VRAIE table
  // libre (le bar en dernier recours ne compte pas - on n'assoit pas une tablee
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
    const events: AssignEvent[] = [];
    for (const p of placements) {
      const view = views.find((v) => v.table.id === p.tableId);
      if (view) {
        events.push({ reservationId: p.reservationId, table: view.table });
      }
    }
    // Un seul evenement de lot -> la page fait les N appels + un toast de synthese.
    this.assignMany.emit(events);
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
    this.selectedTableId.set(null);
    this.selectedUnplacedId.set(reservation.id);
  }

  // INSPECTOR : table SELECTIONNEE (libre ou occupee). MODEL (two-way) : la
  // page peut detenir cet etat pour qu'il SURVIVE au passage mode normal <->
  // mode service (deux instances du plan). On derive la vue COURANTE : si le
  // statut change (polling, walk-in, fin de service), la carte suit l'etat reel.
  readonly selectedTableId = model<string | null>(null);
  protected readonly selectedTableView = computed<FloorTableView | null>(() => {
    const id = this.selectedTableId();
    if (!id) {
      return null;
    }
    return this.tableViews().find((v) => v.table.id === id) ?? null;
  });

  // Resas VIVANTES de la table selectionnee (frise de l'inspector). Si la table
  // appartient a une tablee fusionnee, la frise couvre TOUS les membres du groupe
  // (sinon la resa d'un membre non selectionne serait invisible).
  protected readonly selectedTableReservations = computed(() => {
    const tableId = this.selectedTableId();
    if (!tableId) {
      return [];
    }
    const group = this.merges().find((g) => g.includes(tableId));
    const ids = new Set(group ?? [tableId]);
    return this.reservations()
      .filter(
        (r) =>
          r.table != null &&
          ids.has(r.table.id) &&
          (r.status === 'pending' || r.status === 'confirmed' || r.status === 'seated'),
      )
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
  });

  protected closeInspector(): void {
    this.selectedTableId.set(null);
  }

  // Selection d'une tuile (portrait) : meme logique que le clic canvas. Si une
  // resa « a placer » est selectionnee et la tuile est libre -> AFFECTATION (avec
  // garde capacite) ; sinon la carte de la table remonte en bottom sheet.
  protected selectTile(view: FloorTableView): void {
    this.onTableClick(view);
  }

  // Fond de la tuile selon le statut (couleurs alignees sur les badges/canvas).
  protected tileClasses(v: FloorTableView): string {
    const selected = v.table.id === this.selectedTableId();
    const ring = selected ? 'ring-2 ring-primary ' : '';
    if (v.lateMinutes != null) {
      return ring + 'border-st-cancelled-fg/40 bg-st-cancelled-bg';
    }
    if (v.status === 'reservee') {
      return ring + 'border-st-confirmed-fg/30 bg-st-confirmed-bg';
    }
    if (v.status === 'installee') {
      return ring + 'border-st-seated-fg/30 bg-st-seated-bg';
    }
    return ring + 'border-border bg-surface';
  }

  protected tileStatusClass(v: FloorTableView): string {
    if (v.lateMinutes != null) {
      return 'text-st-cancelled-fg';
    }
    if (v.status === 'reservee') {
      return 'text-st-confirmed-fg';
    }
    if (v.status === 'installee') {
      return 'text-st-seated-fg';
    }
    return 'text-text-subtle';
  }

  protected toggleUnplaced(reservation: Reservation): void {
    // Affectation et inspector sont exclusifs (un seul contexte a la fois).
    this.selectedTableId.set(null);
    this.selectedUnplacedId.update((id) => (id === reservation.id ? null : reservation.id));
  }

  // Clic table. GARDE-FOU CAPACITE (LOT B1) place ICI (et pas dans la page) : c'est
  // le seul endroit qui connait a la fois la selection, la capacite de la table
  // cliquee et le nombre de couverts - l'output `assign` garde son contrat intact
  // (la page continue de faire l'appel reseau + les toasts succes/erreur).
  protected onTableClick(view: FloorTableView): void {
    // SIMULATION : la salle affichee est une projection - agir sur une table
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
    // SELECTION UNIFIEE : toute table cliquee s'affiche dans l'inspector a
    // droite (libre = installer des clients, occupee = sa reservation). Meme
    // geste, meme endroit, mise a jour instantanee au clic suivant.
    this.selectedTableId.set(view.table.id);
    // Paysage compact : la carte remonte en bottom sheet (pas le tiroir). Sur
    // les autres petits ecrans (tablette portrait), on ouvre le tiroir.
    if (!this.compactLandscape()) {
      this.asideOpen.set(true);
    }
  }

  // La carte de table (hk-table-card) porte deja le garde-fou temporel : ici on
  // relaie l'installation validee. La selection RESTE : la carte bascule
  // d'elle-meme vers « installes » (statut derive) - l'hote voit son geste.
  protected confirmWalkInFromCard(event: WalkInEvent): void {
    this.walkIn.emit(event);
  }

  protected cancelWalkIn(): void {
    this.selectedTableId.set(null);
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
      // Rien a capturer (aucune table, ou canvas indisponible) : on l'explique
      // au lieu d'un clic sans effet.
      this.toast.show('Ajoutez des tables avant d’exporter le plan.');
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
