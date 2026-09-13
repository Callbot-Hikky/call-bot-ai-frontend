import { expect, test } from '@playwright/test';
import { login } from './helpers';

const API = process.env['E2E_API_URL'] ?? 'http://localhost:8080/api';

// Parcours de bout en bout, tout par l'interface : inscription, onboarding, premiere
// reservation, page client, reconnexion. C'est le filet contre les regressions qui
// touchent les pages hors menu (coquilles, defilement, session).
test.describe('Parcours restaurateur : du compte neuf a la premiere reservation', () => {
  test('inscription, onboarding, reservation, page client, reconnexion', async ({
    page,
    request,
  }) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const owner = { email: `e2e-parcours-${stamp}@example.com`, password: 'password123' };
    const phone = `+331${stamp.replace(/\D/g, '').slice(-8).padStart(8, '0')}`;

    // 1. Inscription.
    await page.goto('/register');
    await page.getByRole('textbox', { name: /e-mail/i }).fill(owner.email);
    await page.getByRole('textbox', { name: /mot de passe/i }).fill(owner.password);
    await page.getByRole('button', { name: /créer mon compte/i }).click();

    // L'inscription mene a l'offre (paiement Stripe), impossible a jouer ici : on passe
    // directement a l'onboarding, qui ne demande qu'une session.
    await page.waitForURL(/\/offre/);
    await page.goto('/onboarding');

    // 2. Onboarding, etape 1 : le restaurant.
    await expect(page.getByRole('heading', { name: 'Votre restaurant' })).toBeVisible();
    await page.locator('input[name="name"]').fill(`Chez Parcours ${stamp.slice(-5)}`);
    await page.locator('input[name="phone"]').fill(phone);
    await page.getByRole('button', { name: 'Continuer' }).click();

    // Etape 2 : les horaires depassent l'ecran, la page doit pouvoir defiler jusqu'au bouton.
    await expect(page.getByRole('heading', { name: "Horaires d'ouverture" })).toBeVisible();
    await page.mouse.wheel(0, 4000);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Continuer' }).click();

    // Etapes 3 et 4.
    await expect(page.getByRole('heading', { name: 'Votre établissement' })).toBeVisible();
    await page.getByRole('button', { name: 'Passer' }).click();
    await expect(page.getByRole('heading', { name: 'Vos tables' })).toBeVisible();
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();
    await page.waitForURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();

    // 3. Premiere reservation depuis la liste du jour.
    await page.goto('/reservations');
    await page.getByTestId('open-new-resa').click();
    await page.getByTestId('new-resa-name').fill('Nadia Parcours');
    await page.getByTestId('new-resa-phone').fill('+33612345699');
    // Le formulaire ne prend que « aujourd'hui » et refuse une heure passée : on vise dans une heure,
    // et 23:59 si l'heure suivante est déjà demain. Le test tient à toute heure de la journée.
    const inOneHour = new Date(Date.now() + 3_600_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const time =
      inOneHour.getDate() === new Date().getDate()
        ? `${pad(inOneHour.getHours())}:${pad(inOneHour.getMinutes())}`
        : '23:59';
    await page.getByTestId('new-resa-time').fill(time);
    // La reponse est lue au passage (route) : le corps n'est plus garanti une fois la page passee a autre chose.
    let reservation: { id: string; restaurantId: string } | null = null;
    await page.route('**/api/reservations', async (route) => {
      const res = await route.fetch();
      if (route.request().method() === 'POST') {
        reservation = (await res.json()) as { id: string; restaurantId: string };
      }
      await route.fulfill({ response: res });
    });
    await page.getByRole('button', { name: 'Créer la réservation' }).click();
    await expect.poll(() => reservation).not.toBeNull();
    await page.unroute('**/api/reservations');
    const { id, restaurantId } = reservation!;
    await expect(page.getByText('Nadia Parcours').first()).toBeVisible();

    // 4. Page client : le lien du message porte un jeton public, pas l'identifiant interne.
    // On cree donc une reservation par la route publique, comme le ferait un client.
    const slots = (await (
      await request.get(`${API}/public/restaurants/${restaurantId}/slots?partySize=2`)
    ).json()) as { days: { slots: { startsAt: string }[] }[] };
    // Les horaires saisis a l'onboarding peuvent fermer demain : premier creneau ouvert, quel que soit le jour.
    const firstSlot = slots.days.flatMap((d) => d.slots)[0];
    expect(firstSlot).toBeTruthy();
    const created = await request.post(`${API}/public/restaurants/${restaurantId}/reservations`, {
      data: {
        startsAt: firstSlot.startsAt,
        partySize: 2,
        customer: { firstName: 'Client Parcours', phone: '06 11 22 33 44' },
      },
    });
    expect(created.status()).toBe(201);
    const publicToken = (await created.json()).id as string;
    expect(publicToken).not.toBe(id);
    await page.goto(`/client/reservations/${publicToken}/reschedule`);
    await expect(page.getByText('Récapitulatif de votre réservation')).toBeVisible();
    await page.getByTestId('link-menu').click();
    await page.waitForURL(/\/client\/restaurants\/.+\/menu/);
    await expect(page.getByText(/arrive bientôt/)).toBeVisible();

    // 5. Deconnexion puis reconnexion.
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /se déconnecter/i }).click();
    await page.waitForURL(/\/login/);
    await login(page, {
      ...owner,
      token: '',
      restaurantId,
      restaurantName: '',
    });
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  });
});
