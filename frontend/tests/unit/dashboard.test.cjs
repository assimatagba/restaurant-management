const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../helpers.cjs');

test('dashboard greets the signed-in user and escapes their name', () => {
  const runtime = app();
  const state = runtime.window.state;
  state.session = { user: { display_name: 'Fatou Ndiaye' } };
  assert.equal(runtime.getTitle(), 'Bon retour, Fatou');
  state.session.user = { first_name: 'Awa <test>', display_name: 'Old Name' };
  assert.equal(runtime.getTitle(), 'Bon retour, Awa &lt;test&gt;');
  state.session = null;
  assert.equal(runtime.getTitle(), 'Bon retour');
});

test('dashboard activity uses real occupied tables and kitchen count including zero', () => {
  const runtime = app();
  const state = runtime.window.state;
  assert.match(runtime.dashboardActivity(), /Chargement/);
  state.syncVersion = 1;
  state.tables = [{ status: 'occupied' }, { status: 'free' }, { status: 'reserved' }, { status: 'cleaning' }];
  state.dashboard.kitchenOrders = 1;
  assert.equal(runtime.dashboardActivity(), '1 table occupée · 1 commande en cuisine');
  state.tables = [];
  state.dashboard.kitchenOrders = 0;
  assert.equal(runtime.dashboardActivity(), '0 tables occupées · 0 commandes en cuisine');
});

test('daily metrics keep zero values and distinguish unmeasured values', () => {
  const runtime = app();
  const state = runtime.window.state;
  state.syncVersion = 1;
  state.dashboard = runtime.normalizeDashboard({ revenue: 0, orders: 0, average_basket: null, changes: { revenue: -25, orders: null } });
  assert.equal(runtime.metricValue(0, true), '0,00 €');
  assert.equal(runtime.metricValue(null, true), '—');
  assert.match(runtime.metricChange('revenue'), /-25/);
  assert.equal(runtime.metricChange('orders'), 'Comparaison indisponible');
  assert.equal(runtime.serviceLabel(), 'Aucun service ouvert aujourd’hui');
  assert.match(runtime.orderFlow(), /Aucune commande/);
  assert.equal(state.orders.length, 0);
});

test('kitchen displays paid active orders independently of cashier orders', () => {
  const runtime = app();
  const state = runtime.window.state;
  state.session = { user: { display_name: 'Awa Sarr', role: 'manager' } };
  state.orders = [];
  state.kitchenOrders = [{ id: '#paid-active', status: 'préparation', items: ['Plat réel'], table: 'Table 9', elapsedMinutes: 5 }];
  assert.match(runtime.kitchen(), /#paid-active/);
  assert.match(runtime.kitchen(), /Plat réel/);
  assert.match(runtime.cashier(), /Caisse à jour/);
});

test('failed order submission keeps its draft without inventing an order', async () => {
  const runtime = app();
  const state = runtime.window.state;
  state.cart = [{ id: 7, price: 10, quantity: 1 }];
  state.tables = [{ id: 3 }];
  state.selectedTableId = 3;
  let message;
  runtime.showToast = value => { message = value; };
  runtime.fetch = async () => ({ ok: false });
  await runtime.sendOrder();
  assert.equal(state.cart.length, 1);
  assert.equal(state.orders.length, 0);
  assert.match(message, /brouillon/);
});

test('cashier submits only the actual outstanding amount', async () => {
  const runtime = app();
  const state = runtime.window.state;
  state.session = { user: { display_name: 'Awa Sarr' } };
  state.orders = [{ id: '#7', remoteId: 7, total: 20, remainingAmount: 5 }];
  let payload;
  let refreshed = false;
  runtime.showToast = () => {};
  runtime.refreshOperations = async () => { refreshed = true; };
  runtime.fetch = async (_, options) => { payload = JSON.parse(options.body); return { ok: true }; };
  await runtime.paySelectedOrder();
  assert.equal(payload.amount, 5);
  assert.equal(refreshed, true);
});
