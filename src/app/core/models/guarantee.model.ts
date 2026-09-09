// Réservations payantes : ce que le restaurateur règle, et ce que le convive voit.
// Tous les montants sont en centimes, comme côté backend.

export type GuaranteeMode = 'none' | 'booking_fee' | 'no_show';

export type GuaranteeStatus =
  | 'not_required'
  | 'awaiting'
  | 'secured'
  | 'exempted'
  | 'expired'
  | 'refunded'
  | 'charged'
  | 'charge_failed';

export interface GuaranteeSettings {
  mode: GuaranteeMode;
  bookingFeeCentsPerGuest: number | null;
  noShowPenaltyCentsPerGuest: number | null;
  refundWindowHours: number | null;
}

// État du compte Stripe du restaurateur. Sans `chargesEnabled`, aucun mode payant
// n'est activable : le convive tomberait sur une page de paiement en échec.
export interface ConnectAccount {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  // Litiges bancaires, absorbés par Alloquence mais suivis par organisation.
  disputeCount: number;
  paidReservationCount: number;
}

export interface ConnectOnboarding {
  url: string;
}

export type PayoutStatus = 'pending' | 'paid' | 'failed';

export interface Payout {
  id: string;
  // Net de la commission Alloquence : ce que le restaurateur reçoit vraiment.
  amountCents: number;
  currency: string;
  reservationCount: number;
  status: PayoutStatus;
  failureMessage: string | null;
  createdAt: string;
}

// Ce qu'un convive sans compte voit derrière son lien. Volontairement étroit :
// aucun identifiant, rien sur les autres réservations du restaurant.
export interface PublicReservation {
  restaurantName: string;
  startsAt: string;
  partySize: number;
  guaranteeMode: GuaranteeMode;
  guaranteeStatus: GuaranteeStatus;
  status: string;
  amountCents: number | null;
  currency: string;
  refundWindowHours: number | null;
  expiresAt: string | null;
}

export interface PaymentRedirect {
  url: string;
}

export interface Cancellation {
  cancelled: boolean;
  refunded: boolean;
  refundedAmountCents: number | null;
}

export function formatCents(amountCents: number, currency = 'eur'): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}
