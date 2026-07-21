import { HttpErrorResponse } from '@angular/common/http';

// Le back renvoie un CODE machine dans le champ `error` d'un 409 (voir
// GlobalExceptionHandler). On le traduit en message metier francais precis ;
// sinon on garde le message par defaut fourni par l'appelant.
const CONFLICT_MESSAGES: Record<string, string> = {
  table_overlap: 'Cette table est déjà réservée sur ce créneau.',
  duplicate_phone: 'Un client existe déjà avec ce numéro.',
};

export function conflictMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse && err.status === 409) {
    const code = (err.error as { error?: string } | null)?.error;
    if (code && CONFLICT_MESSAGES[code]) {
      return CONFLICT_MESSAGES[code];
    }
  }
  return fallback;
}
