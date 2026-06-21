export type ReservationStatus = 'confirmed' | 'pending' | 'cancelled';

export interface Reservation {
  id: string;
  customerName: string;
  phoneNumber: string;
  partySize: number;
  // Date et heure au format ISO 8601
  dateTime: string;
  status: ReservationStatus;
}
