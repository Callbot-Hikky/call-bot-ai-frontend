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
  geometryFromPreset,
  nextTableName,
  offsetGeometry,
  rowGeometries,
  seedMissingGeometry,
} from '@core/models/floor-plan-editor.model';
import { buildEditorTables } from '@core/models/floor-plan.model';
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

// Specification d'une table a creer (POST /api/tables) + sa geometrie a poser.
interface CreateSpec {
  capacity: number;
  zone?: string | null;
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
    @if (store.isEmpty()) {
      <!-- Ecran de demarrage : aucun plan sauvegarde -> choix d'une mise en page. -->
      <div class="bg-card border-border flex flex-col gap-5 rounded-md border p-6">
        <div class="flex flex-col gap-1">
          <h2 class="text-text-strong text-lg font-semibold">Mettre en page la salle</h2>
          <p class="text-text-subtle text-sm">
            Choisissez une disposition de départ pour vos {{ tableCount() }} table(s). Tout reste
            modifiable ensuite.
          </p>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          @for (tpl of templates; track tpl.key) {
            <button
              type="button"
              [attr.data-testid]="'template-' + tpl.key"
              [disabled]="tableService.loading()"
              class="border-border hover:border-primary hover:bg-muted focus-visible:ring-primary flex flex-col gap-1.5 rounded-md border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
              (click)="useTemplate(tpl.key)"
            >
              <span class="text-text-strong text-sm font-semibold">{{ tpl.label }}</span>
              <span class="text-text-subtle text-xs">{{ tpl.description }}</span>
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
          <hk-button variant="ghost" size="sm" (click)="closed.emit()">
            <hk-icon name="lucideChevronLeft" [size]="16" />
            Retour au plan
          </hk-button>
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

          <hk-button variant="ghost" size="sm" [disabled]="creating()" (click)="addRow()">
            <hk-icon name="lucideRows3" [size]="16" />
            Générer une rangée
          </hk-button>

          <hk-button
            variant="ghost"
            size="sm"
            data-testid="toolbar-pascal-import"
            title="Créer la salle depuis un scan 3D de votre restaurant (Pascal)"
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
            title="Tracer les murs de votre salle : deux clics = un mur"
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
          }

          <hk-button
            variant="ghost"
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
            <span
              class="text-text-subtle inline-flex items-center gap-1.5 text-xs"
              aria-live="polite"
            >
              @if (store.saveState() === 'saved') {
                <hk-icon name="lucideCheck" [size]="14" class="text-st-confirmed-fg" />
                Enregistré
              } @else if (store.saveState() === 'saving') {
                Enregistrement…
              } @else {
                Modifications non enregistrées
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
                <strong>Mode murs :</strong> cliquez un premier point, puis un second — le mur se
                trace entre les deux. Enchaînez les murs, puis « Terminer les murs » (ou Échap).
              </div>
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
              <span>{{ tableCount() }} table(s)</span>
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
      <hk-pascal-import (closed)="importOpen.set(false)" (imported)="onImported($event)" />
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
  protected readonly shapeOptions = SHAPE_OPTIONS;

  protected readonly selectedIds = signal<readonly string[]>([]);
  protected readonly snap = signal(true);
  // Creation(s) en cours (POST sequentiels) : evite les doubles clics.
  protected readonly creating = signal(false);
  // Dialogue d'import Pascal (scan 3D / editeur web) ouvert.
  protected readonly importOpen = signal(false);
  // MODE MURS : trace a la main (deux clics = un mur), tables gelees pendant.
  protected readonly wallMode = signal(false);

  // Tables vues par le canvas : identite (nom/couverts) des tables REELLES +
  // geometrie du plan (repli auto-grille tant que la table n'a pas d'entree).
  protected readonly editorTables = computed<EditorTable[]>(() =>
    buildEditorTables(this.tableService.tables(), this.store.geometry()),
  );

  protected readonly tableCount = computed(() => this.tableService.tables().length);

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
    // manquante (position auto-grille) SANS entree d'historique — les positions de
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

  // Applique un template aux tables EXISTANTES (les N premieres) : aucune creation.
  protected useTemplate(key: string): void {
    const tpl = this.templates.find((t) => t.key === key);
    if (!tpl) {
      return;
    }
    const ids = this.tableService.tables().map((t) => t.id);
    this.store.initFrom(tpl.apply(ids));
    this.selectedIds.set([]);
  }

  // --- Creation de tables reelles (POST /api/tables) ----------------------------

  protected addPreset(preset: TablePreset): void {
    this.createTables([{ capacity: preset.seats, geo: geometryFromPreset(preset) }]);
  }

  protected addRow(): void {
    // Rangee de 4 tables carrees de 4 par defaut (preset le plus courant).
    const preset = this.presets.find((p) => p.key === 'square-4') ?? this.presets[0];
    const specs = rowGeometries(preset, 4).map((geo) => ({ capacity: preset.seats, geo }));
    this.createTables(specs);
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

  protected undoLastWall(): void {
    this.store.setWalls(this.store.walls().slice(0, -1));
  }

  protected clearWalls(): void {
    this.store.setWalls([]);
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
    this.createTables(specs);
    this.toast.show(`${specs.length} table(s) importée(s) depuis Pascal.`);
  }

  // Cree N tables SEQUENTIELLEMENT (les noms « Tn » se suivent car le signal tables
  // est mis a jour apres chaque POST), pose leur geometrie, puis les selectionne.
  // En cas d'echec reseau : toast, pas de table fantome (la geometrie n'est posee
  // qu'apres la reponse du back).
  private createTables(specs: CreateSpec[]): void {
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
                  this.store.commit({ ...this.store.geometry(), [table.id]: spec.geo });
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
          }
          if (failed) {
            this.toast.show('Impossible de créer la table. Réessayez.', 'error');
          }
        },
      });
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

    from(deletable)
      .pipe(
        concatMap((id) =>
          this.tableService.remove(id).pipe(
            concatMap(() => {
              this.store.removeEntry(id);
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
        complete: () => this.selectedIds.set(blocked),
      });
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
    this.store.commit(geometry);
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
