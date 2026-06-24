// Helpers de formatage partagés, pour éviter la duplication dans les composants.

/** Heure courte au format fr-FR, ex. « 18:30 ». */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** URI d'appel téléphonique normalisé (sans espaces, RFC 3966). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/\s/g, '')}`;
}
