// Import d'un plan de salle depuis Pascal Editor (https://editor.pascal.app).
//
// PRINCIPE : le restaurateur scanne sa salle (app Pascal Capture, LiDAR iPhone)
// ou la dessine dans l'editeur Pascal, puis « Export Scene (JSON) ». Ce module
// PUR (zero dependance) parse ce JSON, detecte les tables parmi les meubles et
// les projette dans NOTRE repere normalise (cf. floor-plan-editor.model.ts).
// L'application (creation des tables back + geometrie) reste dans l'editeur.
//
// FORMAT PASCAL (verifie sur les schemas Zod de @pascal-app/core, licence MIT) :
//  - scene = dictionnaire plat `{ nodes: Record<id, node>, rootNodeIds: [] }` ;
//  - unites en METRES, angles en RADIANS, repere « level » main droite (Three.js) :
//    x = largeur, z = profondeur (notre y ecran), y = hauteur (ignore) ;
//  - meuble = node `type: 'item'` : `position [x,y,z]`, `rotation [x,y,z]`,
//    `scale [x,y,z]`, `asset.dimensions [w,h,d]` (empreinte = dimensions*scale) ;
//  - mur = node `type: 'wall'` : `start [x,z]`, `end [x,z]`, `thickness` ;
//  - PAS de capacite ni de forme natives -> heuristiques ici, corrigees ensuite
//    par l'hote dans notre editeur (source de verite : la table back).

import { TableShape, WallSegment } from './floor-plan-editor.model';

// --- Types d'entree (structurels, volontairement laxistes) --------------------

interface PascalAsset {
  name?: string;
  category?: string;
  tags?: string[];
  dimensions?: [number, number, number];
}

interface PascalNode {
  id?: string;
  type?: string;
  name?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  asset?: PascalAsset;
  // Item heberge sur un mur (etagere, applique...) : coordonnees LOCALES au mur,
  // pas au niveau -> exclu de l'import (jamais une table de toute facon).
  wallId?: string;
  // Murs.
  start?: [number, number];
  end?: [number, number];
  thickness?: number;
}

// --- Types de sortie -----------------------------------------------------------

// Meuble candidat a l'import, projete dans notre repere normalise.
export interface PascalCandidate {
  // Id du node Pascal (traçabilite uniquement, jamais persiste chez nous).
  key: string;
  // Nom lisible (asset.name ou name du node).
  label: string;
  // true si detecte comme table (pre-coche dans l'apercu).
  isTable: boolean;
  // Geometrie dans NOTRE repere (cf. floor-plan-editor.model.ts) :
  // centre normalise 0..1, tailles en fraction du petit cote, rotation en degres.
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  shape: TableShape;
  // Couverts estimes (heuristique perimetre, ~0,6 m par couvert).
  capacity: number;
  // Empreinte reelle au sol (metres), pour l'apercu (« 1,6 m × 0,8 m »).
  widthM: number;
  depthM: number;
}

export interface PascalImportResult {
  ok: boolean;
  // Message d'erreur utilisateur (francais) si ok === false.
  error?: string;
  candidates: PascalCandidate[];
  // Murs normalises (fond de plan decoratif, meme repere que les tables).
  walls: WallSegment[];
  // Compteurs pour le recap de l'apercu (« 12 objets, 5 tables, 4 murs »).
  itemCount: number;
  tableCount: number;
  wallCount: number;
}

// --- Constantes de projection ---------------------------------------------------

// Ratio des conteneurs canvas (les deux vues utilisent aspect-ratio: 16/10) :
// largeur = 1.6 x le petit cote (la hauteur).
const CONTAINER_ASPECT_W = 1.6;
// Marge de securite autour du plan projete (fraction utile = 0.9).
const FIT = 0.9;
// ~0,6 m de bord de table par couvert (norme restauration).
const SEAT_EDGE_M = 0.6;
// Une table fait au moins 0,4 m de cote ; au-dela de 30 m on refuse (scene aberrante).
const MIN_TABLE_M = 0.3;
const MAX_SCENE_M = 200;

