import { FloorTable } from '@core/models/table.model';

// Evenements du plan de salle, partages entre hk-floor-plan, hk-table-card et
// les pages (fichier dedie : evite un cycle d'imports plan <-> carte).

export interface AssignEvent {
  reservationId: string;
  table: FloorTable;
}

// FUSION GUIDEE : « aucune table assez grande » -> le plan propose de fusionner
// des tables voisines ET d'y placer la reservation en un clic.
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
