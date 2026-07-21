import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { from, of } from 'rxjs';
import { catchError, concatMap } from 'rxjs/operators';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { FloorPlanService } from '@core/services/floor-plan.service';
import { TableService, UpdateTableInput } from '@core/services/table.service';
import { ToastService } from '@core/services/toast.service';
import { Reservation } from '@core/models/reservation.model';
import {
  EditorTable,
  FLOOR_PLAN_TEMPLATES,
  GeometryMap,
  TABLE_PRESETS,
  TableGeometryEntry,
  TableShape,
  TablePreset,
  WallSegment,
  defaultGeometryFor,
  geometryFromPreset,
  gridPosition,
  nextTableName,
  offsetGeometry,
  rowGeometries,
  seedMissingGeometry,
  slotSeats,
} from '@core/models/floor-plan-editor.model';
import {
  EDITOR_MIN_GAP,
  WALL_MIN_GAP,
  buildEditorTables,
  canMerge,
  pushApart,
  rotatedBox,
  tablesTouch,
  wallObstacles,
} from '@core/models/floor-plan.model';
import { downloadDataUrl } from '@core/utils/download';
import { HkFloorPlanEditorCanvas, TableGeometry } from './hk-floor-plan-editor-canvas';
import { HkPascalImport, PascalImportPayload } from './hk-pascal-import';

// Choix de formes pour le panneau proprietes (1 table selectionnee).
const SHAPE_OPTIONS: { value: TableShape; label: string }[] = [
  { value: 'round', label: 'Ronde' },
  { value: 'square', label: 'Carrée' },
  { value: 'rect', label: 'Rectangle' },
  { value: 'bar', label: 'Bar' },
];

// Delai avant d'envoyer un PUT apres une frappe (nom / couverts).
const UPDATE_DEBOUNCE = 400;

// Statuts de reservation consideres ACTIFS pour le garde-fou de suppression :
// une table encore referencee par une resa du jour non terminee ne peut pas
// etre supprimee (il faut d'abord la reaffecter / liberer).
const BLOCKING_STATUSES: readonly Reservation['status'][] = ['pending', 'confirmed', 'seated'];

// Nombre de tables creees par la grille auto quand la salle est vide (l'apercu
// de la vignette « Grille automatique » en montre autant).
const DEFAULT_GRID_TABLES = 12;

// Specification d'une table a creer (POST /api/tables) + sa geometrie a poser.
interface CreateSpec {
  capacity: number;
  zone?: string | null;
  geo: TableGeometryEntry;
}

// Table supprimee memorisee pour l'annulation (toast « Annuler ») : on la recree
// a l'identique (nom, couverts, geometrie).
interface DeletedTableSnapshot {
  name: string;
  capacity: number;
  geo: TableGeometryEntry;
}

