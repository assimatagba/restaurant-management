import { test, expect } from '@playwright/test';

test('create a multi-table reservation and cancel it from the table panel', async ({ page }, testInfo) => {
  const user = { id: 1, display_name: 'Awa Sarr', role: 'manager', is_super_admin: true, permissions: [] };
  let reservation = null;
  let version = 1;
  const tables = () => [1, 5].map(id => ({ id, number: id, display_number: String(id), capacity: 2,
    status: reservation ? 'reserved' : 'free', server_name: 'Awa Sarr', merged_table_ids: [id], reservations: reservation ? [reservation] : [] }));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body = [];
    let status = 200;
    if (path.endsWith('/auth/login')) body = { access_token: 'reservation-test-token', user };
    if (path.endsWith('/back-office/snapshot')) body = { version, user, orders: [], order_history: [], kitchen_orders: [], tables: tables(), servers: [{ id: 1, display_name: 'Awa Sarr' }], server_calls: [], leave_requests: [], audit_logs: [], status_labels: {}, dashboard: { revenue: 0, orders: 0, kitchen_orders: 0 } };
    if (path.endsWith('/reservations/availability')) body = { tables: reservation ? [] : tables(), available_count: reservation ? 0 : 2, duration_minutes: 120 };
    if (path.endsWith('/reservations') && request.method() === 'POST') {
      const payload = request.postDataJSON();
      expect(payload.table_ids).toEqual([1, 5]);
      expect(payload.party_size).toBe(4);
      expect(payload.notes).toBe('Une chaise bébé, merci.');
      reservation = { ...payload, id: 1, status: 'confirmed', table_numbers: [1, 5], duration_minutes: 120 };
      version++;
      body = reservation;
      status = 201;
    }
    if (path.endsWith('/reservations/1/cancel')) { reservation = null; version++; body = { status: 'cancelled' }; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/back-office/');
  await page.getByLabel('Adresse email').fill('awa@example.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill('TestPassword123!');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.getByRole('button', { name: 'Caisse', exact: true }).first().click();
  await page.getByRole('button', { name: '+ Réservation', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Nouvelle réservation' });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Enregistrer la réservation' })).toBeDisabled();
  await page.getByLabel('Nom de la réservation').fill('Famille Ndiaye');
  await page.getByLabel('Nombre de personnes').fill('4');
  await page.getByLabel('Date et heure de la réservation').fill('2035-06-01T12:00');
  await page.getByLabel('Note et précisions du client').fill('Une chaise bébé, merci.');
  const select = page.getByLabel('Tables disponibles (2)', { exact: true });
  await expect(select).toBeVisible();
  await select.selectOption(['1']);
  await expect(modal.getByRole('button', { name: 'Enregistrer la réservation' })).toBeDisabled();
  await select.selectOption(['1', '5']);
  await expect(page.getByText('2 table(s) sélectionnée(s) · 4 place(s) pour 4 personne(s)')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('reservation-desktop.png'), fullPage: true });
  await modal.getByRole('button', { name: 'Enregistrer la réservation' }).click();
  await expect(modal).not.toBeVisible();
  await page.getByRole('button', { name: 'Serveurs', exact: true }).first().click();
  await expect(page.locator('.table-grid [aria-label="Table réservée"]')).toHaveCount(2);
  await page.locator('.table-grid .table').first().click();
  await expect(page.getByRole('region', { name: 'Réservations de la table' })).toBeVisible();
  await expect(page.getByText('Famille Ndiaye', { exact: true })).toBeVisible();
  await expect(page.getByText('Une chaise bébé, merci.', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('reservation-summary-mobile.png'), fullPage: true });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Annuler la réservation', exact: true }).click();
  await expect(page.getByText('Aucune réservation à venir pour cette table.')).toBeVisible();
  await expect(page.locator('.table-grid [aria-label="Table réservée"]')).toHaveCount(0);
  await page.getByRole('button', { name: '+ Ajouter une réservation', exact: true }).click();
  await expect(modal).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('reservation-form-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});
