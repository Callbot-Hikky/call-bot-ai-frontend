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
  // Origine de la réservation (utile pour valoriser le bot)
  source?: 'callbot' | 'manual' | 'web';
}

// Payload émis à la soumission du drawer de création. Forme proche de
// ReservationRequest côté backend, mais l'agrégation date+heure+durée →
// startsAt/endsAt est faite par le drawer pour éviter au parent de refaire le travail.
export interface NewReservationPayload {
  customerName: string;
  phone: string;
  date: string; // 'YYYY-MM-DD'
  startTime: string; // 'HH:mm'
  durationMinutes: number;
  partySize: number;
  tableId: string | null;
  notes: string;
  startsAt: string;
  endsAt: string;
}
