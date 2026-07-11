// Modele de l'EDITEUR de plan de salle (Phase 2, revise LOT A).
//
// PRINCIPE (bridge editeur <-> tables reelles) : le plan ne stocke PLUS de tables
// autonomes. Il stocke uniquement de la GEOMETRIE, keyee par l'id BACK de la table
// (`{ tableId -> { x, y, w, h, rotation, shape } }`). Le nom et les couverts
// viennent TOUJOURS de la table back (TableService = source de verite unique).
//
// COORDONNEES :
//  - x, y : CENTRE de la table, normalises 0..1 sur la largeur/hauteur du conteneur ;
//  - w, h : dimensions normalisees 0..1 par rapport au PETIT COTE du conteneur
//    (echelle UNIQUE -> un carre reste carre quel que soit le ratio de l'ecran).
//
// PERSISTANCE : localStorage (cf. FloorPlanService), une cle par restaurant.
// Le jour ou le back exposera /api/floor-plans, cette forme est deja serialisable.

// Forme d'une table sur le plan.
//  - round  : table ronde (Konva Circle) ;
//  - square : table carree (Rect) ;
//  - rect   : table rectangulaire (Rect) ;
//  - bar    : comptoir (Rect long et fin).
export type TableShape = 'round' | 'square' | 'rect' | 'bar';

// Geometrie d'UNE table, keyee par son id back dans le plan.
export interface TableGeometryEntry {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  shape: TableShape;
}

// Geometrie du plan complet : id BACK de la table -> geometrie.
export type GeometryMap = Record<string, TableGeometryEntry>;

// Segment de mur DECORATIF (fond de plan, non interactif), issu d'un import
// Pascal (scan 3D). Coordonnees normalisees comme les tables : x en fraction de
// largeur, y de hauteur, epaisseur en fraction du petit cote.
export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
}

// Version du format persiste. L'ancien format (tables autonomes, sans `version`)
// est detecte et purge par FloorPlanService.
export const FLOOR_PLAN_VERSION = 2;

// Plan de salle persiste par restaurant.
export interface FloorPlan {
  version: typeof FLOOR_PLAN_VERSION;
  restaurantId: string;
  geometry: GeometryMap;
  // Murs decoratifs (optionnels : uniquement apres un import Pascal). Champ
  // ADDITIF : les plans v2 sans murs restent valides, pas de bump de version.
  walls?: WallSegment[];
}

// Table telle que vue par le CANVAS de l'editeur : geometrie du plan + identite
// (label/couverts) de la table back. C'est un modele DERIVE, jamais persiste tel quel.
export interface EditorTable {
  id: string;
  label: string;
  shape: TableShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  seats: number;
}

// Preset de pose rapide (palette). Un clic CREE UNE VRAIE TABLE cote back
// (POST /api/tables) puis pose sa geometrie. Dimensions normalisees sur le
// petit cote du conteneur.
export interface TablePreset {
  // Identifiant stable (sert de cle @for et de data-testid).
  key: string;
  // Libelle court affiche dans la palette.
  label: string;
  // Aide courte (title / aria-label).
  description: string;
  shape: TableShape;
  seats: number;
  width: number;
  height: number;
}

// Tailles normalisees de reference (fraction du PETIT COTE du conteneur).
const W_ROUND_2 = 0.12;
const W_SQUARE_4 = 0.14;
const W_RECT_6 = 0.22;
const H_RECT_6 = 0.14;
const W_RECT_8 = 0.28;
const H_RECT_8 = 0.15;
const W_BAR = 0.5;
const H_BAR = 0.09;

// Palette de pose rapide : presets par couverts. Chaque clic cree une table REELLE.
export const TABLE_PRESETS: readonly TablePreset[] = [
  {
    key: 'round-2',
    label: '2 · Ronde',
    description: 'Créer une table ronde 2 couverts',
    shape: 'round',
    seats: 2,
    width: W_ROUND_2,
    height: W_ROUND_2,
  },
  {
    key: 'square-4',
    label: '4 · Carrée',
    description: 'Créer une table carrée 4 couverts',
    shape: 'square',
    seats: 4,
    width: W_SQUARE_4,
    height: W_SQUARE_4,
  },
  {
    key: 'rect-6',
    label: '6 · Rectangle',
    description: 'Créer une table rectangulaire 6 couverts',
    shape: 'rect',
    seats: 6,
    width: W_RECT_6,
    height: H_RECT_6,
  },
  {
    key: 'rect-8',
    label: '8 · Grand rectangle',
    description: 'Créer une grande table 8 couverts',
    shape: 'rect',
    seats: 8,
    width: W_RECT_8,
    height: H_RECT_8,
  },
  {
    key: 'bar',
    label: 'Bar',
    description: 'Créer un comptoir / bar',
    shape: 'bar',
    seats: 4,
    width: W_BAR,
    height: H_BAR,
  },
] as const;

