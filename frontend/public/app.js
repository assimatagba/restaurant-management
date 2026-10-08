let savedSession = JSON.parse(localStorage.getItem('epicea-back-office-session') || 'null');
let currentTheme = localStorage.getItem('epicea-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day');
document.documentElement.dataset.theme = currentTheme;
const nativeFetch = window.fetch.bind(window);
window.fetch = (resource, options = {}) => {
  const url = String(resource);
  if (savedSession?.token && url.includes('/api/') && !url.includes('/api/auth/login')) {
    options.headers = { ...(options.headers || {}), Authorization: `Bearer ${savedSession.token}` };
  }
  return nativeFetch(resource, options);
};

const state = {
  activeView: 'dashboard',
  cart: [],
  orderType: 'Sur place',
  orderNote: '',
  orderHistory: null,
  tableModalId: null,
  tableOrderHistory: [],
  tableOrdersLoading: false,
  tableAddMode: false,
  tableCreateMode: false,
  tableMergeMode: false,
  tableUnmergeMode: false,
  tableMergeConfirmMode: false,
  selectedMergeTableIds: [],
  tableNewItemId: 1,
  tableNewQuantity: 1,
  tableNewNote: '',
  selectedTableId: 1,
  filter: 'Tous',
  toast: '',
  selectedOrderId: '#184',
  paymentMethod: 'card',
  dashboard: { revenue: 1284.5, orders: 47, activeOrders: 3, leaveRequests: 2 },
  leaveRequests: [],
  tables: [],
  servers: [],
  serverCalls: [],
  auditLogs: [],
  syncVersion: null,
  session: savedSession,
  orders: [
    { id: '#184', table: 'Table 4', type: 'Sur place', time: '08:12', status: 'reçue', items: ['2× Burger Épicéa', '1× Salade quinoa'], note: 'Allergie : arachides', total: 37.5 },
    { id: '#185', table: 'À emporter', type: 'À emporter', time: '05:28', status: 'préparation', items: ['1× Poulet yassa', '2× Jus bissap'], note: 'Sans piment', total: 22 },
    { id: '#181', table: 'Table 7', type: 'Sur place', time: '18:44', status: 'prête', items: ['3× Thiéboudienne', '1× Eau minérale'], note: '', total: 52 },
  ],
};

const menu = [
  { id: 1, name: 'Poulet yassa', category: 'Plats', price: 14, emoji: '🍗', description: 'Poulet mariné, oignons confits et riz parfumé.', tags: ['Sans gluten', 'Suggestion'] },
  { id: 2, name: 'Thiéboudienne', category: 'Plats', price: 16, emoji: '🐟', description: 'Poisson, riz rouge et légumes de saison.', tags: ['Sans gluten'] },
  { id: 3, name: 'Burger Épicéa', category: 'Plats', price: 15.5, emoji: '🍔', description: 'Bœuf grillé, cheddar, oignons et sauce maison.', tags: [] },
  { id: 4, name: 'Salade quinoa', category: 'Entrées', price: 8.5, emoji: '🥗', description: 'Avocat, légumes croquants et vinaigrette citron.', tags: ['Végétarien', 'Sans gluten'] },
  { id: 5, name: 'Pastels de poisson', category: 'Entrées', price: 7, emoji: '🥟', description: 'Beignets croustillants, sauce tomate épicée.', tags: [] },
  { id: 6, name: 'Café gourmand', category: 'Desserts', price: 7.5, emoji: '☕', description: 'Assortiment de douceurs du jour.', tags: ['Végétarien'] },
];
const API_BASE = '/api';

const nav = [
  ['dashboard', '▦', 'Vue d’ensemble'], ['kitchen', '♨', 'Cuisine'],
  ['servers', '♙', 'Serveurs'], ['history', '▤', 'Historique des commandes'], ['cashier', '▣', 'Caisse'], ['manager', '⚙', 'Manager'], ['hr', '♧', 'Ressources humaines'],
];
const serverNav = [['front', '◉', 'Menu'], ['kitchen', '♨', 'Cuisine'], ['servers', '♙', 'Tables'], ['history', '▤', 'Historique des commandes'], ['account', '◉', 'Mon compte'], ['logout', '↪', 'Déconnexion']];
function navigationForCurrentUser() { return state.session?.user?.role === 'server' ? serverNav : nav; }

function euros(value) { return `${value.toFixed(2).replace('.', ',')} €`; }
function cartTotal() { return state.cart.reduce((total, item) => total + item.price * item.quantity, 0); }
function getTitle() { return ({ dashboard: 'Bon retour, Amadou', front: 'Votre table, votre rythme', kitchen: 'Écran cuisine', history: 'Historique des commandes', account: 'Mon compte', servers: 'Plan de salle', cashier: 'Caisse', manager: 'Pilotage du restaurant', hr: 'Espace personnel' })[state.activeView]; }
function showToast(message) { state.toast = message; render(); setTimeout(() => { state.toast = ''; render(); }, 2600); }

function layout(content) {
  return `<div class="shell">
    <aside class="sidebar"><a class="brand" href="#" onclick="go('dashboard')"><span>✦</span> épicéa</a>
      <div class="restaurant"><small>ÉTABLISSEMENT</small><strong>Épicéa Dakar</strong><span class="service-dot">● Service midi ouvert</span></div>
      <nav>${navigationForCurrentUser().map(([id, icon, label]) => `<button class="nav-item ${state.activeView === id ? 'active' : ''}" aria-label="${label}" title="${label}" onclick="go('${id}')"><i>${icon}</i><span>${label}</span></button>`).join('')}</nav>
      <div class="profile"><div class="avatar">${state.session?.user?.display_name?.split(' ').map(word => word[0]).join('').slice(0,2) || 'AD'}</div><div><strong>${state.session?.user?.display_name || 'Amadou Diallo'}</strong><small>${state.session?.user?.is_super_admin ? 'Super administrateur' : ({ server: 'Serveur', cashier: 'Caissier', manager: 'Manager' }[state.session?.user?.role] || 'Équipe')}</small></div></div>
    </aside>
    <main><header><div><p class="eyebrow">MERCREDI 18 SEPTEMBRE</p><h1>${getTitle()}</h1></div><div class="header-actions"><button class="icon-button">⌕</button><button class="icon-button notification">♢</button><button class="date-button">☀ Service du midi <b>⌄</b></button></div></header>${content}</main>
    ${state.toast ? `<div class="toast">✓ ${state.toast}</div>` : ''}</div>`;
}

function dashboard() { return layout(`<section class="hero"><div><span class="pill">● En direct</span><h2>Le service se déroule<br/>parfaitement bien.</h2><p>12 tables occupées · ${state.dashboard.activeOrders} commandes en cuisine</p></div><div class="hero-art">🍽️</div></section>
<section class="metric-grid"><article><span>Chiffre d’affaires</span><strong>${euros(state.dashboard.revenue)}</strong><em>↗ 12,5 % <b>vs. mercredi dernier</b></em></article><article><span>Commandes</span><strong>${state.dashboard.orders}</strong><em>↗ 8,1 % <b>depuis l’ouverture</b></em></article><article><span>Panier moyen</span><strong>27,33 €</strong><em>↗ 3,2 % <b>vs. mercredi dernier</b></em></article><article><span>Temps moyen</span><strong>18 min</strong><em class="warning">● ${state.dashboard.leaveRequests} alertes à traiter</em></article></section>
<section class="two-columns"><article class="panel"><div class="panel-title"><div><h3>Flux des commandes</h3><p>Aujourd’hui, par créneau</p></div><select><option>Cette semaine</option></select></div><div class="chart"><div style="height:32%"></div><div style="height:49%"></div><div style="height:71%"></div><div style="height:58%"></div><div style="height:86%"></div><div style="height:65%"></div><div style="height:39%"></div></div><div class="chart-labels"><span>11h</span><span>12h</span><span>13h</span><span>14h</span><span>15h</span><span>16h</span><span>17h</span></div></article>
<article class="panel"><div class="panel-title"><div><h3>À surveiller</h3><p>Actions nécessitant votre attention</p></div><button class="text-button" onclick="go('kitchen')">Tout voir</button></div><div class="watch-item urgent"><span>!</span><div><strong>Commande #181 en attente</strong><p>Table 7 · Prête depuis 6 min</p></div><button onclick="showToast('Serveur notifié')">Notifier</button></div><div class="watch-item"><span>◷</span><div><strong>2 demandes de congés</strong><p>À traiter avant vendredi</p></div><button onclick="go('hr')">Voir</button></div></article></section>`); }

