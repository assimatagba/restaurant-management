const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

exports.app = function app(overrides = {}) {
  const filename = path.resolve('frontend/public/app.js');
  const html = { innerHTML: '' };
  const context = {
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { matchMedia: () => ({ matches: false }), fetch: async () => ({ ok: false, status: 503 }) },
    document: { documentElement: { dataset: {} }, getElementById: () => html, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    setTimeout() {}, setInterval() {}, console, Intl, URLSearchParams, FormData,
    ...overrides,
  };
  // Execute the real complete source, including bootstrap, with inert network/timers.
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return context;
};
