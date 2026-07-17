import { Reservation } from './reservation.model';
import { FloorTable } from './table.model';
import { formatTime } from '@core/utils/format';
import {
  EditorTable,
  GeometryMap,
  TableShape,
  defaultGeometryFor,
  gridPosition,
} from './floor-plan-editor.model';

// V1 : 3 statuts seulement, 100 % derives des reservations (doc 05 correctif 2).
//  - libre    : aucune reservation active sur la table
//  - reservee : une reservation confirmed/pending ACTIVE au moment courant
//  - installee: une reservation seated sur la table aujourd'hui
export type FloorTableStatus = 'libre' | 'reservee' | 'installee';

// DERIVATION TEMPORELLE (poste de commandement) : fenetres FIXES, car le modele
// front n'expose pas endsAt. Une resa confirmed/pending est « active » sur sa
// table de 45 min AVANT son heure a 120 min APRES (duree de service type).
export const ACTIVE_BEFORE_MIN = 45;
export const ACTIVE_AFTER_MIN = 120;
// Retard signale a partir de +15 min apres l'heure prevue (sans installation).
export const LATE_THRESHOLD_MIN = 15;

const MINUTE_MS = 60_000;

// Une table positionnee sur le plan : coordonnees NORMALISEES 0..1 (decision 1).
// On serialise NOTRE modele, jamais le Stage Konva.
// Depuis le LOT A, la vue service rend aussi la geometrie du plan edite :
// taille (w/h, fractions du PETIT COTE du conteneur), forme et rotation.
export interface PlacedTable {
  table: FloorTable;
  // Centre de la table, normalise dans le conteneur (0..1).
  x: number;
  y: number;
  // Dimensions normalisees sur le petit cote (echelle unique, cf. tableSizePx).
  w: number;
  h: number;
  shape: TableShape;
  rotation: number;
}

// Etat complet d'une table pour le rendu (position + statut + resa courante).
export interface FloorTableView extends PlacedTable {
  status: FloorTableStatus;
  // Reservation a afficher au clic (la plus pertinente, cf. derivation).
  reservation: Reservation | null;
  // Table LIBRE avec une resa plus tard aujourd'hui : heure courte de la prochaine
  // (« 21:00 ») pour l'info de decision de l'hote. null sinon.
  nextTime: string | null;
  // ISO de cette prochaine resa (garde-fou temporel du walk-in). null sinon.
  nextDateTime: string | null;
  // Table RESERVEE dont l'heure est depassee de plus de LATE_THRESHOLD_MIN sans
  // installation : minutes de retard (arrondies). null sinon.
  lateMinutes: number | null;
}

export interface DerivedTableStatus {
  status: FloorTableStatus;
  reservation: Reservation | null;
  nextTime: string | null;
  nextDateTime: string | null;
  lateMinutes: number | null;
}

