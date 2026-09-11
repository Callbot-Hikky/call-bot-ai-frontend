/**
 * Les formats partagés par les pages du parcours convive.
 *
 * <p>Extraits le jour où `formatDateTime` en était à sa quatrième copie identique. Quatre
 * pages qui affichent la même réservation doivent l'écrire de la même façon ; quatre
 * copies finissent par diverger sur une majuscule ou un fuseau.
 */

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

const DAY = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const TIME = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

/**
 * Une date seule, sans heure.
 *
 * <p>Midi est ajouté volontairement : une date nue est lue en UTC, et « 2030-07-01 »
 * afficherait la veille dans tout fuseau à l'ouest de Greenwich.
 */
export function formatDay(isoDate: string): string {
  return DAY.format(new Date(`${isoDate}T12:00:00`));
}

export function formatTime(iso: string): string {
  return TIME.format(new Date(iso));
}
