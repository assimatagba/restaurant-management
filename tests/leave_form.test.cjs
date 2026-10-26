const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('frontend/public/app.js', 'utf8');

test('an expired API session triggers reconnection', async () => {
  const wrapper = source.slice(source.indexOf('window.fetch ='), source.indexOf('\nconst state ='));
  let expired = 0;
  let headers;
  const context = { window: {}, savedSession: { token: 'expired-test-token' }, nativeFetch: async (_url, options) => { headers = options.headers; return { status: 401 }; }, handleExpiredSession: () => { expired++; } };
  vm.runInNewContext(wrapper, context);
  await context.window.fetch('/api/leave-requests', { method: 'POST' });
  assert.equal(headers.Authorization, 'Bearer expired-test-token');
  assert.equal(expired, 1);
});

test('reconnection preserves the leave request draft and removes the stale token', () => {
  const handler = source.match(/function handleExpiredSession\(\) \{[\s\S]*?\n\}/)[0];
  const draft = { start_date: '2026-10-28', end_date: '2026-10-30', reason: 'Test technique' };
  const form = {};
  const hint = {};
  let forced = false;
  let removed;
  const context = { state: { session: { user: {} }, leaveSubmitting: true }, savedSession: { token: 'stale' }, FormData: class { *[Symbol.iterator]() { yield* Object.entries(draft); } }, document: { querySelector: selector => selector === '.leave-request-form' ? form : hint }, localStorage: { removeItem: key => { removed = key; } }, render: force => { forced = force; } };
  vm.runInNewContext(handler + '\nhandleExpiredSession();', context);
  assert.equal(JSON.stringify(context.state.leaveDraft), JSON.stringify(draft));
  assert.equal(context.state.session, null);
  assert.equal(context.savedSession, null);
  assert.equal(context.state.leaveSubmitting, false);
  assert.equal(removed, 'epicea-back-office-session');
  assert.equal(forced, true);
  assert.match(hint.textContent, /demande est conservée/);
});

test('polling does not replace a focused leave form', () => {
  const render = source.match(/function render\(force = false\) \{[\s\S]*?\n\}/)[0];
  let rendered = false;
  const context = { state: {}, document: { activeElement: { closest: () => ({}) }, getElementById: () => { rendered = true; } } };
  vm.runInNewContext(render + '\nrender();', context);
  assert.equal(rendered, false);
});

test('submission validates dates and prevents duplicate clicks', async () => {
  const submit = source.match(/async function submitLeaveRequest\(event\) \{[\s\S]*?\n\}/)[0];
  const error = { textContent: '' };
  const button = { disabled: false };
  let calls = 0;
  let resolveFetch;
  const payload = { start_date: '2027-03-03', end_date: '2027-03-01', reason: 'Congé annuel' };
  const form = { querySelector: selector => selector === '.leave-form-error' ? error : button, reset() {}, contains: () => false };
  const context = { state: { myLeaveRequests: [] }, API_BASE: '/api', FormData: class { *[Symbol.iterator]() { yield* Object.entries(payload); } }, document: { activeElement: null }, showToast() {}, fetch() { calls++; return new Promise(resolve => { resolveFetch = resolve; }); } };
  vm.runInNewContext(submit, context);
  const event = { preventDefault() {}, currentTarget: form };
  await context.submitLeaveRequest(event);
  assert.equal(calls, 0);
  assert.ok(error.textContent);
  payload.end_date = '2027-03-05';
  const pending = context.submitLeaveRequest(event);
  await context.submitLeaveRequest(event);
  assert.equal(calls, 1);
  resolveFetch({ ok: true, json: async () => ({ id: 1, status: 'pending' }) });
  await pending;
  assert.equal(context.state.leaveSubmitting, false);
  assert.equal(context.state.myLeaveRequests.length, 1);
});