// Derive le statut d'une table a partir des reservations du jour qui lui sont
// reliees ET de l'heure courante (`now` en parametre = tests deterministes ;
// en prod, capture dans le computed de hk-floor-plan, rafraichi par le polling).
// Regle temporelle (session 10x n°2) :
//  1. une resa `seated` -> Installee (et c'est la resa a afficher) ;
//  2. sinon une resa `confirmed`/`pending` ACTIVE, c.-a-d.
//     now ∈ [dateTime − 45 min, dateTime + 120 min] -> Reservee (afficher la plus
//     proche de now) ; si now > dateTime + 15 min -> lateMinutes (alerte retard) ;
//  3. sinon s'il existe une resa PLUS TARD (dateTime − 45 min > now) -> Libre avec
//     nextTime (heure de la plus proche) ;
//  4. sinon -> Libre simple. Une resa depassee de +120 min sans installation rend
//     la table libre (la resa reste en liste, au staff de l'annuler) ;
//     completed/cancelled/no_show = non actif -> Libre.
//
// `projected` (mode SIMULATION) : en live, une table seated reste installee tant
// que le staff n'a pas termine le service (regle 1, sans horloge). En projection
// du futur, on l'estime liberee apres la duree de service (+120 min) — sinon la
// simulation mentirait (« occupee pour toujours »).
export function deriveTableStatus(
  tableId: string,
  reservations: readonly Reservation[],
  now: Date,
  projected = false,
): DerivedTableStatus {
  const linked = reservations.filter((r) => r.table?.id === tableId);
  const none = { nextTime: null, nextDateTime: null, lateMinutes: null };
  const nowProjectedMs = now.getTime();

  const seated = linked.find((r) => r.status === 'seated');
  if (seated) {
    const stillThere =
      !projected ||
      nowProjectedMs <= new Date(seated.dateTime).getTime() + ACTIVE_AFTER_MIN * MINUTE_MS;
    if (stillThere) {
      return { status: 'installee', reservation: seated, ...none };
    }
    // Projection au-dela du service estime : la table redevient disponible
    // (la suite de la derivation gere une eventuelle resa plus tard).
  }

  const upcoming = linked
    .filter((r) => r.status === 'confirmed' || r.status === 'pending')
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
  const nowMs = now.getTime();

  // Resas ACTIVES au moment courant : la plus proche de now est celle a afficher.
  const active = upcoming
    .filter((r) => {
      const t = new Date(r.dateTime).getTime();
      return (
        nowMs >= t - ACTIVE_BEFORE_MIN * MINUTE_MS && nowMs <= t + ACTIVE_AFTER_MIN * MINUTE_MS
      );
    })
    .sort(
      (a, b) =>
        Math.abs(new Date(a.dateTime).getTime() - nowMs) -
        Math.abs(new Date(b.dateTime).getTime() - nowMs),
    );
  if (active.length > 0) {
    const current = active[0];
    const elapsedMin = (nowMs - new Date(current.dateTime).getTime()) / MINUTE_MS;
    return {
      status: 'reservee',
      reservation: current,
      nextTime: null,
      nextDateTime: null,
      // RETARD : concept TEMPS REEL uniquement. En projection (simulation), on
      // suppose que le client arrivera a l'heure — signaler « +30 min » sur une
      // resa future serait un mensonge visuel.
      lateMinutes: !projected && elapsedMin > LATE_THRESHOLD_MIN ? Math.round(elapsedMin) : null,
    };
  }

  // Libre, mais reservee PLUS TARD : on expose l'heure de la prochaine resa.
  const later = upcoming.find(
    (r) => new Date(r.dateTime).getTime() - ACTIVE_BEFORE_MIN * MINUTE_MS > nowMs,
  );
  if (later) {
    return {
      status: 'libre',
      reservation: null,
      nextTime: formatTime(later.dateTime),
      nextDateTime: later.dateTime,
      lateMinutes: null,
    };
  }

  return { status: 'libre', reservation: null, ...none };
}

// PLAGE DE SIMULATION (« Simuler ma soiree ») : de 1 h avant la premiere
// reservation vivante du jour a 2 h apres la derniere, bornes arrondies a
// l'heure pleine. Sans reservation : soiree type 18:00 -> 23:00. Fonction PURE :
// c'est elle qui donne au slider temporel ses bornes.
export function simulationRange(
  reservations: readonly Reservation[],
  today = new Date(),
): { start: Date; end: Date } {
  const alive = reservations.filter((r) => r.status !== 'cancelled' && r.status !== 'no_show');
  const floorHour = (ms: number): Date => {
    const d = new Date(ms);
    d.setMinutes(0, 0, 0);
    return d;
  };
  const ceilHour = (ms: number): Date => {
    const d = new Date(ms);
    if (d.getMinutes() > 0 || d.getSeconds() > 0) {
      d.setHours(d.getHours() + 1);
    }
    d.setMinutes(0, 0, 0);
    return d;
  };

  if (alive.length === 0) {
    const start = new Date(today);
    start.setHours(18, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 0, 0, 0);
    return { start, end };
  }

  const times = alive.map((r) => new Date(r.dateTime).getTime());
  return {
    start: floorHour(Math.min(...times) - 60 * MINUTE_MS),
    end: ceilHour(Math.max(...times) + 120 * MINUTE_MS),
  };
}