function front() {
  const availableMenu = menu.filter(x => x.available !== false);
  const filtered = state.filter === 'Tous' ? availableMenu : availableMenu.filter(x => x.category === state.filter || x.tags.includes(state.filter));
  return layout(`<section class="front-banner"><div><span class="pill light">✦ SUGGESTION DU CHEF</span><h2>Poulet yassa<br/><i>et son riz parfumé</i></h2><p>Une recette généreuse à partager, préparée avec amour.</p><button class="button light-button" onclick="addToCart(1)">Ajouter au panier · 14,00 €</button></div><div class="dish-large">🍗</div></section><div class="front-layout"><section><div class="section-heading"><div><h2>La carte</h2><p>Choisissez vos envies du moment</p></div><div class="estimate">◷ Préparation estimée : <b>20–30 min</b></div></div><div class="chips">${['Tous', 'Entrées', 'Plats', 'Desserts', 'Végétarien', 'Sans gluten'].map(f => `<button class="chip ${state.filter === f ? 'selected' : ''}" onclick="setFilter('${f}')">${f}</button>`).join('')}</div><div class="menu-grid">${filtered.map(item => `<article class="menu-card"><div class="food-image">${item.emoji}${item.tags.includes('Suggestion') ? '<span>★ Plat du jour</span>' : ''}</div><div class="menu-info"><div><h3>${item.name}</h3><p>${item.description}</p><div class="tags">${item.tags.filter(t => t !== 'Suggestion').map(t => `<span>${t}</span>`).join('')}</div></div><div class="price-row"><b>${euros(item.price)}</b><button class="add-button" onclick="addToCart(${item.id})">+</button></div></div></article>`).join('')}</div></section><aside class="cart"><div class="cart-heading"><h3>Votre commande</h3><span>${state.cart.reduce((n,i) => n+i.quantity, 0)} article${state.cart.length !== 1 ? 's' : ''}</span></div>${state.cart.length ? `<div class="cart-items">${state.cart.map(i => `<div><span>${i.quantity}×</span><p>${i.name}</p><b>${euros(i.price*i.quantity)}</b><button onclick="removeFromCart(${i.id})">×</button></div>`).join('')}</div>` : `<div class="empty-cart">Votre panier est vide<br/><small>Ajoutez un plat pour commencer.</small></div>`}${state.orderType === 'Sur place' ? `<div class="table-select-wrap"><label>Table</label><select class="table-select" onchange="setSelectedTable(Number(event.target.value))">${(state.tables.length ? state.tables : [{ id: 1, number: 1, capacity: 2 }, { id: 2, number: 2, capacity: 4 }, { id: 3, number: 3, capacity: 2 }, { id: 4, number: 4, capacity: 4 }, { id: 5, number: 5, capacity: 2 }, { id: 6, number: 6, capacity: 6 }, { id: 7, number: 7, capacity: 4 }, { id: 8, number: 8, capacity: 2 }]).map(table => `<option value="${table.id}" ${Number(state.selectedTableId) === Number(table.id) ? 'selected' : ''}>Table ${table.number} · ${table.capacity} pers.</option>`).join('')}</select></div>` : ''}<div class="order-note-wrap"><label>Note pour la cuisine</label><textarea class="order-note" rows="2" placeholder="Ex. sans sel, bien cuit, pas trop épicé..." onchange="setOrderNote(event.target.value)" oninput="setOrderNote(event.target.value)">${state.orderNote}</textarea></div><div class="order-type"><button class="${state.orderType === 'Sur place' ? 'active' : ''}" onclick="setOrderType('Sur place')">♨ Sur place</button><button class="${state.orderType === 'À emporter' ? 'active' : ''}" onclick="setOrderType('À emporter')">▣ À emporter</button></div><div class="cart-total"><span>Total</span><b>${euros(cartTotal())}</b></div><button class="button full" ${!state.cart.length ? 'disabled' : ''} onclick="sendOrder()">Valider ma commande →</button><p class="cart-note">Votre commande sera envoyée en cuisine après validation.</p></aside></div>`); }

function kitchen() {
  const isServer = state.session?.user?.role === 'server';
  const columns = [['reçue','Reçues','Démarrer'],['préparation','En préparation','Marquer prête'],['prête','Prêtes','Marquer servie']];
  const activeOrders = state.orders.filter(order => ['reçue', 'préparation', 'prête'].includes(order.status));
  const renderOrder = (order, status, action) => {
    const isReadyForService = status === 'prête';
    const serverCanServe = isServer && isReadyForService;
    const canAct = !isServer || serverCanServe;
    const actionLabel = isServer ? (serverCanServe ? 'Commande servie' : 'Suivi uniquement') : action;
    return `<article class="kitchen-card ${order.time === '18:44' ? 'overdue' : ''}"><div class="order-card-head"><div><strong>${order.id}</strong><span>${order.table}</span></div><b>◷ ${order.time}</b></div><ul>${order.items.map(item=>`<li>${item}</li>`).join('')}</ul>${order.note ? `<p class="allergy">⚠ ${order.note}</p>` : ''}<button class="button full ${status === 'prête' ? 'outline' : ''}" ${!canAct ? 'disabled' : ''} onclick="advanceOrder('${order.id}')">${actionLabel}</button></article>`;
  };
  const statusColumns = columns.map(([status,title,action]) => `<div class="kanban-col"><h3><span class="status-dot ${status}"></span>${title}<b>${activeOrders.filter(order=>order.status===status).length}</b></h3>${activeOrders.filter(order=>order.status===status).map(order => renderOrder(order, status, action)).join('') || '<div class="empty-column">Aucune commande</div>'}</div>`).join('');
  return layout(`<div class="kitchen-head"><div class="kitchen-summary"><span>${activeOrders.length} commandes actives</span><b>Temps moyen : 18 min</b></div><button class="button" onclick="showToast('Impression de secours lancée')">▤ Imprimer le flux</button></div><section class="kanban">${statusColumns}</section>`);
}

function orderHistory() {
  const orders = state.orderHistory || state.orders;
  const labels = { reçue: 'Reçue', préparation: 'En préparation', prête: 'Prête', servie: 'Servie', annulée: 'Annulée' };
  const statuses = [...new Set(orders.map(order => order.status))];
  return layout(`<section class="history-toolbar panel"><div><h2>Historique des commandes</h2><p>${orders.length} commande(s) enregistrée(s)</p></div><div class="history-filters"><label>Rechercher<input id="history-search" type="search" placeholder="N° de commande, table, plat..." oninput="filterOrderHistory()" /></label><label>Statut<select id="history-status" onchange="filterOrderHistory()"><option value="">Tous les statuts</option>${statuses.map(status => `<option value="${status}">${labels[status] || status}</option>`).join('')}</select></label></div></section><section class="order-history-list" id="order-history-list">${orders.map(order => `<article class="panel order-history-item" data-search="${`${order.id} ${order.table} ${order.type} ${order.items.join(' ')} ${order.note || ''}`.toLocaleLowerCase()}" data-status="${order.status}"><div class="history-order-main"><div><strong>${order.id}</strong><span>${order.date || order.time} · ${order.table} · ${order.type}</span></div><ul>${order.items.map(item => `<li>${item}</li>`).join('')}</ul>${order.note ? `<p class="allergy">⚠ ${order.note}</p>` : ''}</div><div class="history-order-total"><span class="history-status ${order.status}">${order.paymentStatus === 'paid' ? 'Réglée · ' : ''}${labels[order.status] || order.status}</span><strong>${euros(order.total)}</strong></div></article>`).join('') || '<div class="panel empty-cart">Aucune commande enregistrée.</div>'}</section>`);
}

function account() {
  const user = state.session?.user || {};
  const roleLabels = { server: 'Serveur', cashier: 'Caissier', manager: 'Manager' };
  const permissionLabels = { 'order.cancel': 'Annuler une commande', 'order.update': 'Suivre les commandes', 'table.manage': 'Gérer les tables', 'table.view': 'Consulter les tables' };
  const initials = user.display_name?.split(' ').map(part => part[0]).join('').slice(0, 2) || 'S';
  return layout(`<section class="account-page"><div class="account-heading panel"><div class="account-identity"><div class="avatar account-avatar">${initials}</div><div><p class="eyebrow">ESPACE PERSONNEL</p><h2>${user.display_name || 'Serveur'}</h2><span>${roleLabels[user.role] || 'Membre de l’équipe'}</span></div></div><button class="secondary-button" onclick="editMyProfile()">Modifier mes informations</button></div><section class="account-details panel"><h3>Informations personnelles</h3><dl><div><dt>Nom complet</dt><dd>${user.display_name || 'Non renseigné'}</dd></div><div><dt>Adresse e-mail</dt><dd>${user.email || 'Non renseignée'}</dd></div><div><dt>Profil</dt><dd>${roleLabels[user.role] || 'Membre de l’équipe'}</dd></div><div><dt>Identifiant employé</dt><dd>${user.employee_id ?? 'Non renseigné'}</dd></div><div><dt>État du compte</dt><dd><span class="account-state ${user.active ? 'is-active' : ''}">${user.active ? 'Actif' : 'Inactif'}</span></dd></div></dl><div class="account-permissions"><h3>Autorisations</h3><ul>${(user.permissions || []).map(permission => `<li>${permissionLabels[permission] || permission}</li>`).join('') || '<li>Aucune autorisation renseignée</li>'}</ul></div></section></section>`);
}

function filterOrderHistory() {
  const query = document.getElementById('history-search').value.trim().toLocaleLowerCase();
  const status = document.getElementById('history-status').value;
  document.querySelectorAll('.order-history-item').forEach(order => {
    order.hidden = (query && !order.dataset.search.includes(query)) || (status && order.dataset.status !== status);
  });
}

function servers() { return layout(`<section class="floor-toolbar"><div class="legend"><span><i class="free"></i>Libre</span><span><i class="occupied"></i>Occupée</span><span><i class="bill"></i>Addition demandée</span><span><i class="clean"></i>À nettoyer</span></div><button class="button" onclick="showToast('Nouvelle commande ouverte')">＋ Prendre une commande</button></section><section class="floor-layout"><article class="floor-plan"><div class="room-label bar">BAR</div><div class="table-grid"><button class="table free">1<span>2 pers.</span></button><button class="table occupied">2<span>4 pers.</span><i>●</i></button><button class="table occupied round">3<span>2 pers.</span></button><button class="table bill">4<span>4 pers.</span><i>€</i></button><button class="table free round">5<span>2 pers.</span></button><button class="table occupied">6<span>6 pers.</span></button><button class="table clean">7<span>4 pers.</span></button><button class="table occupied round">8<span>2 pers.</span></button></div><div class="room-label terrace">TERRASSE</div></article><aside class="panel table-detail"><span class="eyebrow">TABLE 4</span><h2>Lucas M.</h2><p>4 couverts · occupée depuis 12:18</p><hr/><div class="table-order"><b>Commande #184</b><span>En préparation</span><p>2× Burger Épicéa<br/>1× Salade quinoa</p><strong>37,50 €</strong></div><div class="allergy">⚠ Allergie signalée : arachides</div><button class="button full" onclick="showToast('La demande d’addition a été envoyée à la caisse')">Demander l’addition</button><button class="secondary-button full" onclick="showToast('Table réassignée')">Réassigner la table</button><button class="text-button centered" onclick="cancelFirstOrder()">Annuler la commande (audité)</button></aside></section>`); }

