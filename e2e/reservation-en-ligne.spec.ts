import { APIRequestContext, Locator, Page, expect, test } from '@playwright/test';
import { Owner, createOwner, login } from './helpers';

const API = process.env['E2E_API_URL'] ?? 'http://localhost:8080/api';

// Un restaurant avec une seule table de 4 : les creneaux existent, et le second client sur le
// meme creneau doit etre refuse.
async function ownerWithOneTable(request: APIRequestContext, label: string): Promise<Owner> {
  const owner = await createOwner(request, label);
  const table = await request.post(`${API}/tables`, {
    headers: { Authorization: `Bearer ${owner.token}` },
    data: { restaurantId: owner.restaurantId, name: 'T1', capacity: 4 },
  });
  expect(table.ok()).toBeTruthy();
  return owner;
}

// Demain est a coup sur dans les 7 jours et jamais dans le passe. Le jour peut deja etre
// ouvert (premier jour disponible ouvert d'emblee) : on ne clique l'en-tete que s'il est replie.
async function firstSlotOfTomorrow(page: Page): Promise<Locator> {
  const day = page.locator('hk-reservation-slot-picker > div > div').nth(1);
  await expect(day).toBeVisible();
  const slots = day.getByRole('button', { name: /^\d{2}:\d{2}$/ });
  if ((await slots.count()) === 0) {
    await day.getByRole('button').first().click();
  }
  await expect(slots.first()).toBeVisible();
  return slots.first();
}