// Editeur de plan de salle (Phase 2, revise LOT A : bridge tables reelles).
//
// SOURCE DE VERITE : les tables viennent de TableService (ids back reels) ; le plan
// (FloorPlanService) ne stocke que leur GEOMETRIE keyee par id. En consequence :
//  - poser un preset / generer une rangee / dupliquer -> CREE une vraie table
//    (POST /api/tables) puis pose sa geometrie ;
//  - renommer / changer les couverts -> PUT /api/tables/{id} (debounce) ;
//  - supprimer -> garde-fou reservations du jour, puis DELETE /api/tables/{id} ;
//  - les templates APPLIQUENT une mise en page aux tables EXISTANTES (aucune creation).
// Toute mutation de geometrie passe par FloorPlanService.commit() (1 geste = 1 undo).
@Component({
  selector: 'hk-floor-plan-editor',
  imports: [HkButton, HkIcon, HkFloorPlanEditorCanvas, HkPascalImport],
  template: `
    @if (needsLayout() || choosingTemplate()) {
      <!-- Ecran de mise en page : au demarrage (aucun plan) OU quand on demande
           a re-choisir une disposition depuis l'editeur. -->
      <div class="bg-card border-border flex flex-col gap-5 rounded-md border p-6">
        <div class="flex flex-col gap-1">
          <h2 class="text-text-strong text-lg font-semibold">
            @if (tableCount() === 0) {
              Choisissez une disposition
            } @else if (choosingTemplate()) {
              Changer de disposition
            } @else {
              Mettre en page la salle
            }
          </h2>
          <p class="text-text-subtle text-sm">
            @if (tableCount() === 0) {
              Votre salle est vide : choisissez un modèle et les tables sont créées pour vous. Tout
              reste modifiable ensuite.
            } @else if (choosingTemplate()) {
              Choisissez une nouvelle disposition : vos {{ tableCount() }} table(s) seront
              réarrangées (les emplacements manquants sont créés).
            } @else {
              Choisissez une disposition de départ pour vos {{ tableCount() }} table(s). Tout reste
              modifiable ensuite.
            }
          </p>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          @for (preview of templatePreviews; track preview.key) {
            <button
              type="button"
              [attr.data-testid]="'template-' + preview.key"
              [disabled]="tableService.loading()"
              class="border-border hover:border-primary hover:bg-muted focus-visible:ring-primary flex flex-col gap-2 rounded-md border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
              (click)="useTemplate(preview.key)"
            >
              <!-- APERCU : la vraie geometrie du template, en miniature - on
                   choisit une salle en la voyant, pas en lisant sa description. -->
              <svg
                viewBox="0 0 160 100"
                class="border-border w-full rounded-sm border"
                style="background: #faf7f1"
                role="img"
                [attr.aria-label]="'Aperçu de la disposition ' + preview.label"
              >
                @for (shape of preview.shapes; track $index) {
                  @if (shape.round) {
                    <circle
                      [attr.cx]="shape.x * 160"
                      [attr.cy]="shape.y * 100"
                      [attr.r]="(shape.w * 100) / 2"
                      fill="#d4b28c"
                    />
                  } @else {
                    <rect
                      [attr.x]="shape.x * 160 - (shape.w * 100) / 2"
                      [attr.y]="shape.y * 100 - (shape.h * 100) / 2"
                      [attr.width]="shape.w * 100"
                      [attr.height]="shape.h * 100"
                      rx="2"
                      fill="#d4b28c"
                    />
                  }
                }
              </svg>
              <span class="text-text-strong text-sm font-semibold">{{ preview.label }}</span>
              <span class="text-text-subtle text-xs">{{ preview.description }}</span>
            </button>
          }
        </div>
        <!-- Import 3D : le plan peut aussi venir d'un scan (Pascal Capture) ou de
             l'editeur Pascal, sans rien poser a la main. -->
        <button
          type="button"
          data-testid="start-pascal-import"
          class="border-border hover:border-primary hover:bg-muted focus-visible:ring-primary flex items-center gap-3 rounded-md border border-dashed p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
          (click)="importOpen.set(true)"
        >
          <hk-icon name="lucideBox" [size]="20" class="text-text-subtle" />
          <span class="flex flex-col gap-0.5">
            <span class="text-text-strong text-sm font-semibold">
              Importer depuis un scan 3D (Pascal)
            </span>
            <span class="text-text-subtle text-xs">
              Scannez votre salle avec un iPhone ou dessinez-la sur editor.pascal.app, vos tables
              sont créées automatiquement.
            </span>
          </span>
        </button>
        <div>
          @if (choosingTemplate() && tableCount() > 0) {
            <hk-button variant="ghost" size="sm" (click)="choosingTemplate.set(false)">
              <hk-icon name="lucideChevronLeft" [size]="16" />
              Garder la disposition actuelle
            </hk-button>
          } @else {
            <hk-button variant="ghost" size="sm" (click)="closed.emit()">
              <hk-icon name="lucideChevronLeft" [size]="16" />
              Retour au plan
            </hk-button>
          }
        </div>
      </div>
    } @else {
      <div class="flex flex-col gap-3">
        <!-- Barre d'outils -->
        <div class="bg-card border-border flex flex-wrap items-center gap-2 rounded-md border p-2">
          <div class="flex items-center gap-1">
            <hk-button
              variant="ghost"
              size="sm"
              [disabled]="!store.canUndo()"
              (click)="store.undo()"
            >
              <hk-icon name="lucideUndo2" [size]="16" />
              Annuler
            </hk-button>
            <hk-button
              variant="ghost"
              size="sm"
              [disabled]="!store.canRedo()"
              (click)="store.redo()"
            >
              <hk-icon name="lucideRedo2" [size]="16" />
              Rétablir
            </hk-button>
          </div>

          <span class="bg-border mx-1 h-6 w-px"></span>

          <hk-button
            variant="ghost"
            size="sm"
            data-testid="toolbar-change-template"
            title="Repartir d'une autre disposition (Bistrot, Rangées, Brasserie...)"
            [disabled]="creating()"
            (click)="choosingTemplate.set(true)"
          >
            <hk-icon name="lucideGrid2x2" [size]="16" />
            Changer de disposition
          </hk-button>

          <hk-button variant="ghost" size="sm" [disabled]="creating()" (click)="addRow()">
            <hk-icon name="lucideRows3" [size]="16" />
            Générer une rangée
          </hk-button>

          <hk-button
            variant="ghost"
            size="sm"
            data-testid="toolbar-pascal-import"
            title="Importer un scan 3D (Pascal)"
            [disabled]="creating()"
            (click)="importOpen.set(true)"
          >
            <hk-icon name="lucideUpload" [size]="16" />
            Importer 3D
          </hk-button>

          <hk-button
            [variant]="wallMode() ? 'primary' : 'ghost'"
            size="sm"
            data-testid="toggle-walls"
            title="Tracer des murs (deux clics = un mur)"
            (click)="toggleWallMode()"
          >
            <hk-icon name="lucideGrid2x2" [size]="16" />
            {{ wallMode() ? 'Terminer les murs' : 'Murs' }}
          </hk-button>

          @if (wallMode()) {
            <hk-button
              variant="ghost"
              size="sm"
              data-testid="undo-wall"
              [disabled]="store.walls().length === 0"
              (click)="undoLastWall()"
            >
              Annuler le dernier
            </hk-button>
            <hk-button
              variant="ghost"
              size="sm"
              data-testid="clear-walls"
              [disabled]="store.walls().length === 0"
              (click)="clearWalls()"
            >
              Tout effacer
            </hk-button>
          }

          <hk-button
            variant="ghost"
            size="sm"
            [disabled]="selectedIds().length === 0 || creating()"
            (click)="duplicateSelection()"
          >
            <hk-icon name="lucideCopy" [size]="16" />
            Dupliquer
          </hk-button>

          @if (selectedIds().length > 1) {
            <hk-button variant="ghost" size="sm" (click)="alignSelection()">
              <hk-icon name="lucideAlignHorizontalJustifyCenter" [size]="16" />
              Aligner
            </hk-button>
            <hk-button
              variant="ghost"
              size="sm"
              data-testid="merge-tables"
              [disabled]="!selectionMergeable()"
              [title]="
                selectionMergeable()
                  ? 'Fusionner en une seule tablée (couverts additionnés)'
                  : 'Collez les tables bord à bord pour pouvoir les fusionner'
              "
              (click)="mergeSelection()"
            >
              Fusionner
            </hk-button>
          }
          @if (selectionMerged()) {
            <hk-button
              variant="ghost"
              size="sm"
              data-testid="unmerge-tables"
              title="Séparer la tablée : chaque table redevient indépendante"
              (click)="unmergeSelection()"
            >
              Défusionner
            </hk-button>
          }

          <!-- Action destructive : en rouge, pour qu'elle ne se confonde pas avec
               les outils de mise en page voisins. -->
          <hk-button
            variant="danger"
            size="sm"
            [disabled]="selectedIds().length === 0"
            (click)="deleteSelection()"
          >
            <hk-icon name="lucideTrash2" [size]="16" />
            Supprimer
          </hk-button>

          <div class="ml-auto flex items-center gap-3">
            <hk-button variant="ghost" size="sm" (click)="exportPng()">
              <hk-icon name="lucideDownload" [size]="16" />
              Exporter
            </hk-button>
            <!-- Largeur RESERVEE (min-w) : les trois libellés n'ont pas la même
                 longueur et le statut change à chaque geste (dirty -> saving ->
                 saved). Sans largeur fixe, la barre d'outils se réorganise sur
                 deux lignes le temps de l'enregistrement, puis revient. -->
            <span
              class="text-text-subtle inline-flex min-w-[6.25rem] items-center justify-end gap-1.5 text-xs whitespace-nowrap"
              aria-live="polite"
            >
              @if (store.saveState() === 'saved') {
                <hk-icon name="lucideCheck" [size]="14" class="text-st-confirmed-fg" />
                Enregistré
              } @else if (store.saveState() === 'saving') {
                Enregistrement…
              } @else {
                Non enregistré
              }
            </span>
            <hk-button size="sm" (click)="onFinish()">Terminer</hk-button>
          </div>
        </div>

        <div class="grid gap-3 lg:grid-cols-[1fr_280px]">
          <div class="flex flex-col gap-3">
            <!-- Palette de pose rapide : chaque clic cree une VRAIE table cote back. -->
            <div
              class="bg-card border-border flex flex-wrap items-center gap-2 rounded-md border p-2"
            >
              <span class="text-text-subtle px-1 text-xs font-medium">Ajouter :</span>
              @for (preset of presets; track preset.key) {
                <button
                  type="button"
                  [attr.data-testid]="'preset-' + preset.key"
                  [attr.aria-label]="preset.description"
                  [title]="preset.description"
                  [disabled]="creating()"
                  class="border-border hover:border-primary hover:bg-muted focus-visible:ring-primary text-text-strong inline-flex cursor-pointer items-center gap-1.5 rounded-sm border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                  (click)="addPreset(preset)"
                >
                  <hk-icon name="lucidePlus" [size]="14" />
                  {{ preset.label }}
                </button>
              }
            </div>

            @if (wallMode()) {
              <!-- Aide contextuelle du mode murs : on sait toujours quoi faire. -->
              <div
                class="bg-st-pending-bg text-st-pending-fg rounded-md px-3 py-2 text-sm"
                data-testid="wall-hint"
              >
                <strong>Mode murs :</strong>
                cliquez un premier point, puis un second, le mur se trace entre les deux. Enchaînez
                les murs, puis « Terminer les murs » (ou Échap). Un mur existant se supprime en
                cliquant dessus une fois le mode quitté.
              </div>
            } @else if (store.walls().length > 0) {
              <p class="text-text-subtle px-1 text-xs" data-testid="wall-delete-hint">
                Cliquez un mur pour le supprimer.
              </p>
            }

            <hk-floor-plan-editor-canvas
              [tables]="editorTables()"
              [walls]="store.walls()"
              [selectedIds]="selectedIds()"
              [snap]="snap()"
              [wallMode]="wallMode()"
              (selectionChange)="onSelectionChange($event)"
              (geometryChange)="onGeometryChange($event)"
              (wallAdded)="onWallAdded($event)"
              (wallRemoved)="onWallRemoved($event)"
            />

            <div class="text-text-subtle flex items-center gap-2 text-xs">
              <label class="inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  class="accent-primary size-3.5"
                  [checked]="snap()"
                  (change)="toggleSnap()"
                />
                Aligner sur la grille
              </label>
              <span class="text-text-subtle">·</span>
              <!-- COMPTEUR DE SALLE : la capacite totale se lit en editant, zero
                   calcul mental pour dimensionner la salle. -->
              <span data-testid="room-counter">
                {{ tableCount() }} table(s) · {{ totalSeats() }} couverts
              </span>
            </div>
          </div>

          <!-- Panneau proprietes / hint -->
          <aside class="bg-card border-border h-fit rounded-md border p-4">
            @if (selectedTable(); as t) {
              <h3 class="text-text-strong mb-3 text-sm font-semibold">Propriétés</h3>
              <div class="flex flex-col gap-3">
                <label class="flex flex-col gap-1">
                  <span class="text-text-subtle text-xs font-medium">Nom</span>
                  <input
                    type="text"
                    data-testid="prop-label"
                    class="border-border bg-background focus-visible:ring-primary rounded-sm border px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
                    [value]="t.label"
                    (input)="updateLabel(t, $event)"
                  />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="text-text-subtle text-xs font-medium">Couverts</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    data-testid="prop-seats"
                    class="border-border bg-background focus-visible:ring-primary rounded-sm border px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
                    [value]="t.seats"
                    (input)="updateSeats(t, $event)"
                  />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="text-text-subtle text-xs font-medium">Forme</span>
                  <select
                    data-testid="prop-shape"
                    class="border-border bg-background focus-visible:ring-primary rounded-sm border px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
                    (change)="updateShape(t, $event)"
                  >
                    @for (opt of shapeOptions; track opt.value) {
                      <option [value]="opt.value" [selected]="opt.value === t.shape">
                        {{ opt.label }}
                      </option>
                    }
                  </select>
                </label>
              </div>
            } @else if (selectedIds().length > 1) {
              <h3 class="text-text-strong mb-1 text-sm font-semibold">
                {{ selectedIds().length }} tables sélectionnées
              </h3>
              <p class="text-text-subtle text-xs">
                Déplacez, alignez, dupliquez ou supprimez la sélection avec la barre d'outils.
              </p>
            } @else {
              <h3 class="text-text-strong mb-1 text-sm font-semibold">Aucune sélection</h3>
              <p class="text-text-subtle text-xs">
                Cliquez une table pour modifier son nom, ses couverts ou sa forme. Glissez pour la
                déplacer, ou tracez un rectangle pour en sélectionner plusieurs.
              </p>
            }
          </aside>
        </div>
      </div>
    }

    @if (importOpen()) {
      <hk-pascal-import
        [existingTableCount]="tableCount()"
        (closed)="importOpen.set(false)"
        (imported)="onImported($event)"
      />
    }

    @if (importHint()) {
      <!-- APRES IMPORT : un scan ou un plan 3D place rarement les tables au
           centimetre. On le dit en FENETRE (et non en bandeau, qui passait
           inapercu) pour que le restaurateur sache qu'il peut retoucher, sans se
           demander s'il a rate son import. -->
      <div
        class="fixed inset-0 z-[1030] flex items-center justify-center bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-done-title"
        tabindex="-1"
        (click)="closeImportHint($event)"
        (keydown.escape)="importHint.set(false)"
      >
        <div
          class="bg-card border-border flex w-full max-w-md flex-col gap-4 rounded-md border p-6 shadow-xl"
          data-testid="import-done-dialog"
        >
          <h2 id="import-done-title" class="text-text-strong text-lg font-semibold">
            Import terminé
          </h2>
          <p class="text-text-subtle text-sm">
            Vos tables sont posées d'après votre plan 3D. Leur placement peut demander quelques
            retouches : glissez une table pour la déplacer, et servez-vous des poignées pour la
            redimensionner ou la faire pivoter. Comptez quelques minutes pour ajuster la salle.
          </p>
          <div class="flex justify-end">
            <hk-button size="sm" data-testid="import-done-ok" (click)="importHint.set(false)">
              J'ai compris
            </hk-button>
          </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkFloorPlanEditor implements OnInit {
  protected readonly store = inject(FloorPlanService);
  protected readonly tableService = inject(TableService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  // Canvas Konva reel (undefined tant que l'ecran de demarrage est affiche, ou stub en test).
  private readonly canvas = viewChild(HkFloorPlanEditorCanvas);

  // Restaurant dont on edite le plan (cle de persistance).
  readonly restaurantId = input.required<string>();
  // Reservations du jour : garde-fou de suppression (une table encore referencee
  // par une resa active ne peut pas etre supprimee).
  readonly reservations = input<Reservation[]>([]);
  // Emis quand l'utilisateur clique « Terminer » -> retour mode service.
  // Nomme `closed` (et non `finish`) pour eviter la collision avec un evenement
  // DOM natif (regle @angular-eslint/no-output-native).
  readonly closed = output<void>();

  protected readonly templates = FLOOR_PLAN_TEMPLATES;
  protected readonly presets = TABLE_PRESETS;

  // APERCUS des templates (ecran de demarrage) : on applique chaque template a
  // 12 tables factices et on garde la geometrie pour un mini-plan SVG. Le
  // template « grille automatique » (apply vide) montre la grille de repli.
  protected readonly templatePreviews = FLOOR_PLAN_TEMPLATES.map((tpl) => {
    const fakeIds = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const geometry = tpl.apply(fakeIds);
    const entries =
      Object.keys(geometry).length > 0
        ? Object.values(geometry)
        : fakeIds.map((_, i) => defaultGeometryFor(4, gridPosition(i, fakeIds.length)));
    return {
      key: tpl.key,
      label: tpl.label,
      description: tpl.description,
      shapes: entries.map((g) => ({
        x: g.x,
        y: g.y,
        w: g.w,
        h: g.h,
        round: g.shape === 'round',
      })),
    };
  });
  protected readonly shapeOptions = SHAPE_OPTIONS;

  protected readonly selectedIds = signal<readonly string[]>([]);
  protected readonly snap = signal(true);
  // Creation(s) en cours (POST sequentiels) : evite les doubles clics.
  protected readonly creating = signal(false);
  // Dialogue d'import Pascal (scan 3D / editeur web) ouvert.
  protected readonly importOpen = signal(false);
  // Fenetre affichee APRES un import : previent que le placement issu du plan 3D
  // demande souvent quelques retouches. Se ferme a la main.
  protected readonly importHint = signal(false);

  // Ferme seulement si le clic vise le FOND, pas la carte : on compare la cible
  // au conteneur, plutot que d'absorber le clic sur la carte (un handler sur la
  // carte la rendrait interactive sans etre focusable).
  protected closeImportHint(event: Event): void {
    if (event.target === event.currentTarget) {
      this.importHint.set(false);
    }
  }
  // Re-choix de disposition depuis l'editeur (reaffiche l'ecran des templates).
  protected readonly choosingTemplate = signal(false);
  // MODE MURS : trace a la main (deux clics = un mur), tables gelees pendant.
  protected readonly wallMode = signal(false);

  // Tables vues par le canvas : identite (nom/couverts) des tables REELLES +
  // geometrie du plan (repli auto-grille tant que la table n'a pas d'entree).
  protected readonly editorTables = computed<EditorTable[]>(() =>
    buildEditorTables(this.tableService.tables(), this.store.geometry()),
  );

  protected readonly tableCount = computed(() => this.tableService.tables().length);
  // Rien a editer : soit aucun plan enregistre, soit un plan qui existe mais dont
  // toutes les tables ont ete supprimees. Dans les deux cas on propose les
  // dispositions plutot qu'une grille vide sans point de depart.
  protected readonly needsLayout = computed(() => this.store.isEmpty() || this.tableCount() === 0);
  // Capacite totale de la salle, mise a jour en direct pendant l'edition.
  protected readonly totalSeats = computed(() =>
    this.tableService.tables().reduce((sum, t) => sum + t.capacity, 0),
  );

  // Table unique selectionnee (panneau proprietes), ou null.
  protected readonly selectedTable = computed<EditorTable | null>(() => {
    const ids = this.selectedIds();
    if (ids.length !== 1) {
      return null;
    }
    return this.editorTables().find((t) => t.id === ids[0]) ?? null;
  });

  // Debounce des PUT (nom / couverts) : un timer + un patch cumulatif par table.
  private readonly updateTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingPatches = new Map<string, UpdateTableInput>();

  constructor() {
    // SEMIS : des que plan + tables reelles sont disponibles, complete la geometrie
    // manquante (position auto-grille) SANS entree d'historique - les positions de
    // depart sont ainsi stables et persistees.
    effect(() => {
      if (!this.store.loaded() || this.store.isEmpty()) {
        return;
      }
      const tables = this.tableService.tables();
      if (tables.length === 0) {
        return;
      }
      const missing = seedMissingGeometry(tables, this.store.geometry());
      if (Object.keys(missing).length > 0) {
        this.store.merge(missing);
      }
    });

    this.destroyRef.onDestroy(() => this.flushPendingUpdates());
  }

  ngOnInit(): void {
    // Charge le plan persiste a l'ouverture de l'editeur. En ngOnInit, les inputs
    // requis (restaurantId) sont garantis disponibles (contrairement au constructeur).
    this.store.load(this.restaurantId());
    // Les tables reelles sont normalement deja chargees par la vue plan ; on couvre
    // le cas d'une entree directe dans l'editeur.
    if (this.tableService.tables().length === 0 && !this.tableService.loading()) {
      this.tableService.loadTables();
    }
  }

  // --- Ecran de demarrage ------------------------------------------------------

  // Applique un template : dispose les tables EXISTANTES sur ses emplacements, et
  // CREE une table pour chaque emplacement non couvert. Ainsi un template produit
  // toujours une salle, meme partant d'une salle vide (cas du demarrage).
  protected useTemplate(key: string): void {
    const tpl = this.templates.find((t) => t.key === key);
    if (!tpl) {
      return;
    }
    const ids = this.tableService.tables().map((t) => t.id);
    // Les TABLEES sont defaites : elles supposent des tables collees bord a
    // bord, ce que la nouvelle disposition ne garantit pas. On le DIT, plutot
    // que de les perdre en silence (l'ancien comportement) ou de conserver des
    // groupes devenus incoherents.
    const tableesDefaites = this.store.merges().length;
    // Les murs survivent au changement de disposition : ils decrivent la piece.
    this.store.initFrom(tpl.apply(ids), true);
    this.selectedIds.set([]);
    this.choosingTemplate.set(false);
    if (tableesDefaites > 0) {
      this.toast.show(
        `${tableesDefaites} tablée(s) défaite(s) : les tables ont été réarrangées.`,
        'default',
      );
    }

    // Emplacements a creer : ceux du template non couverts par les tables
    // existantes. La grille auto n'a pas d'emplacements fixes -> sur une salle
    // vide on cree une grille par defaut (l'apercu en montre justement une),
    // au lieu de laisser l'editeur vide.
    let missing = tpl.slots.slice(ids.length);
    if (tpl.key === 'blank' && ids.length === 0) {
      missing = Array.from({ length: DEFAULT_GRID_TABLES }, (_, i) =>
        defaultGeometryFor(4, gridPosition(i, DEFAULT_GRID_TABLES)),
      );
    }
    if (missing.length > 0) {
      this.createTables(missing.map((s) => ({ capacity: slotSeats(s.shape), geo: { ...s } })));
    }
  }

  // --- Creation de tables reelles (POST /api/tables) ----------------------------

  protected addPreset(preset: TablePreset): void {
    this.createTables([{ capacity: preset.seats, geo: geometryFromPreset(preset) }]);
  }

  protected addRow(): void {
    // Rangee de 4 tables carrees de 4 par defaut (preset le plus courant), posee
    // SOUS les tables existantes (zone libre) et non au centre, pour ne pas la
    // superposer a la salle en place.
    const preset = this.presets.find((p) => p.key === 'square-4') ?? this.presets[0];
    const specs = rowGeometries(preset, 4, this.nextRowY(preset)).map((geo) => ({
      capacity: preset.seats,
      geo,
    }));
    this.createTables(specs);
  }

  // Ordonnee de la prochaine rangee : juste sous la table la plus basse (ou le
  // centre si la salle est vide), bornee pour rester dans le plan.
  private nextRowY(preset: TablePreset): number {
    const geos = Object.values(this.store.geometry());
    const h = geometryFromPreset(preset, { x: 0.5, y: 0.5 }).h;
    if (geos.length === 0) {
      return 0.5;
    }
    // Emprise PIVOTEE : une table a 90 deg descend plus bas que sa hauteur de
    // modele, sinon la rangee suivante se pose par-dessus elle.
    const lowest = Math.max(...geos.map((g) => g.y + rotatedBox(g).h / 2));
    // Marge DERIVEE de l'ecart minimal : en dur (0.03), elle passait sous le
    // seuil quand celui-ci a ete releve, et la rangee tout juste posee se
    // faisait aussitot repousser, perdant son alignement.
    const marge = EDITOR_MIN_GAP * 1.5;
    return Math.max(h / 2, Math.min(1 - h / 2, lowest + marge + h / 2));
  }

  // Dupliquer = creer une VRAIE table de meme capacite par element selectionne,
  // avec la geometrie copiee (leger decalage). Le nom est le prochain « Tn » libre.
  protected duplicateSelection(): void {
    const ids = new Set(this.selectedIds());
    const source = this.editorTables().filter((t) => ids.has(t.id));
    if (source.length === 0) {
      return;
    }
    const specs: CreateSpec[] = source.map((t) => ({
      capacity: t.seats,
      geo: offsetGeometry({
        x: t.x,
        y: t.y,
        w: t.width,
        h: t.height,
        rotation: t.rotation,
        shape: t.shape,
      }),
    }));
    this.createTables(specs);
  }

  // --- Fusion de tables (grandes tablees) ------------------------------------------
  // Le plan stocke des groupes d'ids ; la VUE SERVICE (2D et 3D) rend chaque
  // groupe comme UNE tablee. L'editeur, lui, garde les tables independantes
  // (on continue de les deplacer une par une).

  // La selection peut-elle fusionner ? >= 2 tables, toutes COLLEES (en chaine).
  protected readonly selectionMergeable = computed(() => {
    const ids = this.selectedIds();
    if (ids.length < 2) {
      return false;
    }
    const byId = new Map(this.editorTables().map((t) => [t.id, t]));
    const entries = ids
      .map((id) => byId.get(id))
      .filter((t): t is EditorTable => t != null)
      .map((t) => ({ x: t.x, y: t.y, w: t.width, h: t.height, rotation: t.rotation }));
    return entries.length === ids.length && canMerge(entries);
  });

  // La selection touche-t-elle un groupe existant ? (-> proposer Defusionner)
  protected readonly selectionMerged = computed(() => {
    const ids = new Set(this.selectedIds());
    return this.store.merges().some((group) => group.some((id) => ids.has(id)));
  });

  protected mergeSelection(): void {
    if (!this.selectionMergeable()) {
      return;
    }
    const ids = [...this.selectedIds()];
    const idSet = new Set(ids);
    // Les tables deja fusionnees ailleurs quittent leur ancien groupe.
    const others = this.store
      .merges()
      .map((group) => group.filter((id) => !idSet.has(id)))
      .filter((group) => group.length >= 2);
    this.store.setMerges([...others, ids]);
    this.toast.show('Tablée créée : visible sur le plan de service (2D et 3D).');
  }

  protected unmergeSelection(): void {
    const ids = new Set(this.selectedIds());
    this.store.setMerges(this.store.merges().filter((group) => !group.some((id) => ids.has(id))));
    this.toast.show('Tablée séparée.');
  }

  // --- Murs traces a la main ------------------------------------------------------

  protected toggleWallMode(): void {
    this.wallMode.update((v) => !v);
    if (this.wallMode()) {
      this.selectedIds.set([]);
    }
  }

  // Ajoute le mur trace au plan (persistance immediate via FloorPlanService).
  protected onWallAdded(wall: WallSegment): void {
    this.store.setWalls([...this.store.walls(), wall]);
  }

  // Clic sur un mur (hors mode murs) : on le supprime, avec annulation.
  protected onWallRemoved(index: number): void {
    const before = this.store.walls();
    if (index < 0 || index >= before.length) {
      return;
    }
    this.store.setWalls(before.filter((_, i) => i !== index));
    this.toast.show('Mur supprimé', 'default', {
      label: 'Annuler',
      run: () => this.store.setWalls(before),
    });
  }

  protected undoLastWall(): void {
    this.store.setWalls(this.store.walls().slice(0, -1));
  }

  protected clearWalls(): void {
    const before = this.store.walls();
    if (before.length === 0) {
      return;
    }
    this.store.setWalls([]);
    this.toast.show(`${before.length} mur(s) effacé(s)`, 'default', {
      label: 'Annuler',
      run: () => this.store.setWalls(before),
    });
  }

  // --- Import Pascal (scan 3D / editeur web) ------------------------------------

  // Applique l'import : chaque candidat retenu devient une VRAIE table (POST
  // /api/tables, capacite estimee corrigeable ensuite) avec sa geometrie projetee,
  // et les murs deviennent le fond de plan. Tables existantes intactes.
  protected onImported(payload: PascalImportPayload): void {
    this.importOpen.set(false);
    if (payload.tables.length === 0 && payload.walls.length === 0) {
      return;
    }
    // Depuis l'ecran de demarrage : initialise un plan vide (persiste) pour
    // basculer sur l'editeur ; les tables importees s'y posent ensuite.
    if (this.store.isEmpty()) {
      this.store.initFrom({});
    }
    if (payload.walls.length > 0) {
      this.store.setWalls(payload.walls);
    }
    const specs: CreateSpec[] = payload.tables.map((c) => ({
      capacity: c.capacity,
      geo: { x: c.x, y: c.y, w: c.w, h: c.h, rotation: c.rotation, shape: c.shape },
    }));
    // GARDE-FOU : « remplacer » sans aucune table a poser vide la salle sans
    // rien recreer, et cette suppression-la n'a pas d'annulation. Un import de
    // murs seuls (ou dont on a decoche toutes les tables) se comporte donc comme
    // un ajout : les murs sont poses, les tables existantes conservees.
    if (payload.mode === 'replace' && specs.length > 0) {
      this.replaceThenCreate(specs);
      return;
    }
    // Geometrie du plan RESPECTEE telle quelle (pas d'anti-empilement).
    this.createTables(specs, true);
    this.importHint.set(true);
    this.toast.show(`${specs.length} table(s) importée(s) depuis Pascal.`);
  }

  // REMPLACER : vide la salle avant d'importer. MEME garde-fou que la suppression
  // manuelle : une table qui porte une reservation active n'est jamais supprimee,
  // sinon l'import serait une porte derobee pour casser le lien avec un client.
  private replaceThenCreate(specs: CreateSpec[]): void {
    const reservations = this.reservations();
    const kept: string[] = [];
    const deletable: string[] = [];
    for (const t of this.editorTables()) {
      const hasActiveReservation = reservations.some(
        (r) => r.table?.id === t.id && BLOCKING_STATUSES.includes(r.status),
      );
      (hasActiveReservation ? kept : deletable).push(t.id);
    }

    if (deletable.length === 0) {
      this.finishImport(specs, kept.length);
      return;
    }

    // Les echecs reseau sont COMPTES : sans cela on annoncait un remplacement
    // reussi alors que d'anciennes tables etaient toujours la, et l'utilisateur
    // se retrouvait avec deux plans superposes sans explication.
    let failed = 0;
    from(deletable)
      .pipe(
        concatMap((id) =>
          this.tableService.remove(id).pipe(
            concatMap(() => {
              this.store.removeEntry(id);
              this.dropFromMerges(id);
              return of(id);
            }),
            catchError(() => {
              failed += 1;
              return of(null);
            }),
          ),
        ),
      )
      .subscribe({ complete: () => this.finishImport(specs, kept.length, failed) });
  }

  private finishImport(specs: CreateSpec[], keptCount: number, failedCount = 0): void {
    // Geometrie du plan RESPECTEE telle quelle (pas d'anti-empilement).
    this.createTables(specs, true);
    this.importHint.set(true);
    const kept = keptCount > 0 ? ` ${keptCount} table(s) conservée(s) : réservation en cours.` : '';
    this.toast.show(`${specs.length} table(s) importée(s) depuis Pascal.${kept}`);
    if (failedCount > 0) {
      this.toast.show(
        `${failedCount} table(s) n'ont pas pu être supprimées : elles sont toujours sur le plan.`,
        'error',
      );
    }
  }

  // Cree N tables SEQUENTIELLEMENT (les noms « Tn » se suivent car le signal tables
  // est mis a jour apres chaque POST), pose leur geometrie, puis les selectionne.
  // En cas d'echec reseau : toast, pas de table fantome (la geometrie n'est posee
  // qu'apres la reponse du back).
  // `keepGeometry` : poser les tables EXACTEMENT ou le plan le demande, sans
  // anti-empilement. Indispensable a l'import, ou la disposition vient du vrai
  // restaurant : des tables qui se touchent de quelques centimetres (rangee le
  // long d'une banquette) sont normales, et les repousser detruisait le plan
  // (des tables finissaient superposees ou plaquees contre un bord).
  private createTables(specs: CreateSpec[], keepGeometry = false): void {
    if (specs.length === 0 || this.creating()) {
      return;
    }
    this.creating.set(true);
    const createdIds: string[] = [];
    let failed = false;

    from(specs)
      .pipe(
        concatMap((spec) =>
          this.tableService
            .create({
              name: nextTableName(this.tableService.tables().map((t) => t.name)),
              capacity: spec.capacity,
              zone: spec.zone,
            })
            .pipe(
              catchError(() => {
                failed = true;
                return of(null);
              }),
              concatMap((table) => {
                if (table) {
                  createdIds.push(table.id);
                  // Anti-empilement : chaque table posee au preset atterrit au meme
                  // point -> on la repousse des tables deja presentes (y compris
                  // celles creees plus tot dans ce meme lot). A l'import on s'en
                  // passe : le plan vient du vrai restaurant, on le respecte.
                  // Emprises PIVOTEES : les tables d'un plan importe arrivent
                  // presque toutes avec une rotation.
                  const current = this.store.geometry();
                  const box = rotatedBox(spec.geo);
                  const { x, y } = keepGeometry
                    ? { x: spec.geo.x, y: spec.geo.y }
                    : this.settlePosition(box, Object.values(current).map(rotatedBox));
                  // Sans historique : la creation s'annule via son toast dedie
                  // (elle touche le back), pas via l'undo de deplacement.
                  this.store.commit({ ...current, [table.id]: { ...spec.geo, x, y } }, false);
                }
                return of(table);
              }),
            ),
        ),
      )
      .subscribe({
        complete: () => {
          this.creating.set(false);
          if (createdIds.length > 0) {
            this.selectedIds.set(createdIds);
            const ids = [...createdIds];
            const n = ids.length;
            // Annulation de la creation : coherent avec les murs (toast dedie),
            // et le seul moyen fiable de defaire une creation qui touche le back.
            this.toast.show(`${n} table${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''}`, 'default', {
              label: 'Annuler',
              run: () => this.removeTables(ids),
            });
          }
          if (failed) {
            this.toast.show('Impossible de créer la table. Réessayez.', 'error');
          }
        },
      });
  }

  // Supprime des tables SANS garde (usage interne : annuler une creation qu'on
  // vient de faire - aucune reservation ne peut encore y etre attachee).
  private removeTables(ids: string[]): void {
    from(ids)
      .pipe(
        concatMap((id) =>
          this.tableService.remove(id).pipe(
            concatMap(() => {
              this.store.removeEntry(id);
              this.dropFromMerges(id);
              return of(id);
            }),
            catchError(() => {
              this.toast.show('Échec de la suppression de la table.', 'error');
              return of(null);
            }),
          ),
        ),
      )
      .subscribe({ complete: () => this.selectedIds.set([]) });
  }

  // Recree des tables supprimees (annulation d'une suppression) : nouveau POST
  // (donc nouvel id back) avec le nom et la geometrie d'origine. Les eventuelles
  // reservations passees ne sont pas restaurees (la suppression n'est autorisee
  // que sur des tables sans reservation active).
  private restoreTables(snapshots: DeletedTableSnapshot[]): void {
    const createdIds: string[] = [];
    from(snapshots)
      .pipe(
        concatMap((snap) =>
          this.tableService.create({ name: snap.name, capacity: snap.capacity, zone: null }).pipe(
            concatMap((table) => {
              createdIds.push(table.id);
              this.store.commit({ ...this.store.geometry(), [table.id]: snap.geo }, false);
              return of(table);
            }),
            catchError(() => {
              this.toast.show('Échec de la restauration de la table.', 'error');
              return of(null);
            }),
          ),
        ),
      )
      .subscribe({ complete: () => this.selectedIds.set(createdIds) });
  }

  // --- Suppression (garde-fou reservations) --------------------------------------

  protected deleteSelection(): void {
    const ids = [...this.selectedIds()];
    if (ids.length === 0) {
      return;
    }
    const reservations = this.reservations();
    const tablesById = new Map(this.editorTables().map((t) => [t.id, t]));

    const blocked: string[] = [];
    const deletable: string[] = [];
    for (const id of ids) {
      const hasActiveReservation = reservations.some(
        (r) => r.table?.id === id && BLOCKING_STATUSES.includes(r.status),
      );
      (hasActiveReservation ? blocked : deletable).push(id);
    }

    if (blocked.length > 0) {
      const names = blocked.map((id) => tablesById.get(id)?.label ?? id).join(', ');
      this.toast.show(
        `Impossible de supprimer ${names} : réaffectez d'abord ses réservations.`,
        'error',
      );
    }
    if (deletable.length === 0) {
      return;
    }

    // Instantane AVANT suppression (nom, couverts, geometrie) : permet l'annulation.
    const geometry = this.store.geometry();
    const snapshots: DeletedTableSnapshot[] = deletable
      .map((id) => {
        const t = tablesById.get(id);
        const geo = geometry[id];
        return t && geo ? { name: t.label, capacity: t.seats, geo } : null;
      })
      .filter((s): s is DeletedTableSnapshot => s != null);

    from(deletable)
      .pipe(
        concatMap((id) =>
          this.tableService.remove(id).pipe(
            concatMap(() => {
              this.store.removeEntry(id);
              this.dropFromMerges(id);
              return of(id);
            }),
            catchError(() => {
              this.toast.show('Échec de la suppression de la table.', 'error');
              return of(null);
            }),
          ),
        ),
      )
      .subscribe({
        complete: () => {
          this.selectedIds.set(blocked);
          if (snapshots.length > 0) {
            const n = snapshots.length;
            this.toast.show(
              `${n} table${n > 1 ? 's' : ''} supprimée${n > 1 ? 's' : ''}`,
              'default',
              { label: 'Annuler', run: () => this.restoreTables(snapshots) },
            );
          }
        },
      });
  }

  // Retire une table supprimee des groupes de fusion (groupe < 2 -> dissous).
  private dropFromMerges(tableId: string): void {
    const merges = this.store.merges();
    if (!merges.some((group) => group.includes(tableId))) {
      return;
    }
    this.store.setMerges(
      merges.map((group) => group.filter((id) => id !== tableId)).filter((g) => g.length >= 2),
    );
  }

  // --- Alignement (geometrie pure) ------------------------------------------------

  // Aligne la selection horizontalement (meme y = moyenne des y selectionnes).
  protected alignSelection(): void {
    const ids = new Set(this.selectedIds());
    const selected = this.editorTables().filter((t) => ids.has(t.id));
    if (selected.length < 2) {
      return;
    }
    const avgY = selected.reduce((sum, t) => sum + t.y, 0) / selected.length;
    const geometry: GeometryMap = { ...this.store.geometry() };
    for (const t of selected) {
      const entry = geometry[t.id];
      if (entry) {
        geometry[t.id] = { ...entry, y: avgY };
      }
    }
    this.store.commit(geometry);
  }

  // --- Panneau proprietes -----------------------------------------------------
  // Nom / couverts appartiennent a la TABLE BACK -> PUT /api/tables/{id} (debounce).
  // La forme appartient au PLAN -> commit de geometrie.

  protected updateLabel(table: EditorTable, event: Event): void {
    const name = (event.target as HTMLInputElement).value.trim();
    if (!name) {
      return;
    }
    this.scheduleUpdate(table.id, { name });
  }

  protected updateSeats(table: EditorTable, event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    // Champ vide = frappe en cours (l'utilisateur efface pour retaper) : on attend.
    if (inputEl.value === '') {
      return;
    }
    const raw = Number(inputEl.value);
    if (!Number.isFinite(raw)) {
      return;
    }
    const capacity = Math.max(1, Math.min(20, Math.round(raw)));
    // Reecrit TOUJOURS le champ soi-meme : le binding [value] ne corrige le DOM
    // que si le MODELE change. Or retaper 28 laisse le modele a 20 (inchange)
    // -> Angular ne reecrivait plus le champ, qui affichait 28 alors que la
    // vraie valeur etait 20 (bug trouve en test manuel).
    if (inputEl.value !== String(capacity)) {
      inputEl.value = String(capacity);
      if (raw > 20) {
        this.toast.show('20 couverts maximum par table (au-delà, fusionnez des tables).');
      }
    }
    this.scheduleUpdate(table.id, { capacity });
  }

  protected updateShape(table: EditorTable, event: Event): void {
    const shape = (event.target as HTMLSelectElement).value as TableShape;
    const geometry = { ...this.store.geometry() };
    const entry = geometry[table.id] ?? {
      x: table.x,
      y: table.y,
      w: table.width,
      h: table.height,
      rotation: table.rotation,
      shape: table.shape,
    };
    // Une ronde utilise w comme diametre : on garde h = w pour rester coherent.
    const h = shape === 'round' || shape === 'square' ? entry.w : entry.h;
    geometry[table.id] = { ...entry, shape, h };
    this.store.commit(geometry);
  }

  // Debounce des PUT : cumule les champs modifies puis envoie UNE mise a jour.
  private scheduleUpdate(id: string, patch: UpdateTableInput): void {
    this.pendingPatches.set(id, { ...this.pendingPatches.get(id), ...patch });
    const existing = this.updateTimers.get(id);
    if (existing) {
      clearTimeout(existing);
    }
    this.updateTimers.set(
      id,
      setTimeout(() => this.firePendingUpdate(id), UPDATE_DEBOUNCE),
    );
  }

  private firePendingUpdate(id: string): void {
    this.updateTimers.delete(id);
    const patch = this.pendingPatches.get(id);
    this.pendingPatches.delete(id);
    if (!patch) {
      return;
    }
    this.tableService.update(id, patch).subscribe({
      error: () => this.toast.show('Échec de la mise à jour de la table.', 'error'),
    });
  }

  // Envoie immediatement les PUT en attente (fermeture de l'editeur).
  private flushPendingUpdates(): void {
    for (const timer of this.updateTimers.values()) {
      clearTimeout(timer);
    }
    this.updateTimers.clear();
    for (const id of [...this.pendingPatches.keys()]) {
      this.firePendingUpdate(id);
    }
  }

  // --- Canvas events ---------------------------------------------------------

  protected onSelectionChange(ids: string[]): void {
    this.selectedIds.set(ids);
  }

  protected onGeometryChange(changes: TableGeometry[]): void {
    const tablesById = new Map(this.editorTables().map((t) => [t.id, t]));
    const geometry: GeometryMap = { ...this.store.geometry() };
    for (const c of changes) {
      const current = geometry[c.id];
      const view = tablesById.get(c.id);
      const shape = current?.shape ?? view?.shape ?? 'square';
      geometry[c.id] = { x: c.x, y: c.y, w: c.width, h: c.height, rotation: c.rotation, shape };
    }

    // ANTI-CHEVAUCHEMENT (drag simple) : une table lachee SUR une voisine non
    // fusionnee est repoussee a un petit ecart - et on propose la fusion, le
    // geste que ce rapprochement suggere.
    if (changes.length === 1) {
      const moved = changes[0];
      const merges = this.store.merges();
      const sameGroup = new Set(merges.find((group) => group.includes(moved.id)) ?? []);
      // Emprises PIVOTEES : sans cela une table a 90 deg est testee avec sa
      // largeur et sa hauteur inversees, et peut en recouvrir une autre.
      const neighbors = this.editorTables()
        .filter((t) => t.id !== moved.id && !sameGroup.has(t.id))
        .map((t) => ({
          id: t.id,
          label: t.label,
          ...rotatedBox({ x: t.x, y: t.y, w: t.width, h: t.height, rotation: t.rotation }),
        }));
      const movedBox = rotatedBox({
        x: moved.x,
        y: moved.y,
        w: moved.width,
        h: moved.height,
        rotation: moved.rotation,
      });
      const touched = neighbors.find((o) => tablesTouch(movedBox, o, 0.01));
      const corrected = this.settlePosition(movedBox, neighbors);
      if (corrected.x !== moved.x || corrected.y !== moved.y) {
        geometry[moved.id] = { ...geometry[moved.id], x: corrected.x, y: corrected.y };
        if (touched) {
          const movedLabel = tablesById.get(moved.id)?.label ?? 'La table';
          this.toast.show(
            `${movedLabel} touchait ${touched.label} : léger écart appliqué. Grande tablée ?`,
            'default',
            {
              label: 'Fusionner',
              run: () => this.mergeTables([moved.id, touched.id]),
            },
          );
        }
      }
    } else if (changes.length > 1) {
      // ANTI-CHEVAUCHEMENT (drag multiple) : le bloc deplace garde ses positions
      // relatives, mais peut recouvrir des tables FIXES. On repousse chaque table
      // deplacee des tables non deplacees (hors meme tablee), sans proposer de
      // fusion (le geste n'en est pas un).
      const movedIds = new Set(changes.map((c) => c.id));
      const merges = this.store.merges();
      for (const c of changes) {
        const sameGroup = new Set(merges.find((group) => group.includes(c.id)) ?? []);
        const fixed = this.editorTables()
          .filter((t) => !movedIds.has(t.id) && !sameGroup.has(t.id))
          .map((t) =>
            rotatedBox({ x: t.x, y: t.y, w: t.width, h: t.height, rotation: t.rotation }),
          );
        const box = rotatedBox({ x: c.x, y: c.y, w: c.width, h: c.height, rotation: c.rotation });
        const corrected = this.settlePosition(box, fixed);
        if (corrected.x !== c.x || corrected.y !== c.y) {
          geometry[c.id] = { ...geometry[c.id], x: corrected.x, y: corrected.y };
        }
      }
    }
    this.store.commit(geometry);
  }

  // Degage la table des TABLES puis des MURS, en alternance jusqu'a ce que la
  // position ne bouge plus. Une seule passe ne suffit pas : le degagement d'un
  // mur peut pousser la table sur une voisine, et inversement. Sans cette
  // boucle, la correction murale creait le chevauchement qu'on venait d'eviter.
  private settlePosition(
    box: { x: number; y: number; w: number; h: number },
    neighbors: readonly { x: number; y: number; w: number; h: number }[],
  ): { x: number; y: number } {
    const walls = wallObstacles(this.store.walls());
    let pos = { x: box.x, y: box.y };
    for (let pass = 0; pass < 3; pass++) {
      const afterTables = pushApart({ ...pos, w: box.w, h: box.h }, neighbors);
      const afterWalls =
        walls.length === 0
          ? afterTables
          : pushApart({ ...afterTables, w: box.w, h: box.h }, walls, WALL_MIN_GAP);
      const settled = afterWalls.x === pos.x && afterWalls.y === pos.y;
      pos = afterWalls;
      if (settled) {
        break;
      }
    }
    return pos;
  }

  // Fusionne un couple d'ids (action du toast anti-chevauchement) : quitte les
  // anciens groupes puis cree la tablee, comme mergeSelection.
  private mergeTables(ids: string[]): void {
    const idSet = new Set(ids);
    const others = this.store
      .merges()
      .map((group) => group.filter((id) => !idSet.has(id)))
      .filter((group) => group.length >= 2);
    this.store.setMerges([...others, ids]);
    this.toast.show('Tablée créée : visible sur le plan de service (2D et 3D).');
  }

  // --- Snap / sauvegarde -----------------------------------------------------

  protected toggleSnap(): void {
    this.snap.update((v) => !v);
  }

  // EXPORT PNG (LOT B4) : capture le stage Konva de l'editeur et telecharge.
  protected exportPng(): void {
    const dataUrl = this.canvas()?.exportPng();
    if (dataUrl) {
      downloadDataUrl(dataUrl, 'plan-de-salle.png');
    }
  }

  protected onFinish(): void {
    this.flushPendingUpdates();
    this.store.saveNow();
    this.closed.emit();
  }

  // --- Raccourcis clavier ----------------------------------------------------
  // Ctrl/Cmd+Z : annuler ; Ctrl/Cmd+Shift+Z : retablir ; Ctrl/Cmd+D : dupliquer ;
  // Suppr/Backspace : supprimer la selection. On ignore quand le focus est dans un
  // champ (pour ne pas voler la frappe du panneau proprietes).
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (this.store.isEmpty()) {
      return;
    }
    const target = event.target as HTMLElement | null;
    const typing =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable);

    if (event.key === 'Escape' && this.wallMode()) {
      event.preventDefault();
      this.wallMode.set(false);
      return;
    }

    const mod = event.ctrlKey || event.metaKey;

    if (!typing && mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        this.store.redo();
      } else {
        this.store.undo();
      }
      return;
    }
    if (!typing && mod && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      this.duplicateSelection();
      return;
    }
    if (!typing && (event.key === 'Delete' || event.key === 'Backspace')) {
      if (this.selectedIds().length > 0) {
        event.preventDefault();
        this.deleteSelection();
      }
    }
  }
}
