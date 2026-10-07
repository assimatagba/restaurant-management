const query = new URLSearchParams(location.search);
const clientState = { menu: [], cart: JSON.parse(localStorage.getItem('epicea-cart') || '[]'), filter: 'Tous', orderType: '', tableId: query.get('table') || null, waitEstimate: 'environ 30 minutes', sending: false, confirmation: null };
const foodIcons = { 'Poulet yassa': '🍗', 'Thiéboudienne': '🐟', 'Burger Épicéa': '🍔', 'Salade quinoa': '🥗', 'Pastels de poisson': '🥟', 'Café gourmand': '☕' };

const money = value => `${Number(value).toFixed(2).replace('.', ',')} €`;
const total = () => clientState.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
const saveCart = () => localStorage.setItem('epicea-cart', JSON.stringify(clientState.cart));

function clientRender() {
  const filters = ['Tous', 'Entrées', 'Plats', 'Desserts', 'Végétarien', 'Sans gluten'];
  const shown = clientState.menu.filter(item => item.available && (clientState.filter === 'Tous' || item.category === clientState.filter || item.dietary_tags.includes(clientState.filter)));

  document.getElementById('client-app').innerHTML = `
    <main class="client-shell">
      <header class="client-header">
        <a href="/" class="brand"><b>✦</b> épicéa</a>
        <span class="client-table">⌖ Menu</span>
      </header>

      <section class="client-hero">
        <p class="eyebrow">BIENVENUE CHEZ ÉPICÉA</p>
        <h1>Notre carte du jour</h1>
        <p>Le serveur prendra votre commande directement à table. <b>Merci de ne pas passer la commande depuis votre téléphone.</b></p>
      </section>

      <section class="client-content">
        <div>
          <div class="chips">${filters.map(filter => `<button class="chip ${clientState.filter === filter ? 'selected' : ''}" onclick="setClientFilter('${filter}')">${filter}</button>`).join('')}</div>
          <div class="client-menu">${shown.map(item => `
            <article class="client-menu-card">
              <div class="client-food">${foodIcons[item.name] || '🍽️'}${item.featured ? '<span>★ Suggestion du chef</span>' : ''}</div>
              <div>
                <h2>${item.name}</h2>
                <p>${item.description}</p>
                <div class="tags">${item.dietary_tags.map(tag => `<span>${tag}</span>`).join('')}${item.allergens.length ? `<span class="allergen">Allergènes : ${item.allergens.join(', ')}</span>` : ''}</div>
                <div class="client-card-footer">
                  <b>${money(item.price)}</b>
                </div>
              </div>
            </article>
          `).join('') || '<p class="empty-menu">Aucun plat ne correspond à ce filtre.</p>'}</div>
        </div>

        <aside class="client-cart">
          <div class="cart-heading">
            <h3>Commande</h3>
            <span>Service par le serveur</span>
          </div>
          <div class="empty-cart">
            <p>Veuillez demander au serveur de prendre votre commande.</p>
          </div>
          <p class="client-note">Les commandes sont prises uniquement par le personnel de salle.</p>
        </aside>
      </section>
    </main>`;
}

function setClientFilter(filter) { clientState.filter = filter; clientRender(); }
function setClientOrderType(type) { clientState.orderType = type; if (type !== 'dine_in') clientState.tableId = null; clientRender(); }
function setClientTable(tableId) { clientState.tableId = tableId ? Number(tableId) : null; clientRender(); }
function addClientItem(id) { return null; }
function removeClientItem(id) { return null; }
async function submitClientOrder() {
  alert('Les commandes sont prises uniquement par le serveur.');
}
function newClientOrder() { clientState.confirmation = null; clientState.orderType = ''; clientState.tableId = null; clientRender(); }
async function loadClientMenu() {
  try {
    const [menuResponse, estimateResponse] = await Promise.all([
      fetch('/api/menu?available_only=true'),
      fetch('/api/wait-time-estimate')
    ]);
    if (menuResponse.ok) clientState.menu = await menuResponse.json();
    if (estimateResponse.ok) clientState.waitEstimate = (await estimateResponse.json()).label;
  } catch (_) {
    clientState.menu = [];
  }
  clientRender();
}
clientRender();
loadClientMenu();
setInterval(loadClientMenu, 5000);
