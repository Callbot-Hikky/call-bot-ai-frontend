export interface Offer {
  code: string;
  label: string;
  // Montant en centimes (9900 = 99,00 €) pour éviter les erreurs d'arrondi.
  amountCents: number;
  currency: string;
  interval: string;
}

export interface CheckoutSession {
  sessionId: string;
  checkoutUrl: string;
}

export interface CheckoutSummary {
  offerCode: string;
  amountCents: number;
  currency: string;
  status: string;
}
