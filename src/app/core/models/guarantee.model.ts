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
  // Heures avant le service au-delà desquelles le convive ne peut plus rien changer
  // lui-même. Zéro signifie « jusqu'au service », jamais « jamais ». Indépendante de
  // la fenêtre de remboursement : rendre de l'argent et changer une tablée n'engagent
  // pas la salle de la même façon.
  modificationWindowHours: number | null;
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

// Ce que le convive voit derriere un lien de complement. Les deux nombres de
// couverts y figurent : il achete la difference, une page qui n'afficherait que
// le plus grand laisserait croire que la hausse est deja faite.
export interface PublicTopUp {
  restaurantName: string;
  startsAt: string;
  currentPartySize: number;
  targetPartySize: number;
  amountCents: number;
  currency: string;
  // `pending` tant que le delai court, `closed` une fois passe.
  status: 'pending' | 'closed';
  expiresAt: string | null;
}

// Complement en attente sur une reservation, vu du tableau de bord.
export interface PendingTopUp {
  targetPartySize: number;
  amountCents: number;
  currency: string;
  expiresAt: string | null;
}

export interface PaymentRedirect {
  url: string;
}

// Ce que le convive voit derrière son lien de modification. `centsPerGuest` y figure
// pour que la page annonce ce qu'un couvert coûte — ou rend — AVANT le clic : un
// remboursement découvert après coup se lit aussi mal qu'un remboursement absent.
// Tout sauf `restaurantName`, `status` et `open` est nul quand le lien a survécu à sa
// réservation — annulée, ou service passé. Le lien résout encore, mais il ne livre plus
// que de quoi appeler le restaurant.
export interface PublicModification {
  restaurantName: string;
  startsAt: string | null;
  partySize: number | null;
  guaranteeMode: GuaranteeMode | null;
  guaranteeStatus: GuaranteeStatus | null;
  status: string;
  centsPerGuest: number | null;
  currency: string | null;
  // `false` passé l'échéance fixée par le restaurateur : la page le dit plutôt que
  // d'échouer, sinon le convive croirait sa réservation disparue.
  open: boolean;
  closesAt: string | null;
}

// Un créneau libre : l'heure, et la table qui pourrait le tenir.
export interface RescheduleSlot {
  startsAt: string;
  endsAt: string;
  tableId: string;
  capacity: number;
}

export interface RescheduleDay {
  date: string;
  slots: RescheduleSlot[];
}

export interface RescheduleSlots {
  days: RescheduleDay[];
}

// Ce qu'est devenue la réservation, qui n'est pas toujours ce qui a été demandé : une
// hausse qui doit de l'argent laisse la tablée où elle était et renseigne `pendingTopUp`.
export interface GuestModification {
  startsAt: string;
  partySize: number;
  refundedAmountCents: number;
  pendingTopUp: PendingTopUp | null;
  // Le lien qui règle ce complément. Porté par l'encaissement, pas par la réservation,
  // et à usage unique : le tableau de bord ne le voit jamais.
  topUpPaymentToken: string | null;
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
