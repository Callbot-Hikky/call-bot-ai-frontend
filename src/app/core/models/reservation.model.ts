import type { GuaranteeMode, GuaranteeStatus, PendingTopUp } from './guarantee.model';

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
  // Garantie demandée à ce convive, figée à la création de la réservation.
  guaranteeMode?: GuaranteeMode;
  guaranteeStatus?: GuaranteeStatus;
  // Montant en centimes, affiché dans le détail de la réservation.
  guaranteeAmountCents?: number;
  // Hausse de couverts demandee mais pas encore reglee. Tant qu'elle est la,
  // `partySize` est l'ancien nombre : rien n'a bouge, et rien n'est tenu.
  pendingTopUp?: PendingTopUp;
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

// Reservation en ligne : plafond de couverts aligne sur le back (BookingPolicy.MAX_PARTY_SIZE).
export const BOOKING_MAX_PARTY_SIZE = 15;

// Ce qu'un client voit de sa propre reservation, sans session : rien qu'il n'ait saisi lui-meme.
export interface PublicReservation {
  id: string;
  restaurantId: string;
  restaurantName: string;
  dateTime: string;
  endsAt: string;
  partySize: number;
  status: ReservationStatus;
  customerFirstName: string;
}

export interface PublicReservationInput {
  startsAt: string;
  partySize: number;
  customer: { firstName: string; phone: string };
  notes?: string;
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