test.describe('Reservation en ligne : du QR du restaurateur a la confirmation du client', () => {
  test('un client sans compte reserve une table depuis le lien public', async ({
    page,
    request,
  }) => {
    const owner = await ownerWithOneTable(request, 'booking');

    await page.goto(`/client/restaurants/${owner.restaurantId}/schedule`);
    await expect(page.getByRole('heading', { name: owner.restaurantName })).toBeVisible();

    // Demain a coup sur dans les 7 jours et jamais dans le passe : on ouvre le 2e jour.
    const slot = await firstSlotOfTomorrow(page);
    const slotLabel = await slot.textContent();
    await slot.click();

    // La feuille de confirmation : on verifie la validation avant d'envoyer.
    await page.getByTestId('booking-submit').click();
    await expect(page.getByText('Indiquez votre prénom.')).toBeVisible();
    await page.getByTestId('booking-first-name').fill('Nadia');
    await page.getByTestId('booking-phone').fill('06 12 34 56 78');
    await page.getByTestId('booking-notes').fill('Poussette');
    await page.getByTestId('booking-submit').click();

    // Page confirmee, sans session : prenom, restaurant, heure choisie.
    await page.waitForURL(/\/client\/reservations\/.+\/confirmed/);
    await expect(page.getByRole('heading', { name: 'Réservation confirmée !' })).toBeVisible();
    await expect(page.getByText('Nadia')).toBeVisible();
    await expect(page.getByText(owner.restaurantName)).toBeVisible();
    await expect(page.getByText(slotLabel!.trim())).toBeVisible();

    // Le lien vers la carte porte la reservation : la carte propose de la modifier.
    await page.getByTestId('link-menu').click();
    await expect(page.getByTestId('link-reschedule')).toBeVisible();
  });

  test('la reservation web arrive chez le restaurateur avec sa source', async ({
    page,
    request,
  }) => {
    const owner = await ownerWithOneTable(request, 'booking-list');
    // Demain : le test tient a toute heure, y compris apres la fermeture du soir.
    const slots = await request.get(
      `${API}/public/restaurants/${owner.restaurantId}/slots?partySize=2`,
    );
    const tomorrow = (await slots.json()).days[1].slots as { startsAt: string }[];
    const created = await request.post(
      `${API}/public/restaurants/${owner.restaurantId}/reservations`,
      {
        data: {
          startsAt: tomorrow[0].startsAt,
          partySize: 2,
          customer: { firstName: 'Karim', phone: '06 98 76 54 32' },
        },
      },
    );
    expect(created.status()).toBe(201);
    const id = (await created.json()).id as string;
    // L'identifiant public est un jeton : il ne correspond a rien cote back-office.
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    // Cote restaurateur (API authentifiee) : la reservation existe, source web, client rattache.
    const list = await request.get(
      `${API}/reservations?restaurantId=${owner.restaurantId}&expand=customer`,
      { headers: { Authorization: `Bearer ${owner.token}` } },
    );
    const mine = (
      (await list.json()) as { id: string; source: string; customer?: { phone: string } }[]
    ).find((r) => r.customer?.phone === '+33698765432');
    expect(mine?.source).toBe('web');
    expect(mine?.id).not.toBe(id);
    // Le back range les numeros francais en forme internationale.
    expect(mine?.customer?.phone).toBe('+33698765432');

    // Liste du jour : rien aujourd'hui, la reservation apparait en passant au lendemain,
    // et l'en-tete suit le jour choisi. « Aujourd'hui » ramene a la journee vide.
    await login(page, owner);
    await page.goto('/reservations');
    await expect(page.getByText('Aucune réservation pour cette journée')).toBeVisible();
    await page.getByTestId('day-next').locator('button').click();
    await expect(page.getByText('Karim')).toBeVisible();
    await expect(page.getByTestId('day-today').locator('button')).toBeEnabled();
    await page.getByTestId('day-today').locator('button').click();
    await expect(page.getByText('Aucune réservation pour cette journée')).toBeVisible();
    await expect(page.getByTestId('day-today').locator('button')).toBeDisabled();
    // Saisie directe de la date (clavier) : meme resultat que la fleche.
    await page.getByTestId('day-input').fill(tomorrow[0].startsAt.slice(0, 10));
    await expect(page.getByText('Karim')).toBeVisible();
  });

  test('un creneau pris entre-temps est refuse avec un message, et la liste se met a jour', async ({
    page,
    request,
  }) => {
    const owner = await ownerWithOneTable(request, 'booking-race');
    await page.goto(`/client/restaurants/${owner.restaurantId}/schedule`);
    const slot = await firstSlotOfTomorrow(page);
    await slot.click();

    // Pendant que le client hesite, quelqu'un d'autre prend le meme creneau (par l'API).
    const fresh = await request.get(
      `${API}/public/restaurants/${owner.restaurantId}/slots?partySize=2`,
    );
    const startsAt = (await fresh.json()).days[1].slots[0].startsAt as string;
    const rival = await request.post(
      `${API}/public/restaurants/${owner.restaurantId}/reservations`,
      {
        data: { startsAt, partySize: 2, customer: { firstName: 'Rival', phone: '0611111111' } },
      },
    );
    expect(rival.status()).toBe(201);

    await page.getByTestId('booking-first-name').fill('Nadia');
    await page.getByTestId('booking-phone').fill('0612345678');
    await page.getByTestId('booking-submit').click();
    await expect(page.getByTestId('booking-error')).toContainText("vient d'être pris");
  });

  test('le client deplace sa reservation depuis le lien du message, sans session', async ({
    page,
    request,
  }) => {
    const owner = await ownerWithOneTable(request, 'booking-move');
    const slots = await request.get(
      `${API}/public/restaurants/${owner.restaurantId}/slots?partySize=2`,
    );
    const tomorrow = (await slots.json()).days[1].slots as { startsAt: string }[];
    const created = await request.post(
      `${API}/public/restaurants/${owner.restaurantId}/reservations`,
      {
        data: {
          startsAt: tomorrow[0].startsAt,
          partySize: 2,
          customer: { firstName: 'Nadia', phone: '0612345678' },
        },
      },
    );
    const id = (await created.json()).id as string;

    // Le lien du message : recapitulatif, puis un autre creneau, puis confirmation.
    await page.goto(`/client/reservations/${id}/reschedule`);
    await expect(page.getByText('Nadia')).toBeVisible();
    const slot = await firstSlotOfTomorrow(page);
    const label = (await slot.textContent())!.trim();
    await slot.click();
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await page.waitForURL(/\/confirmed/);
    await expect(page.getByText(label)).toBeVisible();

    // Un lien inconnu ne montre pas une page vide.
    await page.goto('/client/reservations/00000000-0000-0000-0000-000000000000/reschedule');
    await expect(page.getByText('Réservation introuvable')).toBeVisible();
  });

  test('le restaurateur a un QR « Reserver une table » qui pointe sur la page publique', async ({
    page,
    request,
  }) => {
    const owner = await ownerWithOneTable(request, 'booking-qr');
    await login(page, owner);
    await page.goto('/menu');
    const card = page.locator('hk-qr-card').nth(1);
    await expect(card).toContainText('Réserver une table');
    await expect(card.getByTestId('qr-url')).toContainText(
      `/client/restaurants/${owner.restaurantId}/schedule`,
    );
    await expect(card.getByTestId('download-svg')).toHaveAttribute(
      'download',
      /^reservation-.*\.svg$/,
    );
  });
});
