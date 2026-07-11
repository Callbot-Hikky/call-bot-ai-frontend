import { Injectable, computed, signal } from '@angular/core';
import {
  FLOOR_PLAN_VERSION,
  FloorPlan,
  GeometryMap,
  TableGeometryEntry,
  WallSegment,
} from '@core/models/floor-plan-editor.model';

// Etat de sauvegarde affiche dans l'editeur (indicateur « Enregistré »).
//  - saved  : le plan en memoire est identique a ce qui est persiste ;
//  - saving : ecriture en cours (transitoire) ;
//  - dirty  : modifications non encore persistees (autosave va declencher).
export type SaveState = 'saved' | 'saving' | 'dirty';

const STORAGE_PREFIX = 'hk.floorPlan.';
const AUTOSAVE_DELAY = 600;
const HISTORY_LIMIT = 50;

// Service du plan de salle EDITABLE (Phase 2, revise LOT A).
//
// MODELE : le plan ne stocke que de la GEOMETRIE keyee par l'id BACK de la table
// ({ tableId -> { x, y, w, h, rotation, shape } }). Nom/couverts restent dans
// TableService (source de verite unique) — plus de split-brain.
//
// PERSISTANCE — contrainte ferme : le back n'a pas (encore) d'endpoint floor-plans.
// On persiste donc le plan en localStorage, une cle par restaurant.
// L'ANCIEN format (v. tables autonomes, sans champ `version`) est detecte et purge
// proprement : on repart d'un plan vide plutot que crasher ou melanger les ids.
//
// >>> A BRANCHER PLUS TARD (coordination equipe back) <<<
// Le jour ou l'API existera, remplacer la lecture/ecriture localStorage par
// GET/PUT /api/floor-plans : la forme serialisee (FloorPlan v2) est deja celle
// a envoyer, seul le transport change.
@Injectable({ providedIn: 'root' })
export class FloorPlanService {
  // Plan courant en memoire (source de verite de l'editeur). null = aucun plan.
  private readonly _plan = signal<FloorPlan | null>(null);
  private readonly _saveState = signal<SaveState>('saved');
  // True une fois load() appele : permet de distinguer « pas chargé » de « vide ».
  private readonly _loaded = signal(false);

  readonly plan = this._plan.asReadonly();
  readonly saveState = this._saveState.asReadonly();
  readonly loaded = this._loaded.asReadonly();

  // Geometrie du plan courant (vide si aucun plan). Consommee par l'editeur ET
  // par la vue service (bridge : layoutTables).
  readonly geometry = computed<GeometryMap>(() => this._plan()?.geometry ?? {});
  // Murs decoratifs (import Pascal) : fond de plan des deux canvas.
  readonly walls = computed<WallSegment[]>(() => this._plan()?.walls ?? []);
  // Vrai quand aucun plan n'est persiste : l'editeur affiche l'ecran templates.
  readonly isEmpty = computed(() => this._loaded() && this._plan() === null);

  // Historique undo/redo : piles d'instantanes de geometrie.
  private undoStack: GeometryMap[] = [];
  private redoStack: GeometryMap[] = [];
  private readonly _canUndo = signal(false);
  private readonly _canRedo = signal(false);
  readonly canUndo = this._canUndo.asReadonly();
  readonly canRedo = this._canRedo.asReadonly();

  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private restaurantId = '';

  private key(restaurantId: string): string {
    return `${STORAGE_PREFIX}${restaurantId}`;
  }

