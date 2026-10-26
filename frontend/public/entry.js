import './comfort.css';
import { enhanceVisuals } from './visuals.js';
window.enhanceVisuals = enhanceVisuals;
// Keep each interface in its own asynchronously loaded production chunk.
async function start() {
  if (document.body.dataset.appMode === 'back-office') {
    await import('./app.js');
  } else if (document.body.classList.contains('client-body')) {
    await import('./front-office/client.js');
  }
  enhanceVisuals();
  if ('serviceWorker' in navigator) {
    if (import.meta.env?.DEV) {
      // A production worker must never cache Vite's development modules.
      for (const registration of await navigator.serviceWorker.getRegistrations()) {
        if (registration.scope === new URL('/', location.origin).href) await registration.unregister();
      }
    } else {
      await navigator.serviceWorker.register('/service-worker.js');
    }
  }
}

start().catch(() => {
  const target = document.getElementById('app') || document.getElementById('client-app');
  if (target) target.textContent = 'Chargement impossible. Rechargez la page pour réessayer.';
});
