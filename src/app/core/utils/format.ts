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

/**
 * ISO 8601 local AVEC décalage de fuseau, ex. « 2026-07-06T19:30:00+02:00 ».
 * À privilégier pour envoyer une heure « maintenant » au back (un toISOString()
 * UTC décalerait l'heure affichée par rapport à la salle).
 */
export function localIso(d: Date = new Date()): string {
  const pad = (n: number): string => String(Math.trunc(Math.abs(n))).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const offset = `${sign}${pad(offsetMin / 60)}:${pad(offsetMin % 60)}`;
  return `${localDateKey(d)}T${time}${offset}`;
}

/**
 * Fonction qui permet de retourné un pays en emoji
 */
export function isoToEmoji(code: string): string {
  return code
    .split('')
    .map((letter) => (letter.charCodeAt(0) % 32) + 0x1f1e5)
    .map((n) => String.fromCodePoint(n))
    .join('');
}

// Taille lisible : « 3 Mo », « 2.5 Mo », « 120 Ko », « 512 octets ».
export function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes)) return 'illimité';
  const mib = 1024 * 1024;
  if (bytes >= mib) {
    const mo = bytes / mib;
    return `${Number.isInteger(mo) ? mo : mo.toFixed(1)} Mo`;
  }
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${bytes} octets`;
}
