import { Reservation } from './reservation.model';
import { FloorTable } from './table.model';

// V1 : 3 statuts seulement, 100 % derives des reservations (doc 05 correctif 2).
//  - libre    : aucune reservation active sur la table
//  - reservee : une reservation confirmed/pending sur la table aujourd'hui
//  - installee: une reservation seated sur la table aujourd'hui
export type FloorTableStatus = 'libre' | 'reservee' | 'installee';

// Une table positionnee sur le plan : coordonnees NORMALISEES 0..1 (decision 1).
// On serialise NOTRE modele, jamais le Stage Konva.
export interface PlacedTable {
  table: FloorTable;
  // Centre de la table, normalise dans le conteneur (0..1).
  x: number;
  y: number;
}

// Etat complet d'une table pour le rendu (position + statut + resa courante).
export interface FloorTableView extends PlacedTable {
  status: FloorTableStatus;
  // Reservation a afficher au clic (la plus pertinente, cf. derivation).
  reservation: Reservation | null;
}

// Derive le statut d'une table a partir des reservations du jour qui lui sont reliees.
// Regle (doc 05 correctifs 2 et 5) :
//  1. une resa `seated` -> Installee (et c'est la resa a afficher) ;
//  2. sinon une resa `confirmed`/`pending` -> Reservee (afficher la plus proche a venir) ;
//  3. sinon -> Libre. (completed/cancelled/no_show = non actif -> Libre.)
export function deriveTableStatus(
  tableId: string,
  reservations: readonly Reservation[],
): { status: FloorTableStatus; reservation: Reservation | null } {
  const linked = reservations.filter((r) => r.table?.id === tableId);

  const seated = linked.find((r) => r.status === 'seated');
  if (seated) {
    return { status: 'installee', reservation: seated };
  }

  const upcoming = linked
    .filter((r) => r.status === 'confirmed' || r.status === 'pending')
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
  if (upcoming.length > 0) {
    return { status: 'reservee', reservation: upcoming[0] };
  }

  return { status: 'libre', reservation: null };
}

// Place les tables en grille automatique, en coordonnees normalisees 0..1.
// Le back ne fournit pas de position : on en calcule une, stable et lisible.
// La conversion en pixels (et le recalcul au resize) se fait au moment du rendu.
export function autoGridLayout(tables: readonly FloorTable[]): PlacedTable[] {
  const count = tables.length;
  if (count === 0) {
    return [];
  }
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  // Marges normalisees pour ne pas coller les bords.
  const marginX = 0.5 / cols;
  const marginY = 0.5 / rows;
  const stepX = cols > 1 ? (1 - 2 * marginX) / (cols - 1) : 0;
  const stepY = rows > 1 ? (1 - 2 * marginY) / (rows - 1) : 0;

  return tables.map((table, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      table,
      x: cols > 1 ? marginX + col * stepX : 0.5,
      y: rows > 1 ? marginY + row * stepY : 0.5,
    };
  });
}