// --- FUSION DE TABLES ------------------------------------------------------------
// Deux tables collees peuvent etre FUSIONNEES (groupe d'anniversaire, grande
// tablee) : le plan stocke des groupes d'ids (`merges`), et la vue service rend
// chaque groupe comme UNE tablee (bloc englobant, couverts sommes, statut
// dominant). Les reservations restent portees par les VRAIES tables : la vue
// fusionnee garde l'id de la premiere table (ancre) -> walk-in, affectation et
// drawer fonctionnent sans changement.

// Largeur du conteneur en unites « petit cote » (ratio 16:10 des canvas).
const ASPECT_W = 1.6;

// Deux geometries se touchent-elles ? Rects englobants en unites petit cote
// (la rotation est ignoree : suffisant pour des tables collees bord a bord).
export function tablesTouch(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  gap = 0.035,
): boolean {
  const dx = Math.abs(a.x * ASPECT_W - b.x * ASPECT_W) - (a.w + b.w) / 2;
  const dy = Math.abs(a.y - b.y) - (a.h + b.h) / 2;
  return dx <= gap && dy <= gap;
}

// Un groupe est fusionnable si chaque table touche au moins une autre du groupe
// (chaine de tables collees, pas forcement toutes mutuellement en contact).
export function canMerge(
  entries: readonly { x: number; y: number; w: number; h: number }[],
): boolean {
  if (entries.length < 2) {
    return false;
  }
  return entries.every((a, i) => entries.some((b, j) => i !== j && tablesTouch(a, b)));
}

// Ordre de dominance d'un statut pour la vue fusionnee (le plus « occupe » gagne).
const STATUS_RANK: Record<FloorTableStatus, number> = { libre: 0, reservee: 1, installee: 2 };

// Remplace les vues des tables fusionnees par UNE vue de tablee par groupe.
export function mergeViews(
  views: readonly FloorTableView[],
  merges: readonly (readonly string[])[],
): FloorTableView[] {
  if (merges.length === 0) {
    return [...views];
  }
  const byId = new Map(views.map((v) => [v.table.id, v]));
  const consumed = new Set<string>();
  const blocks: FloorTableView[] = [];

  for (const group of merges) {
    const members = group
      .map((id) => byId.get(id))
      .filter((v): v is FloorTableView => v != null && !consumed.has(v.table.id));
    if (members.length < 2) {
      continue; // groupe incomplet (table supprimee) : on l'ignore.
    }
    members.forEach((m) => consumed.add(m.table.id));

    // Bloc englobant en unites petit cote, re-normalise ensuite.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const m of members) {
      minX = Math.min(minX, m.x * ASPECT_W - m.w / 2);
      maxX = Math.max(maxX, m.x * ASPECT_W + m.w / 2);
      minY = Math.min(minY, m.y - m.h / 2);
      maxY = Math.max(maxY, m.y + m.h / 2);
    }

    // Vue dominante : la plus occupee (retard prioritaire a rang egal).
    const dominant = [...members].sort(
      (a, b) =>
        STATUS_RANK[b.status] - STATUS_RANK[a.status] ||
        (b.lateMinutes ?? -1) - (a.lateMinutes ?? -1),
    )[0];
    const anchor = members[0];

    // Prochaine resa de la TABLEE = la plus proche parmi TOUS les membres (le
    // garde-fou walk-in doit voir la resa d'un membre non dominant).
    const next = members
      .filter((m) => m.nextDateTime !== null)
      .sort((a, b) => (a.nextDateTime as string).localeCompare(b.nextDateTime as string))[0];

    blocks.push({
      ...dominant,
      nextTime: next?.nextTime ?? null,
      nextDateTime: next?.nextDateTime ?? null,
      // L'ANCRE porte l'identite : les actions (walk-in, affectation) ciblent
      // une vraie table back, la capacite affichee est la somme du groupe.
      table: {
        ...anchor.table,
        name: members.map((m) => m.table.name).join('+'),
        capacity: members.reduce((sum, m) => sum + m.table.capacity, 0),
      },
      x: (minX + maxX) / 2 / ASPECT_W,
      y: (minY + maxY) / 2,
      w: maxX - minX,
      h: maxY - minY,
      shape: 'rect',
      rotation: 0,
    });
  }

  return [...views.filter((v) => !consumed.has(v.table.id)), ...blocks];
}

