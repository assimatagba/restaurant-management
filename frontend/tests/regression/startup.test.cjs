const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../helpers.cjs');

test('startup without session shows the login form', () => {
  const runtime = app();
  assert.match(runtime.document.getElementById('app').innerHTML, /login-email/);
  assert.match(runtime.document.getElementById('app').innerHTML, /Se connecter/);
});

test('profile synchronization supports an empty surname during typing', () => {
  const runtime = app();
  const fields = { 'profile-first-name': { value: 'Awa' }, 'profile-last-name': { value: '' }, 'profile-name': { value: '' } };
  runtime.document.getElementById = id => fields[id];
  runtime.syncProfileFullName();
  assert.equal(fields['profile-name'].value, 'Awa');
});
