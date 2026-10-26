const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../helpers.cjs');

test('existing names split into given names and surname', () => {
  const runtime = app();
  assert.equal(runtime.profileNameParts({ display_name: 'Mariam Awa Sarr' }).firstName, 'Mariam Awa');
  assert.equal(runtime.profileNameParts({ display_name: 'Mariam Awa Sarr' }).lastName, 'Sarr');
});

test('explicit name fields take precedence', () => {
  const parts = app().profileNameParts({ display_name: 'Old name', first_name: 'Awa', last_name: 'Sarr' });
  assert.equal(parts.firstName, 'Awa');
  assert.equal(parts.lastName, 'Sarr');
});

test('profile attributes escape HTML special characters', () => {
  assert.equal(app().escapeAttribute('<a name="x">&'), '&lt;a name=&quot;x&quot;&gt;&amp;');
});

test('complete name updates immediately from both editable fields', () => {
  const fields = { 'profile-first-name': { value: ' Awa ' }, 'profile-last-name': { value: ' Sarr ' }, 'profile-name': { value: '' } };
  const runtime = app();
  runtime.document.getElementById = id => fields[id];
  runtime.syncProfileFullName();
  assert.equal(fields['profile-name'].value, 'Awa Sarr');
});
