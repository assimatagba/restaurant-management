const paths = {
  'Vue d’ensemble': '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  Cuisine: '<path d="M4 13a8 8 0 0 1 16 0M3 17h18M7 21h10M12 3v2"/>',
  Tables: '<rect x="4" y="6" width="16" height="12" rx="3"/><path d="M8 3v3m8-3v3M8 18v3m8-3v3"/>',
  Serveurs: '<circle cx="12" cy="7" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3M17 10h5m-2-2v4"/>',
  'Historique des commandes': '<path d="M4 6v5h5M4 11a8 8 0 1 1 1 7M12 7v5l3 2"/>',
  Caisse: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 11h18M7 15h3"/>',
  Manager: '<path d="M5 20V10m7 10V4m7 16v-7M3 20h18"/>',
  'Ressources humaines': '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 5a5 5 0 0 1 3 5"/>',
  Menu: '<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/>',
  'Mon compte': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  Déconnexion: '<path d="M9 4H4v16h5m6-13 5 5-5 5M9 12h11"/>',
  Rechercher: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  Notifications: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zm5 3h4"/>',
};
const dishes = {
  '🍗': '<path fill="#c77836" d="M39 35c13-13 35 0 26 17L48 66 29 48z"/><path fill="#f5e5bb" d="m32 48-9 10-4-1-4 5 7 7 5-4-1-4 10-10z"/>',
  '🐟': '<path fill="#639a9c" d="M20 48c15-19 35-19 49 0-14 19-34 19-49 0m49 0 13-12v24z"/><circle cx="35" cy="44" r="3" fill="#153e3c"/><path d="m46 36 5 12-5 12" stroke="#d2eee5" fill="none" stroke-width="3"/>',
  '🍔': '<path fill="#dcaa5e" d="M22 42a26 22 0 0 1 52 0zM22 63h52v6H22z"/><rect x="20" y="48" width="56" height="10" rx="5" fill="#77452d"/><path d="m22 44 10 5 10-5 12 5 10-5 10 4" fill="none" stroke="#6d9746" stroke-width="6"/><path d="M23 60h50" stroke="#e9c45b" stroke-width="5"/>',
  '🥗': '<path fill="#679b50" d="M22 48q-7-27 17-17 5-23 17-5 25-7 17 18z"/><path fill="#dce6bc" d="M18 47h60q-4 28-30 28T18 47"/><circle cx="36" cy="42" r="7" fill="#ce745c"/><circle cx="60" cy="39" r="7" fill="#e8bd69"/>',
  '🥟': '<path fill="#d9a65c" stroke="#a56f37" stroke-width="2" d="M18 56q14-36 34 0-17 15-34 0m27-8q14-36 34 0-17 15-34 0"/>',
  '☕': '<path fill="#f5e8cc" d="M22 36h43v22q-2 16-21 16T22 58z"/><path d="M65 41h9q13 14-9 17" fill="none" stroke="#f5e8cc" stroke-width="5"/><path d="M33 27q-5-7 0-13m14 13q-5-7 0-13" fill="none" stroke="#aa8d65" stroke-width="3"/>',
};

export function enhanceVisuals(root = document) {
  for (const element of root.querySelectorAll('.nav-item i, .mobile-nav button i, .icon-button[aria-label]')) {
    const label = element.getAttribute('aria-label') || element.parentElement.getAttribute('aria-label');
    if (!paths[label] || element.dataset.vector === label) continue;
    element.innerHTML = `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[label]}</svg>`;
    element.dataset.vector = label;
  }
  for (const element of root.querySelectorAll('.food-image, .client-food, .mini-food, .dish-large, .hero-art')) {
    if (element.dataset.vector) continue;
    const text = [...element.childNodes].find(node => node.nodeType === 3 && node.textContent.trim());
    if (!text) continue;
    const drawing = dishes[text.textContent.trim()] || '';
    text.remove();
    element.insertAdjacentHTML('afterbegin', `<svg class="dish-visual" viewBox="0 0 96 96" aria-hidden="true" focusable="false"><circle cx="48" cy="49" r="40" fill="#f9f4e6"/><circle cx="48" cy="49" r="33" fill="none" stroke="#e3d7bc" stroke-width="2"/>${drawing}</svg>`);
    element.dataset.vector = 'dish';
  }
}