// Pas de la grille de magnetisme (snap-to-grid), en NORMALISE.
export const GRID_STEP = 0.025;

// Ratio des conteneurs canvas (les deux vues utilisent aspect-ratio: 16/10).
// Sert aux helpers purs qui doivent convertir une taille (fraction du petit cote)
// en pas horizontal (fraction de la largeur) sans connaitre le DOM.
const CONTAINER_ASPECT = 10 / 16;

// --- Helpers purs (testables sans Konva ni DOM) ------------------------------

// Borne une valeur dans [min, max].
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Aimante une coordonnee normalisee sur la grille la plus proche.
export function snapToGrid(value: number, step = GRID_STEP): number {
  return Math.round(value / step) * step;
}

// ECHELLE UNIQUE (fix distorsion D2) : les tailles de table sont des fractions du
// PETIT COTE du conteneur, appliquees a w ET h. Un carre (w == h) rend donc
// wPx == hPx sur tout ecran. Utilise par les DEUX canvas (editeur + service).
export function tableSizePx(
  w: number,
  h: number,
  containerW: number,
  containerH: number,
  minPx = 32,
): { w: number; h: number } {
  const scale = Math.min(containerW, containerH);
  return { w: Math.max(minPx, w * scale), h: Math.max(minPx, h * scale) };
}

// Position auto-grille (index parmi count) en coordonnees normalisees 0..1.
// Meme repartition que l'auto-grille historique de la vue service.
export function gridPosition(index: number, count: number): { x: number; y: number } {
  if (count <= 0) {
    return { x: 0.5, y: 0.5 };
  }
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const marginX = 0.5 / cols;
  const marginY = 0.5 / rows;
  const stepX = cols > 1 ? (1 - 2 * marginX) / (cols - 1) : 0;
  const stepY = rows > 1 ? (1 - 2 * marginY) / (rows - 1) : 0;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: cols > 1 ? marginX + col * stepX : 0.5,
    y: rows > 1 ? marginY + row * stepY : 0.5,
  };
}

// Geometrie par defaut d'une table SANS entree dans le plan : forme et taille
// derivees de sa capacite (repli auto-grille pour la position).
export function defaultGeometryFor(
  capacity: number,
  position: { x: number; y: number } = { x: 0.5, y: 0.5 },
): TableGeometryEntry {
  let shape: TableShape;
  let w: number;
  let h: number;
  if (capacity <= 2) {
    shape = 'round';
    w = W_ROUND_2;
    h = W_ROUND_2;
  } else if (capacity <= 4) {
    shape = 'square';
    w = W_SQUARE_4;
    h = W_SQUARE_4;
  } else if (capacity <= 6) {
    shape = 'rect';
    w = W_RECT_6;
    h = H_RECT_6;
  } else {
    shape = 'rect';
    w = W_RECT_8;
    h = H_RECT_8;
  }
  return { x: clamp(position.x, 0, 1), y: clamp(position.y, 0, 1), w, h, rotation: 0, shape };
}

// Geometrie d'une table creee depuis un preset, posee a (x, y) (centre par defaut).
export function geometryFromPreset(
  preset: TablePreset,
  position: { x: number; y: number } = { x: 0.5, y: 0.5 },
): TableGeometryEntry {
  return {
    x: clamp(position.x, 0, 1),
    y: clamp(position.y, 0, 1),
    w: preset.width,
    h: preset.height,
    rotation: 0,
    shape: preset.shape,
  };
}

// Complete la geometrie manquante : pour chaque table SANS entree, position
// auto-grille (calculee sur l'ensemble des tables pour rester stable) + forme et
// taille par capacite. Ne touche pas aux entrees existantes.
export function seedMissingGeometry(
  tables: readonly { id: string; capacity: number }[],
  existing: GeometryMap,
): GeometryMap {
  const added: GeometryMap = {};
  tables.forEach((t, i) => {
    if (!existing[t.id]) {
      added[t.id] = defaultGeometryFor(t.capacity, gridPosition(i, tables.length));
    }
  });
  return added;
}

// Calcule le prochain nom court "T<n>" non utilise parmi les tables REELLES.
// On prend le plus petit entier libre pour rester lisible apres suppressions.
export function nextTableName(existingNames: readonly string[]): string {
  const used = new Set(
    existingNames
      .map((name) => /^T(\d+)$/.exec(name.trim())?.[1])
      .filter((n): n is string => n != null)
      .map((n) => Number(n)),
  );
  let i = 1;
  while (used.has(i)) {
    i++;
  }
  return `T${i}`;
}

