export type ReservationStatus =
  | 'pending'
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

export interface RestaurantSummary {
  id: string;
  name: string;
}

export interface Reservation {
  id: string;
  customerId?: string;
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
  // Origine de la réservation (utile pour valoriser le bot)
  source?: 'callbot' | 'manual' | 'web';
  restaurant?: RestaurantSummary;
}

// Créneaux libres pour reprogrammer une réservation, sur 7 jours glissants.
// Miroir exact de RescheduleSlotsResponse côté back.
export interface RescheduleSlot {
  startsAt: string;
  endsAt: string;
  tableId: string;
  capacity: number;
}

export interface RescheduleDay {
  date: string; // YYYY-MM-DD
  slots: RescheduleSlot[];
}

export interface RescheduleSlotsResponse {
  days: RescheduleDay[];
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
