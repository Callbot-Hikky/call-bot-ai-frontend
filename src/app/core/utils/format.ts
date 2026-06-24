// Helpers de formatage partagés, pour éviter la duplication dans les composants.

/** Heure courte au format fr-FR, ex. « 18:30 ». */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** URI d'appel téléphonique normalisé (sans espaces, RFC 3966). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/\s/g, '')}`;
}

/**
 * Jour au format YYYY-MM-DD en heure LOCALE (cohérent avec l'affichage des heures
 * et de la date du jour). À privilégier pour comparer des jours, vs un slice ISO
 * qui raisonne en UTC et décale autour de minuit.
 */
export function localDateKey(d: Date = new Date()): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}
