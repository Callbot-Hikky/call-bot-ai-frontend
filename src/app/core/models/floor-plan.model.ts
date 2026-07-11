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
export function deriveTableStatus(
  tableId: string,
  reservations: readonly Reservation[],
  now: Date,
): DerivedTableStatus {
  const linked = reservations.filter((r) => r.table?.id === tableId);
  const none = { nextTime: null, nextDateTime: null, lateMinutes: null };

  const seated = linked.find((r) => r.status === 'seated');
  if (seated) {
    return { status: 'installee', reservation: seated, ...none };
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
      lateMinutes: elapsedMin > LATE_THRESHOLD_MIN ? Math.round(elapsedMin) : null,
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
export function bestFitTableId(views: readonly FloorTableView[], partySize: number): string | null {
  let best: FloorTableView | null = null;
  for (const view of views) {
    if (view.status !== 'libre' || view.table.capacity < partySize) {
      continue;
    }
    if (!best || view.table.capacity < best.table.capacity) {
      best = view;
    }
  }
  return best?.table.id ?? null;
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
