/**
 * Les adresses de redirection renvoyees par le backend (paiement Stripe, inscription
 * Connect) servent telles quelles a deplacer le navigateur. Non verifiees, ce sont
 * des redirections ouvertes : une reponse alteree portant un `javascript:` ferait
 * executer du code dans la page, un `http:` enverrait l'utilisateur en clair.
 *
 * <p>Seule une adresse absolue en https passe. Le domaine n'est volontairement PAS
 * fige : Stripe accepte des domaines personnalises, et les brider casserait un
 * paiement legitime le jour ou le compte en active un.
 */
export function assertHttpsUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(UNSAFE_REDIRECT);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(UNSAFE_REDIRECT);
  }
  return url;
}

export const UNSAFE_REDIRECT = 'Adresse de paiement invalide.';