function cashier() { const selected = state.orders.find(order => order.id === state.selectedOrderId) || state.orders[0]; if (!selected) return layout('<div class="panel"><h2>Aucune commande à encaisser</h2></div>'); return layout(`<section class="cashier-grid"><article class="panel orders-list"><div class="panel-title"><div><h3>Commandes à encaisser</h3><p>${state.orders.length} commande(s) en attente de règlement</p></div><button class="text-button">Filtres ⌄</button></div>${state.orders.map(o => `<button class="cash-order ${o.id===selected.id?'chosen':''}" onclick="selectCashOrder('${o.id}')"><span class="table-number">${o.table.replace('Table ','T.')}</span><div><strong>${o.id} · ${o.type}</strong><p>${o.items.join(' · ')}</p></div><b>${euros(o.total)}</b><i>›</i></button>`).join('')}</article><article class="panel payment"><span class="eyebrow">COMMANDE ${selected.id} · ${selected.table.toUpperCase()}</span><h2>${euros(selected.total)}</h2><div class="receipt-line"><span>Sous-total</span><b>${euros(selected.total)}</b></div><div class="receipt-line"><span>TVA incluse</span><b>${euros(selected.total * .1)}</b></div><hr/><h3>Mode de règlement</h3><div class="payment-methods"><button class="${state.paymentMethod==='card'?'selected':''}" onclick="setPaymentMethod('card')">▣<span>Carte</span></button><button class="${state.paymentMethod==='cash'?'selected':''}" onclick="setPaymentMethod('cash')">▤<span>Espèces</span></button><button class="${state.paymentMethod==='mobile_money'?'selected':''}" onclick="setPaymentMethod('mobile_money')">◉<span>Mobile money</span></button></div><button class="button full" onclick="paySelectedOrder()">Encaisser ${euros(selected.total)}</button><button class="text-button centered" onclick="showToast('Division de l’addition ouverte')">Diviser l’addition</button></article></section>`); }

function manager() { return layout(`<section class="settings-grid"><article class="panel setting-menu"><h3>Administration</h3>${['Carte et disponibilité','Plan de salle','Réservations','Utilisateurs & permissions','Journal d’audit','Paramètres du service'].map((x,i)=>`<button class="${i===0?'selected':''}">${x}<span>›</span></button>`).join('')}</article><article class="panel menu-management"><div class="panel-title"><div><h3>Carte et disponibilité</h3><p>Les modifications sont publiées instantanément.</p></div><button class="button" onclick="showToast('Formulaire de création à venir')">＋ Ajouter un plat</button></div><div class="menu-table"><div class="table-head"><span>PLAT</span><span>CATÉGORIE</span><span>PRIX</span><span>DISPONIBILITÉ</span></div>${menu.slice(0,4).map(m=>`<div><span><i class="mini-food">${m.emoji}</i><b>${m.name}</b>${m.featured?'<em>★ Plat du jour</em>':''}</span><span>${m.category}</span><span>${euros(m.price)}</span><button class="toggle ${m.available===false?'off':''}" onclick="toggleAvailability(${m.id})"><i></i></button></div>`).join('')}</div></article></section>`); }

function hr() { const requests = state.leaveRequests.filter(request => request.status === 'pending'); return layout(`<section class="hr-cards"><article class="panel employee-card"><div class="avatar large">AD</div><div><span class="eyebrow">MON ESPACE</span><h2>Amadou Diallo</h2><p>Manager · CDI depuis mars 2023</p></div><button class="secondary-button">Modifier mon profil</button></article><article class="panel leave-balance"><span>Congés disponibles</span><strong>18<small> jours</small></strong><p>Sur la période 2026</p><button class="text-button" onclick="showToast('Demande de congé créée')">+ Poser un congé</button></article></section><section class="two-columns"><article class="panel schedule"><div class="panel-title"><div><h3>Mon planning</h3><p>Du 16 au 22 septembre</p></div><button class="text-button">Voir tout</button></div>${[['Lun. 16','Repos'],['Mar. 17','11:00 — 15:00 · 18:00 — 23:00'],['Mer. 18','11:00 — 15:00 · 18:00 — 23:00'],['Jeu. 19','11:00 — 15:00']].map(([day,hours])=>`<div class="shift"><b>${day}</b><span class="${hours==='Repos'?'rest':''}">${hours}</span></div>`).join('')}</article><article class="panel"><div class="panel-title"><div><h3>Demandes à valider</h3><p>${requests.length} demande(s) en attente</p></div></div>${requests.length ? requests.map(request => `<div class="leave-request"><div class="avatar">${request.employee_name.split(' ').map(part => part[0]).join('')}</div><div><b>${request.employee_name}</b><p>${request.reason} · ${request.start_date} au ${request.end_date}</p></div><button class="approve" onclick="decideLeave(${request.id}, 'approved')">✓</button><button class="decline" onclick="decideLeave(${request.id}, 'rejected')">×</button></div>`).join('') : '<div class="empty-cart">Aucune demande en attente.</div>'}</article></section>`); }

