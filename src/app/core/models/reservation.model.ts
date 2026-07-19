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

// RETARD d'une reservation attendue : minutes ecoulees depuis l'heure prevue
// quand les clients ne sont toujours pas installes (au-dela du seuil de
// tolerance). null sinon. Meme seuil que le plan (pastille rouge) : la LISTE
// doit montrer la meme urgence que la salle.
const LATE_TOLERANCE_MIN = 15;

export function reservationLateMinutes(reservation: Reservation, now: Date): number | null {
  if (reservation.status !== 'pending' && reservation.status !== 'confirmed') {
    return null;
  }
  const elapsedMin = (now.getTime() - new Date(reservation.dateTime).getTime()) / 60_000;
  return elapsedMin > LATE_TOLERANCE_MIN ? Math.round(elapsedMin) : null;
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
