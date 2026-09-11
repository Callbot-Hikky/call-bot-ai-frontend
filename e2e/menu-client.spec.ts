import { expect, test } from '@playwright/test';
import { apiPut, createOwner, fixtureBytes } from './helpers';

const CARTE = {
  version: 1,
  sections: [
    {
      name: 'Entrées',
      items: [
        {
          name: 'Velouté de potimarron',
          description: 'Crème fraîche, graines torréfiées',
          price: '9.00',
        },
      ],
    },
    {
      name: 'Plats',
      items: [
        { name: "Tajine d'agneau", description: '<b>Aux pruneaux</b>', price: '18.50' },
        { name: 'Plat du jour', description: '', price: '' },
      ],
    },
  ],
};

test.describe('Menu : page client', () => {
  test('rien de publié : la page dit que la carte arrive, sans session', async ({
    page,
    request,
  }) => {
    const owner = await createOwner(request, 'vide');
    await page.goto(`/client/restaurants/${owner.restaurantId}/menu`);
    await expect(page.getByRole('heading', { name: owner.restaurantName })).toBeVisible();
    await expect(page.getByText('arrive bientôt')).toBeVisible();
  });

  test('carte saisie : sections, prix à la virgule, HTML en texte brut', async ({
    page,
    request,
  }) => {
    const owner = await createOwner(request, 'carte');
    expect((await apiPut(request, owner, { mode: 'manual', manual: CARTE })).ok()).toBeTruthy();
    await page.goto(`/client/restaurants/${owner.restaurantId}/menu`);

    await expect(page.getByRole('heading', { name: 'Entrées' })).toBeVisible();
    await expect(page.getByText('18,50 €')).toBeVisible();
    await expect(page.getByText('Plat du jour')).toBeVisible();
    // Le HTML saisi est affiché tel quel, jamais interprété.
    await expect(page.getByText('<b>Aux pruneaux</b>')).toBeVisible();
    expect(await page.locator('b').count()).toBe(0);
    // Aucune donnée personnelle du restaurant dans la réponse publique.
    const body = await (
      await request.get(`http://localhost:8080/api/public/restaurants/${owner.restaurantId}/menu`)
    ).json();
    expect(body).not.toHaveProperty('phoneNumber');
    expect(body).not.toHaveProperty('address');
  });

  test('lien de modification seulement quand on vient du message de confirmation', async ({
    page,
    request,
  }) => {
    const owner = await createOwner(request, 'lien');
    await page.goto(`/client/restaurants/${owner.restaurantId}/menu`);
    await expect(page.getByTestId('link-reschedule')).toHaveCount(0);
    await page.goto(
      `/client/restaurants/${owner.restaurantId}/menu?reservation=11111111-1111-1111-1111-111111111111`,
    );
    await expect(page.getByTestId('link-reschedule')).toHaveAttribute(
      'href',
      '/client/reservations/11111111-1111-1111-1111-111111111111/reschedule',
    );
  });

  test('photos publiées : servies au public ; dépubliées : plus servies même avec l URL', async ({
    page,
    request,
  }) => {
    const owner = await createOwner(request, 'photospub');
    const up = await request.post(
      `http://localhost:8080/api/restaurants/${owner.restaurantId}/menu/files`,
      {
        headers: { Authorization: `Bearer ${owner.token}` },
        multipart: {
          file: { name: 'photo.png', mimeType: 'image/png', buffer: fixtureBytes('photo-1.png') },
        },
      },
    );
    expect(up.ok()).toBeTruthy();
    expect((await apiPut(request, owner, { mode: 'images' })).ok()).toBeTruthy();

    await page.goto(`/client/restaurants/${owner.restaurantId}/menu`);
    const img = page.getByTestId('menu-image');
    await expect(img).toBeVisible();
    const src = (await img.getAttribute('src'))!;
    expect(src).toMatch(/^\/api\/public\//);
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(120);

    expect((await apiPut(request, owner, { mode: 'none' })).ok()).toBeTruthy();
    expect((await request.get(`http://localhost:8080${src}`)).status()).toBe(404);
  });

  test('PDF publié : affiché dans un cadre avec un lien plein écran', async ({ page, request }) => {
    const owner = await createOwner(request, 'pdfpub');
    const up = await request.post(
      `http://localhost:8080/api/restaurants/${owner.restaurantId}/menu/files`,
      {
        headers: { Authorization: `Bearer ${owner.token}` },
        multipart: {
          file: {
            name: 'carte.pdf',
            mimeType: 'application/pdf',
            buffer: fixtureBytes('carte.pdf'),
          },
        },
      },
    );
    expect(up.ok()).toBeTruthy();
    expect((await apiPut(request, owner, { mode: 'pdf' })).ok()).toBeTruthy();

    await page.goto(`/client/restaurants/${owner.restaurantId}/menu`);
    // La carte est rendue en images : au moins une page dessinee, aucun lecteur PDF incruste.
    await expect(page.locator('[data-testid="menu-pdf"] canvas').first()).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    const res = await request.get(
      `http://localhost:8080${await page.getByTestId('open-pdf').getAttribute('href')}`,
    );
    expect(res.status()).toBe(200);
    expect(res.headers()['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers()['content-type']).toContain('application/pdf');
    await expect(page.getByTestId('open-pdf')).toHaveAttribute('rel', /noopener/);
  });

  test('restaurant inconnu : message clair', async ({ page }) => {
    await page.goto('/client/restaurants/00000000-0000-0000-0000-000000000000/menu');
    await expect(page.getByText('introuvable')).toBeVisible();
  });
});