function manager() { const audit = state.auditLogs.slice(0, 4); return layout(`<section class="metric-grid"><article><span>CA encaissé</span><strong>${euros(state.dashboard.revenue)}</strong><em>● Données du service</em></article><article><span>Commandes actives</span><strong>${state.dashboard.activeOrders}</strong><em>↗ Suivi cuisine</em></article><article><span>Demandes RH</span><strong>${state.dashboard.leaveRequests}</strong><em>● À traiter</em></article><article><span>État du service</span><strong>Ouvert</strong><em>● Service midi</em></article></section><section class="two-columns"><article class="panel"><div class="panel-title"><div><h3>Pilotage du service</h3><p>Actions formelles de début et fin de service.</p></div></div><div class="watch-item"><span>☀</span><div><strong>Service du midi</strong><p>Ouvert par Amadou Diallo</p></div><button onclick="openService()">Ouvrir</button></div><div class="watch-item urgent"><span>€</span><div><strong>Clôturer et rapprocher</strong><p>Compare les encaissements aux commandes réglées.</p></div><button onclick="closeService()">Clôturer</button></div><div class="watch-item"><span>⌁</span><div><strong>Comptes et permissions</strong><p>Créez les comptes et attribuez les droits granulaires.</p></div><button onclick="manageUsers()">Gérer</button></div></article><article class="panel"><div class="panel-title"><div><h3>Journal d’audit</h3><p>Dernières actions sensibles</p></div></div>${audit.length ? audit.map(log => `<div class="watch-item"><span>✓</span><div><strong>${log.action}</strong><p>${log.actor} · ${log.target}</p></div></div>`).join('') : '<div class="empty-cart">Aucune action récente.</div>'}</article></section><section class="panel menu-management"><div class="panel-title"><div><h3>Carte et disponibilité</h3><p>Les changements sont immédiatement transmis au Front Office.</p></div><button class="button" onclick="createMenuItem()">＋ Ajouter un plat</button></div><div class="menu-table"><div class="table-head"><span>PLAT</span><span>CATÉGORIE</span><span>PRIX</span><span>DISPONIBILITÉ</span></div>${menu.map(m=>`<div><span><i class="mini-food">${m.emoji}</i><b>${m.name}</b>${m.featured?'<em>★ Plat du jour</em>':''}</span><span>${m.category}</span><span>${euros(m.price)}</span><button class="toggle ${m.available===false?'off':''}" onclick="toggleAvailability(${m.id})"><i></i></button></div>`).join('')}</div></section>`); }
function servers() { const tables = state.tables.length ? state.tables : [{id:1,number:1,capacity:2,status:'free'},{id:2,number:2,capacity:4,status:'occupied'},{id:3,number:3,capacity:2,status:'occupied'},{id:4,number:4,capacity:4,status:'occupied'},{id:5,number:5,capacity:2,status:'free'},{id:6,number:6,capacity:6,status:'occupied'},{id:7,number:7,capacity:4,status:'cleaning'},{id:8,number:8,capacity:2,status:'occupied'}]; const statusClass = { free:'free', occupied:'occupied', reserved:'bill', cleaning:'clean' }; return layout(`<section class="floor-toolbar"><div class="legend"><span><i class="free"></i>Libre</span><span><i class="occupied"></i>Occupée</span><span><i class="bill"></i>Réservée</span><span><i class="clean"></i>À nettoyer</span></div><button class="button" onclick="showToast('Prise de commande : utilisez le Front Office ou l’API')">＋ Prendre une commande</button></section><section class="floor-layout"><article class="floor-plan"><div class="room-label bar">BAR</div><div class="table-grid">${tables.map(table => `<button class="table ${statusClass[table.status] || 'free'} ${table.number % 3 === 0 ? 'round' : ''}" onclick="showTableHistory(${table.id})">${table.number}<span>${table.capacity} pers.</span>${table.server_name ? '<i>●</i>' : ''}</button>`).join('')}</div><div class="room-label terrace">TERRASSE</div></article><aside class="panel table-detail"><span class="eyebrow">ALERTES SALLE</span><h2>${state.serverCalls.length} appel(s)</h2><p>Les demandes client remontent ici immédiatement.</p><hr/>${state.serverCalls.slice(0,3).map(call => `<div class="table-order"><b>Table ${call.table_number || '—'}</b><span>${call.request_type === 'bill' ? 'Addition' : 'Assistance'}</span><p>Demande en attente</p></div>`).join('') || '<p>Aucune demande en attente.</p>'}<button class="button full" onclick="reassignTable()">Réassigner une table</button><button class="secondary-button full" onclick="mergeTables()">Fusionner deux tables</button><button class="text-button centered" onclick="cancelFirstOrder()">Annuler une commande (audité)</button></aside></section>`); }
function cashier() { const selected = state.orders.find(order => order.id === state.selectedOrderId) || state.orders[0]; return layout(`<section class="cashier-grid"><article class="panel orders-list"><div class="panel-title"><div><h3>Commandes à encaisser</h3><p>${state.orders.length} commande(s) en attente</p></div><button class="text-button" onclick="createReservation()">+ Réservation</button></div>${state.orders.map(o => `<button class="cash-order ${selected && o.id===selected.id?'chosen':''}" onclick="selectCashOrder('${o.id}')"><span class="table-number">${o.table.replace('Table ','T.')}</span><div><strong>${o.id} · ${o.type}</strong><p>${o.items.join(' · ')}</p></div><b>${euros(o.total)}</b><i>›</i></button>`).join('') || '<div class="empty-cart">Aucune commande à encaisser.</div>'}</article><article class="panel payment">${selected ? `<span class="eyebrow">COMMANDE ${selected.id} · ${selected.table.toUpperCase()}</span><h2>${euros(selected.total)}</h2><div class="receipt-line"><span>Montant dû</span><b>${euros(selected.total)}</b></div><hr/><h3>Mode de règlement</h3><div class="payment-methods"><button class="${state.paymentMethod==='card'?'selected':''}" onclick="setPaymentMethod('card')">▣<span>Carte</span></button><button class="${state.paymentMethod==='cash'?'selected':''}" onclick="setPaymentMethod('cash')">▤<span>Espèces</span></button><button class="${state.paymentMethod==='mobile_money'?'selected':''}" onclick="setPaymentMethod('mobile_money')">◉<span>Mobile money</span></button></div><button class="button full" onclick="paySelectedOrder()">Encaisser ${euros(selected.total)}</button><button class="text-button centered" onclick="splitPayment()">Diviser l’addition</button>` : '<h2>Caisse à jour</h2><p>Toutes les commandes ont été encaissées.</p>'}<hr/><button class="secondary-button full" onclick="openCashRegister()">Ouvrir la caisse</button><button class="secondary-button full" onclick="closeCashRegister()">Clôturer la caisse</button><button class="text-button centered" onclick="configureWaitTime()">Configurer le temps d’attente</button></article></section>`); }
function loginScreen() { return `<main class="auth-page"><section class="auth-card"><a class="brand" href="/"><span>✦</span> épicéa</a><p class="eyebrow">BACK OFFICE SÉCURISÉ</p><h1>Connexion à votre espace</h1><p>Utilisez vos identifiants personnels pour accéder aux opérations du restaurant.</p><form onsubmit="login(event)"><label>Adresse email<input id="login-email" type="email" value="admin@epicea.local" required autocomplete="username" /></label><label>Mot de passe<input id="login-password" type="password" value="Admin2026!" required autocomplete="current-password" /></label><button class="button full" type="submit">Se connecter</button></form><p class="auth-hint">Démo super administrateur : admin@epicea.local</p></section></main>`; }
function servers() {
  const tables = state.tables.length ? state.tables : [
    { id: 1, number: 1, capacity: 2, status: 'free', server_name: null },
    { id: 2, number: 2, capacity: 4, status: 'occupied', server_name: 'Mariam Sarr' },
    { id: 3, number: 3, capacity: 2, status: 'occupied', server_name: 'Mariam Sarr' },
    { id: 4, number: 4, capacity: 4, status: 'occupied', server_name: 'Amadou Diallo' },
    { id: 5, number: 5, capacity: 2, status: 'free', server_name: null },
    { id: 6, number: 6, capacity: 6, status: 'occupied', server_name: 'Khadim Ba' },
    { id: 7, number: 7, capacity: 4, status: 'cleaning', server_name: null },
    { id: 8, number: 8, capacity: 2, status: 'occupied', server_name: 'Khadim Ba' },
  ];
  const statusClass = { free: 'free', occupied: 'occupied', reserved: 'bill', cleaning: 'clean' };
  const serverList = (state.servers.length ? state.servers : [...new Set(tables.map(table => table.server_name).filter(Boolean))].map((display_name, id) => ({ id, display_name })));
  return layout(`<section class="floor-toolbar"><div class="floor-toolbar-copy"><p>Sélectionnez une table pour consulter ou gérer sa commande.</p>${state.tableMergeMode ? `<p class="table-merge-instruction">Sélectionnez au moins deux tables sur le plan (${state.selectedMergeTableIds.length} sélectionnée(s)).</p>` : ''}</div><div class="floor-toolbar-actions"><button class="button" type="button" onclick="openTableCreateModal()">＋ Ajouter une table</button>${state.tableMergeMode ? `<button class="secondary-button" type="button" ${state.selectedMergeTableIds.length < 2 ? 'disabled title="Sélectionnez au moins deux tables."' : ''} onclick="openTableMergeModal()">⇄ Fusionner ${state.selectedMergeTableIds.length} tables</button><button class="text-button" type="button" onclick="cancelTableMergeSelection()">Annuler</button>` : `<button class="secondary-button" type="button" onclick="startTableMerge()">⇄ Fusionner des tables</button>`}</div><div class="legend"><span><i class="free"></i>Libre</span><span><i class="occupied"></i>Occupée</span><span><i class="bill"></i>Réservée</span><span><i class="clean"></i>À nettoyer</span></div></section><section class="floor-layout"><article class="floor-plan"><div class="room-label bar">BAR</div><div class="table-grid">${tables.map(table => { const selected = state.selectedMergeTableIds.includes(table.id); const action = state.tableMergeMode ? `toggleMergeTable(${table.id})` : `openTableModal(${table.id})`; return `<button class="table ${statusClass[table.status] || 'free'} ${table.number % 3 === 0 ? 'round' : ''} ${state.tableMergeMode ? 'merge-selectable' : ''} ${selected ? 'merge-selected' : ''}" aria-label="Table ${table.number}, ${({free:'libre',occupied:'occupée',reserved:'réservée',cleaning:'à nettoyer'})[table.status] || table.status}${selected ? ', sélectionnée' : ''}" ${state.tableMergeMode ? `aria-pressed="${selected}"` : ''} onclick="${action}">${table.number}<span>${table.capacity} pers.</span>${table.server_name ? '<i>●</i>' : ''}</button>`; }).join('')}</div><div class="room-label terrace">TERRASSE</div></article><aside class="servers-panel"><div class="servers-panel-heading"><h3>Serveurs</h3><span>${serverList.length}</span></div>${serverList.map(server => { const assigned = tables.filter(table => table.server_name === server.display_name); const initials = server.display_name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(); return `<div class="server-row"><span class="server-avatar">${initials}</span><div><strong>${server.display_name}</strong><p>${assigned.length ? `Tables ${assigned.map(table => table.number).join(', ')}` : 'Aucune table affectée'}</p></div><span class="server-table-count">${assigned.length}</span></div>`; }).join('') || '<p class="servers-empty">Aucun serveur enregistré.</p>'}</aside></section>${state.tableModalId ? tableModal() : ''}${state.tableCreateMode ? tableCreateModal() : ''}${state.tableMergeConfirmMode ? tableMergeModal() : ''}`);
}