// Detection « table » : inclusif sur le nom/categorie/tags, exclusif sur les
// faux amis (table basse, chevet, console...). Volontairement simple : l'apercu
// permet de cocher/decocher, l'humain tranche.
const TABLE_RE = /\btables?\b|dining|desk/i;
const NOT_TABLE_RE = /coffee|side|night|bedside|console|end table|dressing|basse|chevet/i;
const BAR_RE = /\bbars?\b|counter|comptoir|island/i;
const ROUND_RE = /round|ronde?|circular/i;

// --- Parsing ---------------------------------------------------------------------

function isVec3(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length >= 3 && v.every((n) => typeof n === 'number');
}

function isVec2(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length >= 2 && v.every((n) => typeof n === 'number');
}

// Extrait `{ nodes }` en tolerant les enveloppes connues : export brut, `{ graph }`
// (format API /api/scenes) ou `{ scene }`.
function unwrapNodes(raw: unknown): Record<string, PascalNode> | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  for (const candidate of [o, o['graph'], o['scene']]) {
    if (
      candidate != null &&
      typeof candidate === 'object' &&
      typeof (candidate as Record<string, unknown>)['nodes'] === 'object' &&
      (candidate as Record<string, unknown>)['nodes'] != null
    ) {
      return (candidate as { nodes: Record<string, PascalNode> }).nodes;
    }
  }
  return null;
}

interface RawItem {
  node: PascalNode;
  label: string;
  // Centre et empreinte au sol en metres (repere level : x, z).
  cx: number;
  cz: number;
  wM: number;
  dM: number;
  yawDeg: number;
}

// Empreinte au sol d'un item : asset.dimensions * scale (defauts Pascal : [1,1,1]).
function itemFootprint(node: PascalNode): RawItem | null {
  if (!isVec3(node.position)) {
    return null;
  }
  const dims = isVec3(node.asset?.dimensions) ? node.asset.dimensions : [1, 1, 1];
  const scale = isVec3(node.scale) ? node.scale : [1, 1, 1];
  const wM = Math.abs(dims[0] * scale[0]);
  const dM = Math.abs(dims[2] * scale[2]);
  // Filtre les tailles trop petites ET les valeurs non finies (un produit de
  // nombres JSON valides mais enormes peut deborder en Infinity).
  if (!Number.isFinite(wM) || !Number.isFinite(dM) || wM < MIN_TABLE_M || dM < MIN_TABLE_M) {
    return null;
  }
  // Yaw (rotation[1], radians, sens trigo Three.js) -> degres Konva (sens
  // horaire), normalise dans [0, 360) (le double modulo evite -0 et les negatifs).
  const yawRad = isVec3(node.rotation) ? node.rotation[1] : 0;
  const yawDeg = ((((-yawRad * 180) / Math.PI) % 360) + 360) % 360;
  return {
    node,
    label: node.asset?.name ?? node.name ?? 'Objet',
    cx: node.position[0],
    cz: node.position[2],
    wM,
    dM,
    yawDeg,
  };
}

// Texte agrege servant a la detection (nom + categorie + tags).
function searchText(node: PascalNode): string {
  const a = node.asset;
  return [node.name, a?.name, a?.category, ...(a?.tags ?? [])].filter(Boolean).join(' ');
}

// Couverts estimes par le perimetre utile (~0,6 m par couvert), bornes [2, 20].
// Ronde : circonference / 0,7 (les convives se serrent moins bien sur un arc).
export function estimateCapacity(widthM: number, depthM: number, shape: TableShape): number {
  let seats: number;
  if (shape === 'round') {
    seats = Math.floor((Math.PI * widthM) / (SEAT_EDGE_M + 0.1));
  } else if (shape === 'bar') {
    // Un seul cote assis sur un comptoir.
    seats = Math.floor(Math.max(widthM, depthM) / SEAT_EDGE_M);
  } else {
    seats = 2 * Math.floor(widthM / SEAT_EDGE_M) + 2 * Math.floor(depthM / SEAT_EDGE_M);
  }
  return Math.min(20, Math.max(2, seats));
}

// Forme deduite : nom (« round ») > ratio (long et fin = bar, quasi-carre = square).
function inferShape(text: string, widthM: number, depthM: number): TableShape {
  if (ROUND_RE.test(text)) {
    return 'round';
  }
  const ratio = Math.max(widthM, depthM) / Math.min(widthM, depthM);
  if (BAR_RE.test(text) || ratio >= 3) {
    return 'bar';
  }
  return ratio <= 1.2 ? 'square' : 'rect';
}

