// Demande de rappel générée quand l'agent vocal n'a pas pu conclure (US 1.7).
// Le staff la traite comme une tâche urgente depuis l'écran des réservations.

export type CallbackStatus = 'pending' | 'handled';

export interface CallbackRequest {
  id: string;
  customerName: string;
  phone: string;
  /** Date/heure de la demande, au format ISO 8601. */
  requestedAt: string;
  /** Motif du rappel (contexte laissé par l'agent vocal). */
  reason: string;
  status: CallbackStatus;
}