function servers() {
  const tables = state.tables.length ? state.tables : [
    { id: 1, number: 1, capacity: 2, status: 'free' }, { id: 2, number: 2, capacity: 4, status: 'occupied', server_name: 'Mariam Sarr' },
    { id: 3, number: 3, capacity: 2, status: 'occupied', server_name: 'Mariam Sarr' }, { id: 4, number: 4, capacity: 4, status: 'occupied', server_name: 'Amadou Diallo' },
  ];
  const label = table => table.display_number || table.number;
  const statusClass = { free: 'free', occupied: 'occupied', reserved: 'bill', cleaning: 'clean' };
  const serverList = state.servers.length ? state.servers : [...new Set(tables.map(table => table.server_name).filter(Boolean))].map((display_name, id) => ({ id, display_name }));
  const mergeHint = state.tableMergeMode ? `<p class="table-merge-instruction">Sélectionnez au moins deux tables (${state.selectedMergeTableIds.length} sélectionnée(s)).</p>` : '';
  const unmergeHint = state.tableUnmergeMode ? '<p class="table-merge-instruction">Sélectionnez une table fusionnée pour la dissocier.</p>' : '';
  const mergeActions = state.tableMergeMode
    ? `<button class="secondary-button" type="button" ${state.selectedMergeTableIds.length < 2 ? 'disabled' : ''} onclick="openTableMergeModal()">Fusionner ${state.selectedMergeTableIds.length} tables</button><button class="text-button" type="button" onclick="cancelTableMergeSelection()">Annuler</button>`
    : state.tableUnmergeMode
      ? `<button class="secondary-button" type="button" disabled>Dissocier une fusion</button><button class="text-button" type="button" onclick="cancelTableUnmergeSelection()">Annuler</button>`
      : `<button class="secondary-button" type="button" onclick="startTableMerge()">⇄ Fusionner des tables</button><button class="secondary-button" type="button" ${tables.some(table => table.merged_table_ids?.length > 1) ? '' : 'disabled title="Aucune fusion active"'} onclick="startTableUnmerge()">Dissocier une fusion</button>`;
  return layout(`<section class="floor-toolbar"><div class="floor-toolbar-copy"><p>Sélectionnez une table pour consulter ou gérer sa commande.</p>${mergeHint}${unmergeHint}</div><div class="floor-toolbar-actions"><button class="button" type="button" onclick="openTableCreateModal()">＋ Ajouter une table</button>${mergeActions}</div><div class="legend"><span><i class="free"></i>Libre</span><span><i class="occupied"></i>Occupée</span><span><i class="bill"></i>Réservée</span><span><i class="clean"></i>À nettoyer</span></div></section><section class="floor-layout"><article class="floor-plan"><div class="room-label bar">BAR</div><div class="table-grid">${tables.map(table => { const selected = state.selectedMergeTableIds.includes(table.id); const action = state.tableMergeMode ? `toggleMergeTable(${table.id})` : state.tableUnmergeMode ? (table.merged_table_ids?.length > 1 ? `unmergeTable(${table.id})` : 'showToast(\'Cette table ne fait pas partie d’une fusion\')') : `openTableModal(${table.id})`; return `<button class="table ${statusClass[table.status] || 'free'} ${table.number % 3 === 0 ? 'round' : ''} ${state.tableMergeMode || state.tableUnmergeMode ? 'merge-selectable' : ''} ${selected ? 'merge-selected' : ''}" ${state.tableMergeMode ? `aria-pressed="${selected}"` : ''} onclick="${action}">${label(table)}<span>${table.capacity} pers.</span>${table.server_name ? '<i>●</i>' : ''}</button>`; }).join('')}</div><div class="room-label terrace">TERRASSE</div></article><aside class="servers-panel"><div class="servers-panel-heading"><h3>Serveurs</h3><span>${serverList.length}</span></div>${serverList.map(server => { const assigned = tables.filter(table => table.server_name === server.display_name); const initials = server.display_name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(); return `<div class="server-row"><span class="server-avatar">${initials}</span><div><strong>${server.display_name}</strong><p>${assigned.length ? `Tables ${assigned.map(label).join(', ')}` : 'Aucune table affectée'}</p></div><span class="server-table-count">${assigned.length}</span></div>`; }).join('') || '<p class="servers-empty">Aucun serveur enregistré.</p>'}</aside></section>${state.tableModalId ? tableModal() : ''}${state.tableCreateMode ? tableCreateModal() : ''}${state.tableMergeConfirmMode ? tableMergeModal() : ''}`);
}

function tableCreateModal() {
  const knownNumbers = state.tables.length ? state.tables.map(table => table.number) : [1, 2, 3, 4, 5, 6, 7, 8];
  const nextNumber = Math.max(0, ...knownNumbers) + 1;
  return `<div class="table-modal-backdrop" role="presentation" onclick="if(event.target===this)closeTableCreateModal()"><section class="table-modal table-create-modal" role="dialog" aria-modal="true" aria-labelledby="table-create-title"><header class="table-modal-header"><div><p class="eyebrow">PLAN DE SALLE</p><h2 id="table-create-title">Ajouter une table</h2></div><button class="icon-button" type="button" aria-label="Fermer" onclick="closeTableCreateModal()">×</button></header><div class="table-create-number"><span>NUMÉRO ATTRIBUÉ AUTOMATIQUEMENT</span><strong>Table ${nextNumber}</strong><small>Le prochain numéro sera utilisé lors de la création.</small></div><form class="table-create-form" onsubmit="submitTableCreate(event)"><label for="new-table-capacity">Nombre de couverts</label><div class="table-capacity-control"><input id="new-table-capacity" name="capacity" type="number" min="1" max="30" value="2" required /><span>couverts</span></div><p class="table-create-hint">Vous pourrez modifier la capacité du plan de salle ultérieurement.</p><div class="table-create-actions"><button class="secondary-button" type="button" onclick="closeTableCreateModal()">Annuler</button><button class="button" type="submit">＋ Créer la table</button></div></form></section></div>`;
}

function openTableCreateModal() { state.tableMergeMode = false; state.tableUnmergeMode = false; state.selectedMergeTableIds = []; state.tableCreateMode = true; render(); document.getElementById('new-table-capacity')?.focus(); }
function closeTableCreateModal() { state.tableCreateMode = false; render(); }

function tableMergeModal() {
  const selectedTables = state.tables.filter(table => state.selectedMergeTableIds.includes(table.id));
  const defaultTarget = selectedTables[0]?.id;
  return `<div class="table-modal-backdrop" role="presentation" onclick="if(event.target===this)closeTableMergeModal()"><section class="table-modal table-merge-modal" role="dialog" aria-modal="true" aria-labelledby="table-merge-title"><header class="table-modal-header"><div><p class="eyebrow">PLAN DE SALLE</p><h2 id="table-merge-title">Fusionner ${selectedTables.length} tables</h2></div><button class="icon-button" type="button" aria-label="Fermer" onclick="closeTableMergeModal()">×</button></header><div class="table-merge-preview"><span>Tables sélectionnées</span><div>${selectedTables.map(table => `<span class="table-merge-chip">Table ${table.number}</span>`).join('')}</div></div><form class="table-create-form" onsubmit="submitTableMerge(event)"><label for="merge-table-target">Table à conserver</label><select id="merge-table-target" name="target_table_id" required>${selectedTables.map(table => `<option value="${table.id}" ${table.id === defaultTarget ? 'selected' : ''}>Table ${table.number} · ${table.capacity} couverts</option>`).join('')}</select><p class="table-create-hint">Les commandes non réglées seront transférées vers cette table. Les autres tables seront libérées.</p><div class="table-create-actions"><button class="secondary-button" type="button" onclick="closeTableMergeModal()">Retour</button><button class="button" type="submit">Confirmer la fusion</button></div></form></section></div>`;
}

function startTableMerge() { state.tableUnmergeMode = false; state.tableMergeMode = true; state.selectedMergeTableIds = []; render(); }
function startTableUnmerge() { state.tableMergeMode = false; state.tableUnmergeMode = true; state.selectedMergeTableIds = []; render(); }
function cancelTableUnmergeSelection() { state.tableUnmergeMode = false; render(); }
function cancelTableMergeSelection() { state.tableMergeMode = false; state.tableMergeConfirmMode = false; state.selectedMergeTableIds = []; render(); }
function toggleMergeTable(tableId) { const id = Number(tableId); state.selectedMergeTableIds = state.selectedMergeTableIds.includes(id) ? state.selectedMergeTableIds.filter(selectedId => selectedId !== id) : [...state.selectedMergeTableIds, id]; render(); }
function openTableMergeModal() { if (state.selectedMergeTableIds.length < 2) return; state.tableMergeConfirmMode = true; render(); }
function closeTableMergeModal() { state.tableMergeConfirmMode = false; render(); }