// Parse un export JSON Pascal et projette tables + murs dans notre repere.
export function parsePascalScene(json: string): PascalImportResult {
  const failure = (error: string): PascalImportResult => ({
    ok: false,
    error,
    candidates: [],
    walls: [],
    itemCount: 0,
    tableCount: 0,
    wallCount: 0,
  });

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return failure('Fichier illisible : ce n’est pas un JSON valide.');
  }
  const nodes = unwrapNodes(raw);
  if (!nodes) {
    return failure('Format inattendu : aucun champ « nodes » trouvé (export Pascal attendu).');
  }

  const all = Object.values(nodes).filter(
    (n): n is PascalNode => n != null && typeof n === 'object',
  );
  // Items au sol uniquement : les items heberges sur un mur (wallId) ont des
  // coordonnees locales au mur, pas au niveau -> exclus.
  const items = all
    .filter((n) => n.type === 'item' && n.wallId == null)
    .map(itemFootprint)
    .filter((i): i is RawItem => i != null);
  const rawWalls = all.filter((n) => n.type === 'wall' && isVec2(n.start) && isVec2(n.end));

  if (items.length === 0 && rawWalls.length === 0) {
    return failure('Aucun meuble ni mur exploitable dans cette scène.');
  }

  // Cadre de la scene (metres) : murs ET items - un meuble pose HORS de
  // l'emprise des murs (scan imparfait) doit rester visible sur le canvas,
  // jamais projete hors [0,1].
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const extend = (x: number, z: number): void => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  };
  for (const w of rawWalls) {
    extend(w.start![0], w.start![1]);
    extend(w.end![0], w.end![1]);
  }
  for (const i of items) {
    extend(i.cx - i.wM / 2, i.cz - i.dM / 2);
    extend(i.cx + i.wM / 2, i.cz + i.dM / 2);
  }
  const sceneW = maxX - minX;
  const sceneD = maxZ - minZ;
  if (sceneW > MAX_SCENE_M || sceneD > MAX_SCENE_M) {
    return failure('Scène trop grande (plus de 200 m) : vérifiez l’export.');
  }

  // ECHELLE UNIQUE metres -> fraction du petit cote, proportions conservees :
  // k = metres representes par le petit cote du conteneur (16:10 -> largeur = 1.6).
  const k = Math.max(sceneD / FIT, sceneW / (FIT * CONTAINER_ASPECT_W), 1);
  const cx0 = (minX + maxX) / 2;
  const cz0 = (minZ + maxZ) / 2;
  // Position normalisee : x en fraction de LARGEUR (petit cote * 1.6), y de HAUTEUR.
  const normX = (xM: number): number => 0.5 + (xM - cx0) / (k * CONTAINER_ASPECT_W);
  const normY = (zM: number): number => 0.5 + (zM - cz0) / k;

  const candidates: PascalCandidate[] = items.map((i) => {
    const text = searchText(i.node);
    const shape = inferShape(text, i.wM, i.dM);
    // Un comptoir/bar est un emplacement assis en restauration -> pre-coche aussi.
    const isTable = (TABLE_RE.test(text) || BAR_RE.test(text)) && !NOT_TABLE_RE.test(text);
    return {
      key: i.node.id ?? i.label,
      label: i.label,
      isTable,
      x: normX(i.cx),
      y: normY(i.cz),
      w: i.wM / k,
      h: i.dM / k,
      rotation: Math.round(i.yawDeg),
      shape,
      capacity: estimateCapacity(i.wM, i.dM, shape),
      widthM: Math.round(i.wM * 100) / 100,
      depthM: Math.round(i.dM * 100) / 100,
    };
  });

  const walls: WallSegment[] = rawWalls.map((w) => ({
    x1: normX(w.start![0]),
    y1: normY(w.start![1]),
    x2: normX(w.end![0]),
    y2: normY(w.end![1]),
    thickness: (typeof w.thickness === 'number' ? w.thickness : 0.2) / k,
  }));

  return {
    ok: true,
    candidates,
    walls,
    itemCount: candidates.length,
    tableCount: candidates.filter((c) => c.isTable).length,
    wallCount: walls.length,
  };
}
