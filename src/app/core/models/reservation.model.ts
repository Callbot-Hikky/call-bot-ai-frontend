import type { GuaranteeMode, GuaranteeStatus } from './guarantee.model';

export type ReservationStatus =
  | 'pending'
  // Table pré-tenue le temps que le convive règle sa garantie (30 min).
  | 'awaiting_payment'
  | 'confirmed'
  | 'seated'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface RestaurantTable {
  id: string;
  name: string;
  capacity: number;
}

export interface Reservation {
  id: string;
  customerName: string;
  // Affiché en police mono dans l'interface
  phone: string;
  // Date et heure au format ISO 8601
  dateTime: string;
  // Nombre de couverts
  partySize: number;
  table?: RestaurantTable;
  status: ReservationStatus;
  notes?: string;
  // Garantie demandée à ce convive, figée à la création de la réservation.
  guaranteeMode?: GuaranteeMode;
  guaranteeStatus?: GuaranteeStatus;
  // Montant en centimes, affiché dans le détail de la réservation.
  guaranteeAmountCents?: number;
  // Origine de la réservation (utile pour valoriser le bot)
  source?: 'callbot' | 'manual' | 'web';
}

// LIVE (LOT B3) : diff par id apres un refresh silencieux. Retourne les
// reservations presentes dans `after` mais absentes de `beforeIds` (les nouvelles
// arrivees, a annoncer par toast + pulse).
export function newReservations(
  beforeIds: ReadonlySet<string>,
  after: readonly Reservation[],
): Reservation[] {
  return after.filter((r) => !beforeIds.has(r.id));
}
