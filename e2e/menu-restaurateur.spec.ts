import { expect, test } from '@playwright/test';
import { createOwner, fixture, login, oversizedPng } from './helpers';

test.describe('Menu : page restaurateur', () => {
  test('parcours complet : saisie, publication, rechargement, dépublication', async ({
    page,
    request,
  }) => {
    const owner = await createOwner(request, 'saisie');
    await login(page, owner);
    await page.goto('/menu');

    await expect(page.getByRole('heading', { name: 'Votre carte' })).toBeVisible();
    await expect(page.getByTestId('nothing-published')).toContainText("Rien n'est publié");

    // Une carte vide s'ouvre sans erreur : le bandeau dit quoi faire, la zone de saisie apparaît.
    await page.getByTestId('mode-manual').click();
    await expect(page.getByTestId('nothing-published')).toContainText('Préparez un format');
    await expect(page.getByTestId('add-section')).toBeVisible();
    await expect(page.getByTestId('mode-manual')).toContainText('En préparation');

    // Saisir une carte : section, plat, prix avec virgule, description.
    await page.getByTestId('add-section').click();
    await page.getByLabel('Nom de la section 1').fill('Plats');
    await page.getByTestId('add-item-0').click();
    await page.getByLabel('Nom du plat 1').fill("Tajine d'agneau");
    await page.getByLabel('Prix du plat 1').fill('18,5');
    await page.getByLabel('Description du plat 1').fill('Aux pruneaux et amandes');
    await page.getByLabel('Prix du plat 1').blur();
    await expect(page.getByLabel('Prix du plat 1')).toHaveValue('18.50');

    // Entrée dans le nom d'un plat ajoute un plat suivant.
    await page.getByLabel('Nom du plat 1').press('Enter');
    await expect(page.getByLabel('Nom du plat 2')).toBeVisible();
    await page.getByTestId('remove-item-0-1').click();
    await page.getByTestId('confirm-remove').click();
    await expect(page.getByLabel('Nom du plat 2')).toHaveCount(0);

    // Autosave : l'état passe par « en cours » puis « Enregistré ».
    await expect(page.getByTestId('save-state')).toHaveText(/Enregistré/, { timeout: 5_000 });

    // Publier : par le bouton explicite, un clic sur la carte ne fait qu'ouvrir.
    await page.getByTestId('publish-current').click();
    await expect(page.getByTestId('publish-state')).toContainText('votre carte saisie');
    await expect(page.getByTestId('mode-manual')).toContainText('Publié');

    // Recharger : tout est retrouvé, y compris le prix normalisé.
    await page.reload();
    await expect(page.getByLabel('Nom du plat 1')).toHaveValue("Tajine d'agneau");
    await expect(page.getByLabel('Prix du plat 1')).toHaveValue('18.50');
    await expect(page.getByTestId('mode-manual')).toContainText('Publié');

    // Dépublier.
    await page.getByTestId('unpublish').click();
    await page.getByTestId('confirm-unpublish').click();
    await expect(page.getByTestId('nothing-published')).toBeVisible();
  });

  test('photos : dépose, refus des mauvais fichiers, réordonnancement, suppression, publication', async ({
    page,
    request,
  }) => {
    const owner = await createOwner(request, 'photos');
    await login(page, owner);
    await page.goto('/menu');
    await page.getByTestId('mode-images').click();

    const input = page.locator('section[aria-label="Carte en photos"] input[type=file]');
    await input.setInputFiles([fixture('photo-1.png'), fixture('photo-2.png')]);
    await expect(page.getByTestId('image-thumb')).toHaveCount(2, { timeout: 10_000 });
    await expect(page.getByTestId('image-count')).toContainText('2/8');
    await expect(page.getByText('2 photos ajoutées.')).toBeVisible();

    // Un SVG est refusé avant tout envoi, par le type annoncé.
    await input.setInputFiles(fixture('evil.svg'));
    await expect(page.getByTestId('dropzone-error')).toContainText("n'est pas accepté");
    await expect(page.getByTestId('image-thumb')).toHaveCount(2);

    // Un « .png » qui contient du HTML est refusé sur ses octets.
    await input.setInputFiles(fixture('faux.png'));
    await expect(
      page.getByText('Seuls les fichiers PDF, JPEG, PNG et WebP sont acceptés.'),
    ).toBeVisible();
    await expect(page.getByTestId('image-thumb')).toHaveCount(2);

    // Un PNG de plus de 5 Mo est refusé avant tout envoi.
    await input.setInputFiles(oversizedPng());
    await expect(page.getByTestId('dropzone-error')).toContainText('trop volumineux');
    await expect(page.getByTestId('image-thumb')).toHaveCount(2);

    // Réordonner : la 2e photo passe en tête, et l'ordre survit au rechargement.
    const thumbs = page.getByTestId('image-thumb');
    const secondSrc = await thumbs.nth(1).getAttribute('src');
    await page.getByTestId(`move-up-${secondSrc!.split('/').pop()}`).click();
    await expect(thumbs.nth(0)).toHaveAttribute('src', secondSrc!);
    await page.reload();
    // Au rechargement la page rouvre le format publié (aucun ici) : on rouvre les photos.
    await page.getByTestId('mode-images').click();
    await expect(page.getByTestId('image-thumb').nth(0)).toHaveAttribute('src', secondSrc!);

    // Publier, puis supprimer une photo avec confirmation.
    await page.getByTestId('publish-current').click();
    await expect(page.getByTestId('mode-images')).toContainText('Publié');
    await page.getByTestId(`remove-file-${secondSrc!.split('/').pop()}`).click();
    await page.getByTestId('confirm-remove-file').click();
    await expect(page.getByTestId('image-thumb')).toHaveCount(1);
    await expect(page.getByTestId('mode-images')).toContainText('Publié');

    // Supprimer la dernière : plus rien n'est publié, et l'app le dit.
    const lastId = (await page.getByTestId('image-thumb').first().getAttribute('src'))!
      .split('/')
      .pop();
    await page.getByTestId(`remove-file-${lastId}`).click();
    await page.getByTestId('confirm-remove-file').click();
    await expect(page.getByText("Plus rien n'est publié")).toBeVisible();
    await expect(page.getByTestId('nothing-published')).toBeVisible();
  });

  test('PDF : dépose, aperçu intégré, second PDF ajouté, publication', async ({
    page,
    request,
    isMobile,
  }) => {
    const owner = await createOwner(request, 'pdf');
    await login(page, owner);
    await page.goto('/menu');
    await page.getByTestId('mode-pdf').click();

    const input = page.locator('section[aria-label="Carte en PDF"] input[type=file]');
    await input.setInputFiles(fixture('carte.pdf'));
    await expect(page.getByText('PDF ajouté.')).toBeVisible();
    await expect(page.getByTestId('pdf-preview')).toBeVisible();
    // Le fichier admin est servi a la session (le rendu en images le lit depuis le navigateur).
    const previewStatus = await page.evaluate(
      async (src) => (await fetch(src, { credentials: 'include' })).status,
      await page.getByTestId('open-pdf').getAttribute('href'),
    );
    expect(previewStatus).toBe(200);

    // Un second PDF (la carte des vins, par exemple) s'ajoute a la suite du premier.
    await page
      .locator('section[aria-label="Carte en PDF"] input[type=file]')
      .setInputFiles(fixture('carte.pdf'));
    await expect(page.getByText('PDF ajouté.').last()).toBeVisible();
    await expect(page.getByTestId('pdf-preview')).toHaveCount(2);
    await expect(page.getByTestId('pdf-count')).toContainText('2/5 PDF');

    await page.getByTestId('publish-current').click();
    await expect(page.getByTestId('publish-state')).toContainText('vos cartes en PDF');

    // Un seul défilement : la molette fait défiler la zone principale, jamais la fenêtre.
    // Geste de souris : profil bureau seulement (le tactile n'a pas de molette).
    if (!isMobile) {
      await page.mouse.move(700, 300);
      await page.mouse.wheel(0, 3000);
      await page.waitForTimeout(300);
      const scroll = await page.evaluate(() => ({
        winY: window.scrollY,
        mainTop: document.querySelector('main')!.scrollTop,
      }));
      expect(scroll.winY).toBe(0);
      expect(scroll.mainTop).toBeGreaterThan(0);
    }
  });

  test('QR code : lien public, téléchargements nommés, copie', async ({
    page,
    request,
    context,
  }) => {
    const owner = await createOwner(request, 'qr');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await login(page, owner);
    await page.goto('/menu');

    const card = page.locator('hk-qr-card').first();
    await expect(card.getByTestId('qr-url')).toContainText(
      `/client/restaurants/${owner.restaurantId}/menu`,
    );
    await expect(card.locator('img')).toBeVisible();
    await expect(card.getByTestId('download-svg')).toHaveAttribute(
      'download',
      /^menu-chez-e2e-qr\.svg$/,
    );
    await expect(card.getByTestId('download-png')).toHaveAttribute(
      'download',
      /^menu-chez-e2e-qr\.png$/,
    );

    await card.getByTestId('copy-url').click();
    await expect(card.getByTestId('copy-url')).toContainText('Lien copié');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      `/client/restaurants/${owner.restaurantId}/menu`,
    );

    // « Ouvrir la page » ouvre la page publique dans un nouvel onglet, sans session.
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      card.getByTestId('open-url').click(),
    ]);
    await expect(popup.getByRole('heading', { name: owner.restaurantName })).toBeVisible();
    expect(await popup.evaluate(() => window.opener)).toBeNull();
  });

  test('clavier : la dépose est atteignable au clavier et le focus est visible', async ({
    page,
    request,
  }) => {
    const owner = await createOwner(request, 'clavier');
    await login(page, owner);
    await page.goto('/menu');
    await page.getByTestId('mode-images').click();

    const input = page.locator('section[aria-label="Carte en photos"] input[type=file]');
    await input.focus();
    await expect(input).toBeFocused();
    const ringed = await page
      .locator('section[aria-label="Carte en photos"] label')
      .evaluate((el) => getComputedStyle(el).boxShadow !== 'none');
    expect(ringed).toBe(true);
  });

  test('un intrus ne voit pas le menu d un autre restaurant', async ({ page, request }) => {
    const owner = await createOwner(request, 'proprio');
    const intruder = await createOwner(request, 'intrus');
    await login(page, intruder);
    // Le menu de la page est celui de la session : l'intrus ne peut pas viser un autre restaurant par l'écran.
    // Par l'API directement, c'est refusé.
    const res = await request.put(
      `http://localhost:8080/api/restaurants/${owner.restaurantId}/menu`,
      {
        headers: { Authorization: `Bearer ${intruder.token}` },
        data: { mode: 'none' },
      },
    );
    expect(res.status()).toBe(403);
    await page.goto('/menu');
    await expect(page.getByRole('heading', { name: 'Votre carte' })).toBeVisible();
  });
});
