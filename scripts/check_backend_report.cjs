// Optional local visual QA. Backend CI itself has no Node/browser dependency.
const { chromium } = require('../frontend/node_modules/playwright');
const { expect } = require('../frontend/node_modules/@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
    const errors = [];
    const network = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().startsWith('http')) network.push(request.url()); });
    const output = path.resolve('reports/backend/preview');
    fs.mkdirSync(output, { recursive: true });
    await page.goto(pathToFileURL(path.resolve('reports/backend/index.html')).href);
    await expect(page.getByRole('tab')).toHaveCount(9);
    await expect(page.getByRole('heading', { name: 'Comprendre l’état du backend' })).toBeVisible();
    await page.screenshot({ path: path.join(output, 'overview.png'), fullPage: true });
    await page.getByRole('tab', { name: 'Régressions', exact: true }).click();
    await expect(page.getByRole('tabpanel', { name: 'Régressions' })).toBeVisible();
    await page.getByRole('searchbox').fill('congé');
    await expect(page.locator('#panel-regression .test-card:visible')).toHaveCount(1);
    await page.getByRole('searchbox').fill('aucun-resultat-impossible');
    await expect(page.locator('#panel-regression .empty-search')).toBeVisible();
    await page.getByRole('searchbox').fill('');
    await page.screenshot({ path: path.join(output, 'regression.png'), fullPage: true });
    await page.getByRole('tab', { name: 'SonarQube', exact: true }).click();
    await expect(page.locator('#panel-sonar')).toBeVisible();
    await page.screenshot({ path: path.join(output, 'sonarqube.png'), fullPage: true });
    await page.getByRole('tab', { name: 'Couverture', exact: true }).click();
    await expect(page.locator('#panel-coverage meter').first()).toBeVisible();
    await page.screenshot({ path: path.join(output, 'coverage.png'), fullPage: true });
    await page.getByRole('tab', { name: 'Couverture', exact: true }).focus();
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Détails techniques' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: 'Vue d’ensemble' })).toHaveAttribute('aria-selected', 'true');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
    expect(errors).toEqual([]);
    expect(network).toEqual([]);
    console.log('Backend report: 9 tabs, search, keyboard navigation, coverage chart, mobile layout and offline loading verified.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