// SYNTHESE DE SALLE (mode service) : agrege les statuts des tables pour le bandeau
// « poste d'accueil ». Fonction PURE (testable sans monter de composant) :
//  - libres/reservees/installees : nombre de tables par statut ;
//  - couverts : total des couverts effectivement EN SALLE (tables reservees +
//    installees qui portent une reservation) — la charge reelle du service.
export interface RoomSummary {
  libres: number;
  reservees: number;
  installees: number;
  couverts: number;
}

export function summarizeRoom(views: readonly FloorTableView[]): RoomSummary {
  let libres = 0;
  let reservees = 0;
  let installees = 0;
  let couverts = 0;
  for (const view of views) {
    if (view.status === 'libre') {
      libres += 1;
    } else if (view.status === 'reservee') {
      reservees += 1;
    } else {
      installees += 1;
    }
    if (view.reservation && view.status !== 'libre') {
      couverts += view.reservation.partySize;
    }
  }
  return { libres, reservees, installees, couverts };
}

// MEILLEUR FIT (LOT B2) : pendant l'affectation, la table recommandee est la table
// LIBRE de capacite MINIMALE suffisante (>= couverts). A egalite de capacite, la
// premiere rencontree. null si aucune table libre ne suffit.
// GARDE-FOU HORAIRE (optionnel) : avec `dateTime` (l'heure de la resa a placer),
// une table libre dont la PROCHAINE resa tombe a moins d'une duree de service
// (ACTIVE_AFTER_MIN) est ecartee — on ne cree pas de double-booking silencieux.
export function bestFitTableId(
  views: readonly FloorTableView[],
  partySize: number,
  dateTime?: string | null,
): string | null {
  let best: FloorTableView | null = null;
  for (const view of views) {
    if (view.status !== 'libre' || view.table.capacity < partySize) {
      continue;
    }
    if (dateTime && view.nextDateTime) {
      const gapMin = Math.abs(
        (new Date(dateTime).getTime() - new Date(view.nextDateTime).getTime()) / MINUTE_MS,
      );
      if (gapMin < ACTIVE_AFTER_MIN) {
        continue;
      }
    }
    if (!best || view.table.capacity < best.table.capacity) {
      best = view;
    }
  }
  return best?.table.id ?? null;
}

// PLACEMENT AUTO (« Tout placer ») : propose une table pour CHAQUE resa non placee,
// en glouton — les plus grandes tablees d'abord (les plus dures a caser), chaque
// table proposee au plus une fois. Fonction PURE : le composant emet ensuite les
// affectations reelles ; les resas sans solution restent simplement non placees.
export interface AutoPlacement {
  reservationId: string;
  tableId: string;
}

export function planAutoPlacements(
  views: readonly FloorTableView[],
  reservations: readonly Reservation[],
): AutoPlacement[] {
  const taken = new Set<string>();
  const placements: AutoPlacement[] = [];
  for (const r of [...reservations].sort((a, b) => b.partySize - a.partySize)) {
    const candidates = views.filter((v) => !taken.has(v.table.id));
    const tableId = bestFitTableId(candidates, r.partySize, r.dateTime);
    if (tableId) {
      taken.add(tableId);
      placements.push({ reservationId: r.id, tableId });
    }
  }
  return placements;
}