  private storage(): Storage | null {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      // Acces localStorage peut lever (mode prive strict, sandbox) : on degrade.
      return null;
    }
  }

  // Charge le plan persiste pour ce restaurant (ou null si aucun). A appeler a
  // l'ouverture de l'editeur / de la vue plan. Reinitialise l'historique.
  load(restaurantId: string): void {
    this.restaurantId = restaurantId;
    this.undoStack = [];
    this.redoStack = [];
    this.refreshHistoryFlags();

    const plan = this.read(restaurantId);
    this._plan.set(plan);
    this._loaded.set(true);
    this._saveState.set('saved');
  }

  // Lecture brute localStorage -> FloorPlan v2 (ou null). Tolerante aux donnees
  // corrompues ET a l'ancien format (tables autonomes) : detecte -> purge -> null.
  private read(restaurantId: string): FloorPlan | null {
    const store = this.storage();
    if (!store) {
      return null;
    }
    const raw = store.getItem(this.key(restaurantId));
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<FloorPlan> & { tables?: unknown };
      if (
        !parsed ||
        parsed.version !== FLOOR_PLAN_VERSION ||
        typeof parsed.geometry !== 'object' ||
        parsed.geometry === null ||
        Array.isArray(parsed.geometry)
      ) {
        // Ancien format (tableau `tables`) ou donnees inattendues : on purge pour
        // repartir proprement (les ids de l'ancien format n'ont aucun lien back).
        store.removeItem(this.key(restaurantId));
        return null;
      }
      // Geometrie validee ENTREE PAR ENTREE (localStorage peut etre partiellement
      // corrompu) : on ne garde que les entrees saines, comme pour les murs.
      const geometry: GeometryMap = {};
      for (const [id, entry] of Object.entries(parsed.geometry)) {
        const e = entry as Partial<TableGeometryEntry> | null;
        if (
          e != null &&
          typeof e === 'object' &&
          [e.x, e.y, e.w, e.h, e.rotation].every((n) => typeof n === 'number') &&
          typeof e.shape === 'string'
        ) {
          geometry[id] = e as TableGeometryEntry;
        }
      }
      return {
        version: FLOOR_PLAN_VERSION,
        restaurantId,
        geometry,
        // Murs optionnels (import Pascal) : on ne garde que des segments sains.
        walls: Array.isArray(parsed.walls)
          ? parsed.walls.filter(
              (w): w is WallSegment =>
                w != null &&
                typeof w === 'object' &&
                [w.x1, w.y1, w.x2, w.y2, w.thickness].every((n) => typeof n === 'number'),
            )
          : undefined,
      };
    } catch {
      return null;
    }
  }

  // Initialise un NOUVEAU plan (depuis un template) et le persiste immediatement.
  // Utilise par l'ecran de demarrage. Les murs d'un eventuel plan precedent ne
  // sont PAS herites (un template repart d'une salle nue ; l'import Pascal pose
  // ses murs ensuite via setWalls).
  initFrom(geometry: GeometryMap): void {
    this._plan.set({ ...this.makePlan(this.clone(geometry)), walls: undefined });
    this.undoStack = [];
    this.redoStack = [];
    this.refreshHistoryFlags();
    this.persist();
  }

  // Remplace la geometrie du plan, en empilant l'etat PRECEDENT pour l'undo, puis
  // declenche l'autosave. C'est LE point d'entree de toute mutation de l'editeur :
  // pose, drag, resize, suppression, alignement, changement de forme...
  commit(next: GeometryMap): void {
    const current = this._plan();
    if (!current) {
      // Pas de plan initialise : on en cree un (cas limite, robustesse).
      this._plan.set(this.makePlan(this.clone(next)));
      this.scheduleAutosave();
      return;
    }
    this.pushHistory(current.geometry);
    this._plan.set({ ...current, geometry: this.clone(next) });
    this.scheduleAutosave();
  }

  // Fusionne des entrees SANS empiler d'historique : sert au semis initial
  // (completer la geometrie des tables reelles sans entree) — un undo juste apres
  // l'ouverture ne doit pas « vider » le plan.
  merge(entries: GeometryMap): void {
    const current = this._plan();
    const base = current?.geometry ?? {};
    this._plan.set(this.makePlan({ ...this.clone(base), ...this.clone(entries) }));
    this.scheduleAutosave();
  }

  // Pose les murs decoratifs (import Pascal), SANS historique : les murs ne font
  // pas partie des gestes d'edition (pas d'undo), ils changent au prochain import.
  // Cree le plan s'il n'existe pas encore (import depuis l'ecran de demarrage).
  setWalls(walls: WallSegment[]): void {
    const current = this._plan();
    const base = current ?? this.makePlan({});
    this._plan.set({ ...base, walls: walls.map((w) => ({ ...w })) });
    this.scheduleAutosave();
  }

  // Retire la geometrie d'une table supprimee (sans historique : la suppression
  // back n'est pas annulable par undo).
  removeEntry(tableId: string): void {
    const current = this._plan();
    if (!current || !current.geometry[tableId]) {
      return;
    }
    const next = this.clone(current.geometry);
    delete next[tableId];
    this._plan.set({ ...current, geometry: next });
    this.scheduleAutosave();
  }

  // Annule la derniere mutation (Ctrl/Cmd+Z). Bascule l'etat courant vers redo.
  undo(): void {
    const previous = this.undoStack.pop();
    if (previous === undefined) {
      return;
    }
    const current = this._plan();
    if (current) {
      this.redoStack.push(this.clone(current.geometry));
    }
    this._plan.set(this.makePlan(previous));
    this.refreshHistoryFlags();
    this.scheduleAutosave();
  }

  // Retablit la mutation annulee (Ctrl/Cmd+Shift+Z).
  redo(): void {
    const next = this.redoStack.pop();
    if (next === undefined) {
      return;
    }
    const current = this._plan();
    if (current) {
      this.undoStack.push(this.clone(current.geometry));
    }
    this._plan.set(this.makePlan(next));
    this.refreshHistoryFlags();
    this.scheduleAutosave();
  }

  // Force une sauvegarde immediate (ex. bouton « Terminer »), en annulant un
  // autosave en attente.
  saveNow(): void {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    this.persist();
  }

  // Reconstruit le plan : PRESERVE les murs courants (ils ne participent pas a
  // l'historique de geometrie — un undo/commit ne doit jamais les effacer).
  private makePlan(geometry: GeometryMap): FloorPlan {
    return {
      version: FLOOR_PLAN_VERSION,
      restaurantId: this.restaurantId,
      geometry,
      walls: this._plan()?.walls,
    };
  }

  private scheduleAutosave(): void {
    this._saveState.set('dirty');
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
    }
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      this.persist();
    }, AUTOSAVE_DELAY);
  }

  // Ecrit le plan courant en localStorage et passe l'indicateur a « Enregistré ».
  private persist(): void {
    const plan = this._plan();
    const store = this.storage();
    if (!plan || !store) {
      // Rien a ecrire (ou stockage indisponible) : on ne ment pas sur l'etat.
      this._saveState.set(store ? 'saved' : 'dirty');
      return;
    }
    this._saveState.set('saving');
    try {
      store.setItem(this.key(plan.restaurantId), JSON.stringify(plan));
      this._saveState.set('saved');
    } catch {
      // Quota / indisponible : on reste « dirty » pour signaler l'echec.
      this._saveState.set('dirty');
    }
  }

  private pushHistory(geometry: GeometryMap): void {
    this.undoStack.push(this.clone(geometry));
    if (this.undoStack.length > HISTORY_LIMIT) {
      this.undoStack.shift();
    }
    // Toute nouvelle mutation invalide le redo.
    this.redoStack = [];
    this.refreshHistoryFlags();
  }

  private refreshHistoryFlags(): void {
    this._canUndo.set(this.undoStack.length > 0);
    this._canRedo.set(this.redoStack.length > 0);
  }

  // Clone simple de la geometrie (objets plats serialisables) : evite tout
  // partage de reference entre etat courant et historique.
  private clone(geometry: GeometryMap): GeometryMap {
    const out: GeometryMap = {};
    for (const [id, entry] of Object.entries(geometry)) {
      out[id] = { ...entry };
    }
    return out;
  }
}