// Positions d'une rangee de N tables alignees (meme y, x incremente regulierement),
// centree horizontalement. Le pas convertit la largeur du preset (fraction du petit
// cote) en fraction de largeur via le ratio 16:10 des conteneurs.
export function rowGeometries(preset: TablePreset, count: number, y = 0.5): TableGeometryEntry[] {
  const n = Math.max(1, Math.floor(count));
  const gap = 0.02;
  const widthFrac = preset.width * CONTAINER_ASPECT;
  const step = widthFrac + gap;
  const totalWidth = step * (n - 1);
  const startX = clamp(0.5 - totalWidth / 2, widthFrac / 2, 1 - widthFrac / 2);

  const entries: TableGeometryEntry[] = [];
  for (let i = 0; i < n; i++) {
    entries.push(geometryFromPreset(preset, { x: clamp(startX + i * step, 0, 1), y }));
  }
  return entries;
}

// Copie de geometrie avec un leger decalage (duplication : la table dupliquee est
// CREEE cote back par l'editeur, seule sa geometrie est copiee ici).
export function offsetGeometry(entry: TableGeometryEntry, offset = 0.05): TableGeometryEntry {
  return { ...entry, x: clamp(entry.x + offset, 0, 1), y: clamp(entry.y + offset, 0, 1) };
}

// --- Templates de mise en page ------------------------------------------------
// Un template APPLIQUE des positions/formes aux tables EXISTANTES (les N premieres) ;
// il ne cree AUCUNE table. Les tables au-dela des emplacements du template gardent
// le repli auto-grille (geometrie completee ensuite par l'editeur).

export interface FloorPlanTemplate {
  key: string;
  label: string;
  description: string;
  // Applique le template aux ids de tables donnes (dans l'ordre) -> geometrie.
  apply(tableIds: readonly string[]): GeometryMap;
}

// Emplacement d'un template (geometrie sans table associee).
type TemplateSlot = TableGeometryEntry;

function slot(x: number, y: number, w: number, h: number, shape: TableShape): TemplateSlot {
  return { x, y, w, h, rotation: 0, shape };
}

// Zippe les emplacements avec les ids reels : min(N emplacements, M tables).
function applySlots(slots: readonly TemplateSlot[], tableIds: readonly string[]): GeometryMap {
  const geometry: GeometryMap = {};
  const n = Math.min(slots.length, tableIds.length);
  for (let i = 0; i < n; i++) {
    geometry[tableIds[i]] = { ...slots[i] };
  }
  return geometry;
}

// Bistrot : 12 emplacements ronds, 3 rangees de 4.
const BISTROT_SLOTS: TemplateSlot[] = [];
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 4; c++) {
    BISTROT_SLOTS.push(slot(0.18 + c * 0.21, 0.25 + r * 0.25, W_ROUND_2, W_ROUND_2, 'round'));
  }
}

// Rangees : 12 emplacements carres, 3 rangees de 4.
const ROWS_SLOTS: TemplateSlot[] = [];
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 4; c++) {
    ROWS_SLOTS.push(slot(0.16 + c * 0.23, 0.25 + r * 0.25, W_SQUARE_4, W_SQUARE_4, 'square'));
  }
}

// Brasserie : un bar en haut + 8 emplacements mixtes.
const BRASSERIE_SLOTS: TemplateSlot[] = [
  slot(0.5, 0.12, W_BAR, H_BAR, 'bar'),
  slot(0.18, 0.42, W_SQUARE_4, W_SQUARE_4, 'square'),
  slot(0.39, 0.42, W_SQUARE_4, W_SQUARE_4, 'square'),
  slot(0.61, 0.42, W_SQUARE_4, W_SQUARE_4, 'square'),
  slot(0.82, 0.42, W_SQUARE_4, W_SQUARE_4, 'square'),
  slot(0.16, 0.72, W_ROUND_2, W_ROUND_2, 'round'),
  slot(0.34, 0.72, W_ROUND_2, W_ROUND_2, 'round'),
  slot(0.6, 0.72, W_RECT_6, H_RECT_6, 'rect'),
  slot(0.82, 0.72, W_RECT_6, H_RECT_6, 'rect'),
];

export const FLOOR_PLAN_TEMPLATES: readonly FloorPlanTemplate[] = [
  {
    key: 'blank',
    label: 'Grille automatique',
    description: 'Vos tables en grille, à réarranger librement.',
    apply: () => ({}),
  },
  {
    key: 'bistrot',
    label: 'Bistrot',
    description: 'Dispose vos tables en configuration bistrot (3 rangées de rondes).',
    apply: (ids) => applySlots(BISTROT_SLOTS, ids),
  },
  {
    key: 'rows',
    label: 'Rangées',
    description: 'Dispose vos tables en 3 rangées régulières.',
    apply: (ids) => applySlots(ROWS_SLOTS, ids),
  },
  {
    key: 'brasserie',
    label: 'Brasserie',
    description: 'Dispose vos tables autour d’un bar (configuration brasserie).',
    apply: (ids) => applySlots(BRASSERIE_SLOTS, ids),
  },
] as const;