// SUGGESTION DE FUSION : quand AUCUNE table libre ne suffit, chercher un petit
// groupe (2 puis 3) de tables LIBRES et VOISINES (tablesTouch) dont la somme des
// couverts suffit — capacite totale minimale d'abord (on ne gaspille pas la
// salle). Les tables deja membres d'une tablee sont ecartees (leur bloc fusionne
// porte deja la capacite sommee). null si rien ne convient.
export function suggestMergeGroup(
  views: readonly FloorTableView[],
  partySize: number,
  merges: readonly (readonly string[])[] = [],
): FloorTableView[] | null {
  const mergedIds = new Set(merges.flat());
  const free = views.filter((v) => v.status === 'libre' && !mergedIds.has(v.table.id));

  const touching = (a: FloorTableView, b: FloorTableView): boolean =>
    tablesTouch({ x: a.x, y: a.y, w: a.w, h: a.h }, { x: b.x, y: b.y, w: b.w, h: b.h });
  const capacity = (group: readonly FloorTableView[]): number =>
    group.reduce((sum, v) => sum + v.table.capacity, 0);

  let best: FloorTableView[] | null = null;
  const consider = (group: FloorTableView[]): void => {
    if (capacity(group) >= partySize && (!best || capacity(group) < capacity(best))) {
      best = group;
    }
  };

  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (touching(free[i], free[j])) {
        consider([free[i], free[j]]);
      }
    }
  }
  if (best) {
    return best;
  }
  // Pas de paire suffisante : chaines de 3 (le tiers touche l'un des deux).
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (!touching(free[i], free[j])) {
        continue;
      }
      for (let k = 0; k < free.length; k++) {
        if (k !== i && k !== j && (touching(free[k], free[i]) || touching(free[k], free[j]))) {
          consider([free[i], free[j], free[k]]);
        }
      }
    }
  }
  return best;
}

// HEURE SUR LA TABLE (LOT B5) : une table Reservee ou Installee affiche l'heure de
// SA reservation (petit texte sous la capacite). Choix sobre : la meme heure courte
// pour les deux statuts (pas de prefixe « depuis » — la couleur porte deja le statut).
// ALERTE RETARD : une table Reservee en retard complete l'heure avec « · +25 min »
// (la pastille passe en couleur danger cote canvas).
export function tableTimeLabel(
  view: Pick<FloorTableView, 'status' | 'reservation' | 'lateMinutes'>,
): string {
  if (!view.reservation || view.status === 'libre') {
    return '';
  }
  const time = formatTime(view.reservation.dateTime);
  if (view.status === 'reservee' && view.lateMinutes !== null) {
    return `${time} · +${view.lateMinutes} min`;
  }
  return time;
}

// Place les tables en grille automatique, en coordonnees normalisees 0..1.
// Repli quand aucune geometrie n'a ete editee : position auto-grille + forme et
// taille derivees de la capacite. La conversion en pixels se fait au rendu.
export function autoGridLayout(tables: readonly FloorTable[]): PlacedTable[] {
  const count = tables.length;
  return tables.map((table, i) => {
    const geo = defaultGeometryFor(table.capacity, gridPosition(i, count));
    return { table, x: geo.x, y: geo.y, w: geo.w, h: geo.h, shape: geo.shape, rotation: 0 };
  });
}

// BRIDGE editeur -> vue service (LOT A) : place les tables reelles en utilisant la
// geometrie SAUVEGARDEE du plan quand elle existe (position + taille + forme +
// rotation), et le repli auto-grille sinon. Les ids etant ceux du back, la
// derivation de statut (deriveTableStatus) matche directement.
export function layoutTables(tables: readonly FloorTable[], geometry: GeometryMap): PlacedTable[] {
  const fallback = autoGridLayout(tables);
  return fallback.map((placed) => {
    const geo = geometry[placed.table.id];
    if (!geo) {
      return placed;
    }
    return {
      table: placed.table,
      x: geo.x,
      y: geo.y,
      w: geo.w,
      h: geo.h,
      shape: geo.shape,
      rotation: geo.rotation,
    };
  });
}

// BRIDGE tables reelles -> editeur : construit les tables vues par le canvas de
// l'editeur (label/couverts = table back ; geometrie = plan si presente, repli
// auto-grille sinon).
export function buildEditorTables(
  tables: readonly FloorTable[],
  geometry: GeometryMap,
): EditorTable[] {
  return layoutTables(tables, geometry).map((p) => ({
    id: p.table.id,
    label: p.table.name,
    shape: p.shape,
    x: p.x,
    y: p.y,
    width: p.w,
    height: p.h,
    rotation: p.rotation,
    seats: p.table.capacity,
  }));
}