async function submitTableMerge(event) {
  event.preventDefault();
  const targetTableId = Number(event.currentTarget.elements.target_table_id.value);
  const tableIds = [...state.selectedMergeTableIds];
  try {
    const response = await fetch(`${API_BASE}/tables/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_ids: tableIds, target_table_id: targetTableId }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Fusion des tables impossible.');
    }
    const result = await response.json();
    state.tableMergeMode = false;
    state.tableMergeConfirmMode = false;
    state.selectedMergeTableIds = [];
    await refreshOperations();
    await syncBackOffice();
    showToast(`${tableIds.length} tables fusionnées vers la table ${state.tables.find(table => table.id === result.target_table_id)?.number || ''}`);
  } catch (error) {
    showToast(error.message || 'Fusion des tables impossible');
  }
}

async function submitTableCreate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = { capacity: Number(form.elements.capacity.value) };
  try {
    const response = await fetch(`${API_BASE}/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Création de table impossible.');
    const table = await response.json();
    state.tables = [...state.tables.filter(item => item.id !== table.id), table].sort((a, b) => a.number - b.number);
    state.tableCreateMode = false;
    render();
    showToast(`Table ${table.number} ajoutée`);
  } catch (error) {
    showToast(error.message || 'Création de table impossible');
  }
}

const orderStatusLabels = { received: 'Reçue', preparing: 'En préparation', ready: 'Prête', served: 'Servie', cancelled: 'Annulée' };

function currentTableOrder() {
  const orders = state.tableOrderHistory.filter(order => order.payment_status === 'unpaid' && order.status !== 'cancelled');
  if (!orders.length) return null;
  const latestOrder = orders[0];
  const groups = new Map();
  for (const order of orders) {
    const tableNumber = order.origin_table_number ?? order.table_number;
    const key = tableNumber ?? '—';
    if (!groups.has(key)) groups.set(key, { table_number: tableNumber, lines: [], total: 0 });
    const group = groups.get(key);
    group.lines.push(...order.lines);
    group.total += order.total;
  }
  return {
    ...latestOrder,
    public_number: orders.length > 1 ? `${latestOrder.public_number} (+${orders.length - 1})` : latestOrder.public_number,
    lines: orders.flatMap(order => order.lines),
    table_groups: [...groups.values()].sort((a, b) => Number(a.table_number) - Number(b.table_number)),
    notes: orders.map(order => order.notes && `${order.public_number}: ${order.notes}`).filter(Boolean).join(' · '),
    total: orders.reduce((total, order) => total + order.total, 0),
  };
}

function syncTableOrderGrouping() {
  const table = state.tables.find(item => item.id === state.tableModalId);
  const order = currentTableOrder();
  const lineList = document.querySelector('.table-current-order > ul');
  if (!table || table.merged_table_ids?.length < 2 || !order?.table_groups?.length || !lineList) return;

  const groups = document.createElement('div');
  groups.className = 'table-order-groups';
  for (const group of order.table_groups) {
    const section = document.createElement('section');
    section.className = 'table-order-group';
    const heading = document.createElement('h4');
    heading.textContent = `Table ${group.table_number ?? '—'}`;
    const list = document.createElement('ul');
    for (const line of group.lines) {
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${line.quantity}× ${line.label}`;
      const price = document.createElement('b');
      price.textContent = euros(line.quantity * line.unit_price);
      item.append(label, price);
      list.append(item);
    }
    section.append(heading, list);
    groups.append(section);
  }
  lineList.replaceWith(groups);
}

function tableModal() {
  const rawTable = state.tables.find(item => item.id === state.tableModalId);
  const table = rawTable && { ...rawTable, number: rawTable.display_number || rawTable.number };
  if (!table) return '';
  const order = currentTableOrder();
  const availableMenu = menu.filter(item => item.available !== false);
  const server = table.server_name || 'Aucun serveur affecté';
  const orderLines = order?.lines || [];
  return `<div class="table-modal-backdrop" role="presentation" onclick="if(event.target===this)closeTableModal()"><section class="table-modal" role="dialog" aria-modal="true" aria-labelledby="table-modal-title"><header class="table-modal-header"><div><p class="eyebrow">PLAN DE SALLE</p><h2 id="table-modal-title">Table ${table.number}</h2></div><button class="icon-button" type="button" aria-label="Fermer" onclick="closeTableModal()">×</button></header><div class="table-modal-summary"><div><span>Serveur assigné</span><strong>${server}</strong></div><div><span>État de la table</span><strong class="table-status-label ${table.status}">${({free:'Libre',occupied:'Occupée',reserved:'Réservée',cleaning:'À nettoyer'})[table.status] || table.status}</strong></div></div>${state.tableOrdersLoading ? '<div class="table-modal-empty">Chargement de la commande…</div>' : order ? `<section class="table-current-order"><div class="table-current-order-heading"><div><p class="eyebrow">COMMANDE ACTUELLE</p><h3>${order.public_number}</h3></div><span class="order-status ${order.status}">${orderStatusLabels[order.status] || order.status}</span></div><ul>${orderLines.map(line => `<li><span>${line.quantity}× ${line.label}</span><b>${euros(line.quantity * line.unit_price)}</b></li>`).join('')}</ul>${order.notes ? `<p class="table-order-note">Note cuisine : ${order.notes}</p>` : ''}<div class="table-order-total"><span>Total</span><strong>${euros(order.total)}</strong></div><button class="secondary-button table-print-button" type="button" onclick="printTableReceipt()">▤ Imprimer le reçu / la facture</button></section>` : '<div class="table-modal-empty">Aucune commande actuelle pour cette table.</div>'}<section class="table-modal-actions"><button class="button" type="button" onclick="toggleTableOrderForm()">＋ Ajouter une commande</button><button class="secondary-button" type="button" ${order ? 'disabled title="La commande doit être réglée avant de libérer la table."' : ''} onclick="releaseTable(${table.id})">Rendre la table disponible</button></section>${order ? '<p class="table-release-hint">Réglez la commande actuelle avant de libérer la table.</p>' : ''}${state.tableAddMode ? `<form class="table-order-form" onsubmit="submitTableOrder(event)"><h3>Nouvelle commande · Table ${table.number}</h3><label>Plat<select required onchange="setTableOrderItem(Number(this.value))">${availableMenu.map(item => `<option value="${item.id}" ${item.id === state.tableNewItemId ? 'selected' : ''}>${item.name} · ${euros(item.price)}</option>`).join('')}</select></label><label>Quantité<input type="number" min="1" max="30" value="${state.tableNewQuantity}" required oninput="state.tableNewQuantity=Number(this.value)" /></label><label>Note pour la cuisine<textarea rows="2" maxlength="500" placeholder="Précisions utiles…" oninput="state.tableNewNote=this.value">${state.tableNewNote}</textarea></label><div class="table-order-form-actions"><button class="button" type="submit">Envoyer en cuisine</button><button class="text-button" type="button" onclick="toggleTableOrderForm(false)">Annuler</button></div></form>` : ''}<section class="table-print-receipt"><h1>Épicéa</h1><p>Reçu de commande</p><hr/><p><b>${order?.public_number || ''}</b> · Table ${table.number}</p><p>Serveur : ${server}</p><p>${order ? orderStatusLabels[order.status] || order.status : ''}</p><hr/>${orderLines.map(line => `<p>${line.quantity}× ${line.label}<span>${euros(line.quantity * line.unit_price)}</span></p>`).join('')}<hr/><p><b>Total</b><b>${order ? euros(order.total) : ''}</b></p>${order?.notes ? `<p>Note : ${order.notes}</p>` : ''}<p>${new Date().toLocaleString('fr-FR')}</p></section></section></div>`;
}

async function openTableModal(tableId) {
  state.tableModalId = Number(tableId);
  state.tableOrderHistory = [];
  state.tableOrdersLoading = true;
  state.tableAddMode = false;
  state.tableNewItemId = menu.find(item => item.available !== false)?.id || 1;
  state.tableNewQuantity = 1;
  state.tableNewNote = '';
  render();
  await loadTableOrders(tableId);
}

async function loadTableOrders(tableId) {
  try {
    const response = await fetch(`${API_BASE}/tables/${tableId}/history`);
    if (!response.ok) throw new Error();
    const history = await response.json();
    if (state.tableModalId !== Number(tableId)) return;
    state.tableOrderHistory = history;
  } catch (_) {
    showToast('Historique de la table indisponible');
  } finally {
    if (state.tableModalId === Number(tableId)) {
      state.tableOrdersLoading = false;
      render();
    }
  }
}

function closeTableModal() { state.tableModalId = null; state.tableAddMode = false; render(); }
function toggleTableOrderForm(show = !state.tableAddMode) { state.tableAddMode = show; render(); }
function setTableOrderItem(itemId) { state.tableNewItemId = Number(itemId); }

function syncTableServerSelect() {
  const summary = [...document.querySelectorAll('.table-modal-summary > div')].find(item => item.querySelector('span')?.textContent === 'Serveur assigné');
  const table = state.tables.find(item => item.id === state.tableModalId);
  if (!summary || !table) return;
  const select = document.createElement('select');
  select.className = 'table-server-select';
  select.setAttribute('aria-label', 'Assigner un serveur à cette table');
  const servers = state.servers.length
    ? state.servers
    : [...new Set(state.tables.map(item => item.server_name).filter(Boolean))].map(display_name => ({ display_name }));
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choisir un serveur';
  select.append(placeholder);
  servers.forEach(server => {
    const option = document.createElement('option');
    option.value = server.display_name;
    option.textContent = server.display_name;
    select.append(option);
  });
  if (table.server_name && !servers.some(server => server.display_name === table.server_name)) {
    const option = document.createElement('option');
    option.value = table.server_name;
    option.textContent = table.server_name;
    select.append(option);
  }
  select.value = table.server_name || '';
  select.addEventListener('change', () => { if (select.value) assignTableServer(select.value); });
  summary.querySelector('strong')?.replaceWith(select);
}

async function assignTableServer(serverName) {
  const table = state.tables.find(item => item.id === state.tableModalId);
  if (!table || !serverName || table.server_name === serverName) return;
  try {
    const response = await fetch(`${API_BASE}/tables/${table.id}/assignment`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server_name: serverName }),
    });
    if (!response.ok) throw new Error();
    table.server_name = serverName;
    render();
    showToast(`${serverName} assigné(e) à la table ${table.number}`);
  } catch (_) {
    showToast('Assignation du serveur impossible');
  }
}

function toggleTheme() {
  currentTheme = currentTheme === 'night' ? 'day' : 'night';
  document.documentElement.dataset.theme = currentTheme;
  localStorage.setItem('epicea-theme', currentTheme);
  syncThemeButton();
}

function syncThemeButton() {
  const actions = document.querySelector('.header-actions');
  if (!actions || actions.querySelector('.theme-toggle')) return;
  const isNight = currentTheme === 'night';
  const button = document.createElement('button');
  button.className = 'icon-button theme-toggle';
  button.type = 'button';
  button.setAttribute('aria-label', isNight ? 'Passer en mode jour' : 'Passer en mode nuit');
  button.title = button.getAttribute('aria-label');
  button.innerHTML = isNight
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/></svg>';
  button.addEventListener('click', toggleTheme);
  const dateButton = actions.querySelector('.date-button');
  actions.insertBefore(button, dateButton || null);
}

async function submitTableOrder(event) {
  event.preventDefault();
  const tableId = state.tableModalId;
  if (!tableId || !state.tableNewQuantity || state.tableNewQuantity > 30) return;
  try {
    const response = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_type: 'dine_in',
        table_id: tableId,
        notes: state.tableNewNote.trim(),
        lines: [{ menu_item_id: state.tableNewItemId, quantity: state.tableNewQuantity }],
      }),
    });
    if (!response.ok) throw new Error();
    state.tableAddMode = false;
    state.tableNewNote = '';
    state.tableNewQuantity = 1;
    await loadTableOrders(tableId);
    await syncBackOffice();
    showToast('Commande envoyée en cuisine');
  } catch (_) {
    showToast('Création de la commande impossible');
  }
}

async function releaseTable(tableId) {
  if (currentTableOrder()) {
    showToast('Réglez la commande actuelle avant de libérer la table');
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/tables/${tableId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'free' }),
    });
    if (!response.ok) throw new Error();
    const table = state.tables.find(item => item.id === tableId);
    if (table) Object.assign(table, { status: 'free', server_name: null });
    try {
      const tablesResponse = await fetch(`${API_BASE}/tables`);
      if (tablesResponse.ok) state.tables = await tablesResponse.json();
    } catch (_) { /* La mise à jour locale reste affichée si le réseau est indisponible. */ }
    if (state.tableModalId === tableId) await loadTableOrders(tableId);
    showToast('Table libérée et disponible');
  } catch (_) {
    showToast('Impossible de libérer la table : vérifiez le règlement');
  }
}

function printTableReceipt() {
  if (!currentTableOrder()) return;
  document.body.classList.add('printing-table-receipt');
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-table-receipt'), { once: true });
  window.print();
}

function syncTableReleaseButton() {
  const button = document.querySelector('.table-modal-actions .secondary-button');
  if (!button || !state.tableModalId) return;
  const table = state.tables.find(item => item.id === state.tableModalId);
  const isAvailable = table?.status === 'free';
  button.disabled = isAvailable;
  button.title = isAvailable ? 'Cette table est déjà disponible.' : '';
}

async function unmergeTable(tableId) {
  if (!confirm('Dissocier cette fusion ? Les tables retrouveront leurs capacités et affectations précédentes.')) return;
  try {
    const response = await fetch(`${API_BASE}/tables/${tableId}/unmerge`, { method: 'POST' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Dissociation impossible.');
    }
    const result = await response.json();
    state.tableModalId = null;
    state.tableOrderHistory = [];
    state.tableUnmergeMode = false;
    state.tables = result.tables;
    await syncBackOffice();
    showToast('Fusion dissociée : les tables sont de nouveau séparées');
  } catch (error) {
    showToast(error.message || 'Dissociation impossible');
  }
}

function syncTableMergeAttribution() {
  const table = state.tables.find(item => item.id === state.tableModalId);
  const header = document.querySelector('.table-modal-header');
  if (!header || !table?.merged_by_name) return;
  const roleLabels = { manager: 'Gérant', superadmin: 'Gérant', server: 'Serveur', cashier: 'Caissier' };
  const attribution = document.createElement('p');
  attribution.className = 'table-merge-attribution';
  const label = document.createElement('span');
  label.textContent = 'Fusion faite par';
  const person = document.createElement('strong');
  person.textContent = `${roleLabels[table.merged_by_role] || 'Équipe'} — ${table.merged_by_name}`;
  attribution.append(label, person);
  header.insertAdjacentElement('afterend', attribution);
}

function render() {
  if (!state.session) { document.getElementById('app').innerHTML = loginScreen(); return; }
  const views = { dashboard, front, kitchen, history: orderHistory, account, servers, cashier, manager, hr };
  document.getElementById('app').innerHTML = views[state.activeView]();
  syncThemeButton();
  syncTableServerSelect();
  syncTableMergeAttribution();
  syncTableOrderGrouping();
  if (state.activeView === 'servers' && state.session.user.role === 'server') {
    const assignButton = document.querySelector('.table-detail .button.full');
    if (assignButton) assignButton.textContent = 'M’assigner une table';
  }
  syncTableReleaseButton();
}
function go(view) { if (view === 'logout') { logout(); return; } state.activeView = view; render(); }
function setFilter(filter) { state.filter = filter; render(); }
function setSelectedTable(tableId) { state.selectedTableId = Number(tableId) || 1; render(); }
function setOrderNote(note) { state.orderNote = String(note || '').slice(0, 500); }
function setOrderType(type) { state.orderType = type; if (type === 'Sur place' && !state.selectedTableId) state.selectedTableId = 1; render(); }
function selectCashOrder(id) { state.selectedOrderId = id; render(); }
function setPaymentMethod(method) { state.paymentMethod = method; render(); }
async function editMyProfile() { const displayName = prompt('Nom affiché :', state.session.user.display_name); if (!displayName) return; const email = prompt('Adresse email :', state.session.user.email); if (!email) return; const changePassword = confirm('Souhaitez-vous modifier votre mot de passe ?'); const payload = { display_name: displayName, email }; if (changePassword) { payload.current_password = prompt('Mot de passe actuel :'); payload.new_password = prompt('Nouveau mot de passe (8 caractères minimum) :'); if (!payload.current_password || !payload.new_password) return; } try { const response = await fetch(`${API_BASE}/auth/me`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error(); const user = await response.json(); state.session.user = user; savedSession.user = user; localStorage.setItem('epicea-back-office-session', JSON.stringify(savedSession)); showToast('Informations personnelles mises à jour'); } catch (_) { showToast('Mise à jour impossible : vérifiez vos informations'); } }
document.addEventListener('click', (event) => { if (event.target instanceof HTMLButtonElement && event.target.textContent.trim() === 'Modifier mon profil') editMyProfile(); });
async function login(event) { event.preventDefault(); const email = document.getElementById('login-email').value; const password = document.getElementById('login-password').value; try { const response = await nativeFetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); if (!response.ok) throw new Error(); const data = await response.json(); savedSession = { token: data.access_token, user: data.user, expiresAt: data.expires_at }; state.session = savedSession; localStorage.setItem('epicea-back-office-session', JSON.stringify(savedSession)); render(); syncBackOffice(); } catch (_) { alert('Identifiants incorrects ou serveur indisponible.'); } }
async function logout() { try { await fetch(`${API_BASE}/auth/logout`, { method: 'POST' }); } catch (_) { /* La suppression locale reste prioritaire. */ } savedSession = null; state.session = null; localStorage.removeItem('epicea-back-office-session'); render(); }
function addToCart(id) { const item = menu.find(x => x.id === id); const inCart = state.cart.find(x => x.id === id); if (inCart) inCart.quantity++; else state.cart.push({ ...item, quantity: 1 }); showToast(`${item.name} ajouté au panier`); }
function removeFromCart(id) { const i = state.cart.findIndex(x=>x.id===id); if (state.cart[i].quantity > 1) state.cart[i].quantity--; else state.cart.splice(i,1); render(); }
async function sendOrder() {
  const draft = [...state.cart];
  const tableId = state.orderType === 'Sur place' ? Number(state.selectedTableId || state.tables[0]?.id || 1) : null;
  const id = `#${186 + state.orders.length}`;
  const orderNote = state.orderNote.trim();
  const newOrder = { id, table: tableId ? `Table ${tableId}` : 'À emporter', type: state.orderType, time: '00:00', status: 'reçue', items: draft.map(i => `${i.quantity}× ${i.name}`), note: orderNote, total: cartTotal() };
  try {
    const response = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_type: state.orderType === 'Sur place' ? 'dine_in' : 'takeaway',
        table_id: tableId,
        notes: orderNote,
        lines: draft.map(item => ({ menu_item_id: item.id, quantity: item.quantity, notes: orderNote }))
      })
    });
    if (response.ok) {
      const saved = await response.json();
      newOrder.id = saved.public_number;
      newOrder.remoteId = saved.id;
      newOrder.table = saved.table_number ? `Table ${saved.table_number}` : 'À emporter';
    }
  } catch (_) {
    /* Le mode PWA conserve le brouillon et les interactions hors ligne. */
  }
  state.orders.unshift(newOrder);
  state.cart = [];
  state.orderNote = '';
  showToast('Commande envoyée en cuisine. Merci !');
}
async function advanceOrder(id) { const o=state.orders.find(x=>x.id===id); const status = o.status === 'reçue' ? 'préparation' : o.status === 'préparation' ? 'prête' : 'servie'; if (o.remoteId) { try { const response = await fetch(`${API_BASE}/orders/${o.remoteId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: status === 'préparation' ? 'preparing' : status === 'prête' ? 'ready' : 'served' }) }); if (!response.ok) { showToast('Modification refusée pour ce rôle ou ce statut'); return; } } catch (_) { /* La mise à jour sera synchronisée côté serveur ultérieurement. */ } } o.status = status; showToast(o.status === 'servie' ? 'Commande marquée comme servie' : `Commande ${o.status}`); }
async function cancelFirstOrder() { const order = state.orders[0]; if (!order || !confirm(`Annuler ${order.id} ? Cette action sera tracée.`)) return; try { if (order.remoteId) { const response = await fetch(`${API_BASE}/orders/${order.remoteId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) }); if (!response.ok) throw new Error(); } state.orders = state.orders.filter(item => item.id !== order.id); showToast('Commande annulée et journalisée'); } catch (_) { showToast('Annulation impossible hors connexion'); } }
async function paySelectedOrder() { const order = state.orders.find(item => item.id === state.selectedOrderId) || state.orders[0]; if (!order) return; try { if (order.remoteId) { const response = await fetch(`${API_BASE}/orders/${order.remoteId}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: order.total, method: state.paymentMethod }) }); if (!response.ok) throw new Error(); } state.orders = state.orders.filter(item => item.id !== order.id); state.selectedOrderId = state.orders[0]?.id || null; showToast('Paiement encaissé et reçu envoyé par email'); } catch (_) { showToast('Le paiement n’a pas pu être synchronisé'); } }
async function toggleAvailability(id) { const item = menu.find(menuItem => menuItem.id === id); const available = item.available === false; item.available = available; render(); try { const response = await fetch(`${API_BASE}/menu/${id}/availability`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ available }) }); if (!response.ok) throw new Error(); showToast(available ? 'Plat rendu disponible' : 'Plat marqué indisponible'); } catch (_) { item.available = !available; showToast('Mise à jour impossible hors connexion'); } }
async function decideLeave(id, status) { try { const response = await fetch(`${API_BASE}/leave-requests/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); if (!response.ok) throw new Error(); state.leaveRequests = state.leaveRequests.map(request => request.id === id ? { ...request, status } : request); showToast(status === 'approved' ? 'Congé approuvé' : 'Demande refusée'); } catch (_) { showToast('Mise à jour impossible hors connexion'); } }
async function openService() { try { const response = await fetch(`${API_BASE}/services`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_date: new Date().toISOString().slice(0, 10), service_type: 'lunch', manager_name: 'Amadou Diallo' }) }); if (!response.ok) throw new Error(); showToast('Service du midi ouvert'); refreshOperations(); } catch (_) { showToast('Ouverture du service impossible'); } }
async function closeService() { const actualTotal = Number(prompt('Total réellement encaissé (€) :', String(state.dashboard.revenue))); if (!Number.isFinite(actualTotal)) return; try { const services = await (await fetch(`${API_BASE}/services`)).json(); const current = services.find(service => service.status === 'open'); if (!current) throw new Error(); const response = await fetch(`${API_BASE}/services/${current.id}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actual_total: actualTotal }) }); if (!response.ok) throw new Error(); const report = await response.json(); showToast(`Service clôturé · écart ${euros(report.discrepancy)}`); refreshOperations(); } catch (_) { showToast('Clôture du service impossible'); } }
async function closeCashRegister() { const actualTotal = Number(prompt('Montant compté dans la caisse (€) :', String(state.dashboard.revenue))); if (!Number.isFinite(actualTotal)) return; try { const response = await fetch(`${API_BASE}/cash-registers/1/close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actual_total: actualTotal }) }); if (!response.ok) throw new Error(); showToast('Caisse clôturée'); } catch (_) { showToast('Clôture de caisse impossible'); } }
async function createReservation() { const customerName = prompt('Nom du client :'); if (!customerName) return; try { const response = await fetch(`${API_BASE}/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table_id: 1, customer_name: customerName, contact: 'À compléter', reserved_at: new Date().toISOString(), party_size: 2, created_by: 'Caisse' }) }); if (!response.ok) throw new Error(); showToast(`Réservation créée pour ${customerName}`); refreshOperations(); } catch (_) { showToast('Création de réservation impossible'); } }
async function createMenuItem() { const name = prompt('Nom du plat :'); const price = Number(prompt('Prix (€) :', '10')); if (!name || !Number.isFinite(price)) return; try { const response = await fetch(`${API_BASE}/menu`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, category: 'Plats', price, description: '' }) }); if (!response.ok) throw new Error(); showToast('Plat ajouté à la carte'); loadMenuFromApi(); } catch (_) { showToast('Ajout du plat non autorisé'); } }
async function manageUsers() { const email = prompt('Email du compte :'); if (!email) return; const displayName = prompt('Nom affiché :'); const role = prompt('Profil : manager, server ou cashier', 'server'); const password = prompt('Mot de passe temporaire (8 caractères minimum) :', 'Bienvenue2026!'); if (!displayName || !password) return; try { const response = await fetch(`${API_BASE}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, display_name: displayName, password, role }) }); if (!response.ok) throw new Error(); showToast(`Compte ${role} créé`); } catch (_) { showToast('Création refusée : super administrateur requis'); } }
async function configureWaitTime() { const minutes = Number(prompt('Délai estimé en minutes :', '30')); if (!Number.isFinite(minutes)) return; try { const response = await fetch(`${API_BASE}/wait-time-rules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ min_orders: 0, max_orders: 5, estimated_minutes: minutes, updated_by: 'Caisse' }) }); if (!response.ok) throw new Error(); showToast('Estimation d’attente mise à jour'); } catch (_) { showToast('Modification non autorisée'); } }
async function openCashRegister() { const openingFloat = Number(prompt('Fond de caisse (€) :', '100')); if (!Number.isFinite(openingFloat)) return; try { const response = await fetch(`${API_BASE}/cash-registers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opening_float: openingFloat, opened_by: state.session.user.display_name }) }); if (!response.ok) throw new Error(); showToast('Caisse ouverte'); } catch (_) { showToast('Ouverture de caisse non autorisée'); } }
async function splitPayment() { const order = state.orders.find(item => item.id === state.selectedOrderId) || state.orders[0]; const amount = Number(prompt(`Montant à encaisser sur ${euros(order.total)} :`, String(order.total / 2))); if (!order || !Number.isFinite(amount)) return; try { const response = await fetch(`${API_BASE}/orders/${order.remoteId}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, method: state.paymentMethod }) }); if (!response.ok) throw new Error(); const result = await response.json(); showToast(result.remaining_amount ? `Solde restant : ${euros(result.remaining_amount)}` : 'Addition réglée'); loadApplicationData(); } catch (_) { showToast('Division de l’addition impossible'); } }
async function reassignTable() { const tableId = Number(prompt(state.session?.user?.role === 'server' ? 'Numéro de la table à vous assigner :' : 'Numéro de la table à réassigner :', '4')); const serverName = state.session?.user?.role === 'server' ? state.session.user.display_name : prompt('Nom du serveur :', 'Mariam Sarr'); if (!tableId || !serverName) return; try { const response = await fetch(`${API_BASE}/tables/${tableId}/assignment`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ server_name: serverName }) }); if (!response.ok) throw new Error(); showToast(state.session?.user?.role === 'server' ? `Vous êtes assigné(e) à la table ${tableId}` : `Table ${tableId} réassignée à ${serverName}`); syncBackOffice(); } catch (_) { showToast('Réassignation impossible'); } }
async function showTableHistory(tableId) { try { const response = await fetch(`${API_BASE}/tables/${tableId}/history`); if (!response.ok) throw new Error(); const history = await response.json(); showToast(`Table ${tableId} : ${history.length} commande(s) dans l’historique`); } catch (_) { showToast('Historique de table indisponible'); } }
async function loadMenuFromApi() { try { const response = await fetch(`${API_BASE}/menu`); if (!response.ok) return; const remoteMenu = await response.json(); remoteMenu.forEach((remote) => { const local = menu.find(item => item.id === remote.id); if (local) Object.assign(local, { ...remote, tags: remote.dietary_tags }); }); render(); } catch (_) { /* L’interface reste pleinement consultable avec les données locales. */ } }
async function loadApplicationData() { try { const [ordersResponse, dashboardResponse, leaveResponse] = await Promise.all([fetch(`${API_BASE}/orders`), fetch(`${API_BASE}/dashboard`), fetch(`${API_BASE}/leave-requests`)]); if (ordersResponse.ok) { const statusLabels = { received: 'reçue', preparing: 'préparation', ready: 'prête', served: 'servie' }; const orders = await ordersResponse.json(); if (orders.length) state.orders = orders.filter(order => order.payment_status === 'unpaid' && order.status !== 'cancelled').map(order => ({ id: order.public_number, remoteId: order.id, table: order.table_number ? `Table ${order.table_number}` : 'À emporter', type: order.order_type === 'dine_in' ? 'Sur place' : 'À emporter', time: new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), status: statusLabels[order.status] || 'reçue', items: order.lines.map(line => `${line.quantity}× ${line.label}`), note: order.notes, total: order.total })); state.selectedOrderId = state.orders[0]?.id || null; } if (dashboardResponse.ok) { const data = await dashboardResponse.json(); state.dashboard = { revenue: data.revenue, orders: data.orders, activeOrders: data.active_orders, leaveRequests: data.open_leave_requests }; } if (leaveResponse.ok) state.leaveRequests = await leaveResponse.json(); render(); } catch (_) { /* Les données de démonstration restent disponibles hors ligne. */ } }
async function refreshOperations() { try { const [tablesResponse, callsResponse, auditResponse] = await Promise.all([fetch(`${API_BASE}/tables`), fetch(`${API_BASE}/server-calls`), fetch(`${API_BASE}/audit-logs?limit=4`)]); if (tablesResponse.ok) state.tables = await tablesResponse.json(); if (callsResponse.ok) state.serverCalls = await callsResponse.json(); if (auditResponse.ok) state.auditLogs = await auditResponse.json(); render(); } catch (_) { /* Les données locales restent affichées si le réseau est indisponible. */ } }
let syncInProgress = false;
function mapApiOrder(order, labels) { const createdAt = new Date(order.created_at); return { id: order.public_number, remoteId: order.id, table: order.table_number ? `Table ${order.table_number}` : 'À emporter', type: order.order_type === 'dine_in' ? 'Sur place' : 'À emporter', date: createdAt.toLocaleDateString('fr-FR'), time: createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), status: labels[order.status] || 'reçue', paymentStatus: order.payment_status, items: order.lines.map(line => `${line.quantity}× ${line.label}`), note: order.notes, total: order.total }; }
async function syncBackOffice() {
  if (!state.session || syncInProgress) return;
  syncInProgress = true;
  try {
    const response = await fetch(`${API_BASE}/back-office/snapshot`);
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (data.version === state.syncVersion) return;
    state.syncVersion = data.version;
    const labels = data.status_labels;
    state.orders = data.orders.map(order => mapApiOrder(order, labels));
    state.orderHistory = (data.order_history || data.orders).map(order => mapApiOrder(order, labels));
    state.selectedOrderId = state.orders.some(order => order.id === state.selectedOrderId) ? state.selectedOrderId : state.orders[0]?.id || null;
    state.tables = data.tables;
    state.servers = data.servers || [];
    state.serverCalls = data.server_calls;
    state.leaveRequests = data.leave_requests;
    state.auditLogs = data.audit_logs;
    state.dashboard = data.dashboard;
    render();
  } catch (_) { /* Conservation du dernier état affiché en cas de perte réseau. */ }
  finally { syncInProgress = false; }
}
render();
loadMenuFromApi();
syncBackOffice();
setInterval(() => {
  if (state.session) {
    loadMenuFromApi();
    syncBackOffice();
  }
}, 2000);
