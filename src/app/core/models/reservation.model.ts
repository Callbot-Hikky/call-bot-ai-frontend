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
