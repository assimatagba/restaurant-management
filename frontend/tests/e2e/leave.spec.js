import { test, expect } from '@playwright/test';

test('dashboard shows the current user and live restaurant activity', async ({ page }) => {
  let version = 1;
  let occupied = true;
  const user = { id: 9, display_name: 'Fatou Ndiaye', role: 'manager', permissions: [] };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body = [];
    if (path.endsWith('/auth/login')) body = { access_token: 'dashboard-token', user };
    if (path.endsWith('/back-office/snapshot')) body = {
      version, user, orders: [], order_history: [], tables: [{ id: 1, status: occupied ? 'occupied' : 'free' }],
      servers: [], server_calls: [], leave_requests: [], audit_logs: [], status_labels: {},
      dashboard: { revenue: occupied ? 156 : 0, orders: occupied ? 4 : 0, average_basket: occupied ? 39 : null, active_orders: 7, kitchen_orders: occupied ? 2 : 0, order_flow: [{ hour: 11, orders: occupied ? 4 : 0 }], changes: { revenue: 25 } },
    };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/back-office/');
  await page.getByLabel('Adresse email').fill('fatou@example.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill('TestPassword123!');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bon retour, Fatou' })).toBeVisible();
  await expect(page.locator('.hero p')).toHaveText('1 table occupée · 2 commandes en cuisine');
  await expect(page.getByText('156,00 €', { exact: true })).toBeVisible();
  await expect(page.getByText('39,00 €', { exact: true })).toBeVisible();
  await expect(page.locator('.live-order-bar')).toHaveAttribute('title', '11 h : 4 commande(s)');
  occupied = false;
  user.display_name = 'Awa Sarr';
  version++;
  await page.evaluate(() => window.syncBackOffice());
  await expect(page.getByRole('heading', { name: 'Bon retour, Awa' })).toBeVisible();
  await expect(page.locator('.hero p')).toHaveText('0 tables occupées · 0 commandes en cuisine');
  await expect(page.getByText('0,00 €', { exact: true })).toBeVisible();
  await expect(page.getByText('Aucune commande enregistrée aujourd’hui.')).toBeVisible();
});

test('production chunks support login, profile and leave submission', async ({ page }, testInfo) => {
  const user = { id: 3, display_name: 'Mariam Sarr', first_name: 'Mariam', last_name: 'Sarr', email: 'mariam@epicea.local', role: 'server', employee_id: 2, active: true, permissions: [] };
  const leaves = [];
  let version = 1;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    let body = [];
    if (url.pathname.endsWith('/auth/login')) body = { access_token: 'test-token', user, expires_at: '2099-01-01T00:00:00Z' };
    if (url.pathname.endsWith('/back-office/snapshot')) body = { version, user, orders: [], order_history: [], tables: [], servers: [], server_calls: [], leave_requests: [], audit_logs: [], status_labels: {}, dashboard: { revenue: 0, orders: 0, activeOrders: 0, leaveRequests: 0 } };
    if (url.pathname.endsWith('/leave-requests/mine')) body = leaves;
    if (url.pathname.endsWith('/leave-requests') && route.request().method() === 'POST') {
      body = { ...route.request().postDataJSON(), id: 1, status: 'pending' }; leaves.push(body); version++;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/back-office/');
  await page.getByLabel('Adresse email').fill(user.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill('TestPassword123!');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.getByRole('button', { name: 'Mon compte', exact: true }).first().click();
  await page.getByRole('button', { name: 'Modifier mes informations' }).click();
  await expect(page.locator('body')).toHaveCSS('font-size', '16px');
  await page.getByLabel('Prénom(s)').fill('Mariam Awa');
  await expect(page.getByLabel('Nom complet', { exact: true })).toHaveValue('Mariam Awa Sarr');
  await expect(page.getByLabel('Nom complet', { exact: true })).toHaveAttribute('readonly', '');
  await page.screenshot({ path: testInfo.outputPath('profile-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await page.getByRole('tab', { name: 'Demandes de congés' }).click();
  await page.getByLabel('Date de début').fill('2027-06-01');
  await page.getByLabel('Date de fin').fill('2027-06-03');
  await page.getByLabel('Motif').fill('Test de régression navigateur');
  await page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/api/back-office/snapshot'));
  await expect(page.getByLabel('Motif')).toHaveValue('Test de régression navigateur');
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(page.getByText('Demande envoyée au manager')).toBeVisible();
  await expect(page.getByText('En attente', { exact: true })).toBeVisible();
  expect(leaves).toHaveLength(1);
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.sidebar .ui-icon').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('leave-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Passer en mode nuit' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await page.screenshot({ path: testInfo.outputPath('leave-mobile-night.png'), fullPage: true });
});

test('portal and public menu use distinct dynamic entry points', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Consulter la carte' })).toBeVisible();
  await page.getByRole('link').filter({ hasText: 'Consulter la carte' }).click();
  await expect(page.getByRole('heading', { name: 'Notre carte du jour' })).toBeVisible();
  await page.getByRole('button', { name: 'Plats', exact: true }).click();
  await expect(page.getByText('Aucun plat ne correspond à ce filtre.')).toBeVisible();
});

test('menu visuals are local vectors and identical data does not replace cards', async ({ page }, testInfo) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.route('**/api/menu?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ id: 1, name: 'Poulet yassa', price: 14, category: 'Plats', description: 'Poulet mariné et riz parfumé.', dietary_tags: ['Sans gluten'], allergens: [], available: true, featured: true }]) }));
  await page.goto('/front-office/');
  await expect(page.locator('.client-food .dish-visual')).toBeVisible();
  await page.locator('.client-menu-card').evaluate(element => { element.dataset.stable = 'yes'; });
  await page.evaluate(() => window.loadClientMenu());
  await expect(page.locator('.client-menu-card')).toHaveAttribute('data-stable', 'yes');
  await expect(page.locator('body')).toHaveCSS('font-size', '16px');
  expect(requests.some(url => /fonts\.(googleapis|gstatic)\.com/.test(url))).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('menu-desktop.png'), fullPage: true });
});
