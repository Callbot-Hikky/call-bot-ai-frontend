import { assertHttpsUrl } from './redirect';

/**
 * Le garde-fou des redirections renvoyees par le backend. Il protege quatre
 * endroits : le paiement d'une reservation, le complement de couverts, l'achat de
 * l'offre et l'inscription Stripe Connect.
 */
describe('assertHttpsUrl', () => {
  it('laisse passer une adresse Stripe', () => {
    const url = 'https://checkout.stripe.com/c/pay/cs_test_1';
    expect(assertHttpsUrl(url)).toBe(url);
  });

  // Le domaine n'est pas fige : Stripe accepte des domaines personnalises, et les
  // brider casserait un paiement legitime.
  it('laisse passer un domaine personnalise en https', () => {
    const url = 'https://paiement.mon-restaurant.fr/session';
    expect(assertHttpsUrl(url)).toBe(url);
  });

  it.each([
    ['javascript:alert(document.cookie)', 'un schema executable'],
    ['data:text/html,<script>alert(1)</script>', 'une page embarquee'],
    ['http://checkout.stripe.com/c', 'du trafic en clair'],
    ['//checkout.stripe.com/c', 'une adresse sans schema'],
    ['/paiement/local', 'un chemin relatif'],
    ['', 'une adresse vide'],
    ['pas une url', 'une chaine quelconque'],
  ])('refuse %s (%s)', (url) => {
    expect(() => assertHttpsUrl(url)).toThrow('Adresse de paiement invalide.');
  });
});
