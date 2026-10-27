let savedSession = JSON.parse(localStorage.getItem('epicea-back-office-session') || 'null');
let currentTheme = localStorage.getItem('epicea-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day');
document.documentElement.dataset.theme = currentTheme;
const nativeFetch = window.fetch.bind(window);
window.fetch = async (resource, options = {}) => {
  const url = String(resource);
  if (savedSession?.token && url.includes('/api/') && !url.includes('/api/auth/login')) {
    options.headers = { ...(options.headers || {}), Authorization: `Bearer ${savedSession.token}` };
  }
  const response = await nativeFetch(resource, options);
  if (response.status === 401 && savedSession && url.includes('/api/')) handleExpiredSession();
  return response;
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
  selectedOrderId: null,
  paymentMethod: 'card',
  dashboard: { revenue: 0, orders: 0, activeOrders: 0, kitchenOrders: null, leaveRequests: 0 },
  leaveRequests: [],
  tables: [],
  servers: [],
  serverCalls: [],
  auditLogs: [],
  syncVersion: null,
  profileModalOpen: false,
  accountTab: 'profile',
  myLeaveRequests: [],
  leaveDraft: null,
  session: savedSession,
  orders: [],
  kitchenOrders: [],
  employee: null,
  shifts: [],
  reservationModalOpen: false,
  reservationDraft: null,
  reservationTables: [],
  reservationLoading: false,
  reservationSaving: false,
  reservationRequest: 0,
};

const menu = [];
const API_BASE = '/api';

const nav = [
  ['dashboard', '▦', 'Vue d’ensemble'], ['kitchen', '♨', 'Cuisine'],
  ['servers', '♙', 'Serveurs'], ['history', '▤', 'Historique des commandes'], ['cashier', '▣', 'Caisse'], ['manager', '⚙', 'Manager'], ['hr', '♧', 'Ressources humaines'],
];
const serverNav = [['front', '◉', 'Menu'], ['kitchen', '♨', 'Cuisine'], ['servers', '♙', 'Tables'], ['history', '▤', 'Historique des commandes'], ['account', '◉', 'Mon compte'], ['logout', '↪', 'Déconnexion']];
function navigationForCurrentUser() { return state.session?.user?.role === 'server' ? serverNav : nav; }

function euros(value) { return `${value.toFixed(2).replace('.', ',')} €`; }
function cartTotal() { return state.cart.reduce((total, item) => total + item.price * item.quantity, 0); }
function getTitle() {
  const user = state.session?.user;
  const name = user ? String(user.first_name || profileNameParts(user).firstName).trim() : '';
  return ({ dashboard: name ? `Bon retour, ${escapeAttribute(name)}` : 'Bon retour', front: 'Votre table, votre rythme', kitchen: 'Écran cuisine', history: 'Historique des commandes', account: 'Mon compte', servers: 'Plan de salle', cashier: 'Caisse', manager: 'Pilotage du restaurant', hr: 'Espace personnel' })[state.activeView];
}
function dashboardActivity() {
  if (state.syncVersion === null || state.dashboard.kitchenOrders === null) return 'Chargement des données du restaurant…';
  const occupied = state.tables.filter(table => table.status === 'occupied').length;
  const kitchen = state.dashboard.kitchenOrders;
  return `${occupied} table${occupied === 1 ? '' : 's'} occupée${occupied === 1 ? '' : 's'} · ${kitchen} commande${kitchen === 1 ? '' : 's'} en cuisine`;
}
let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  render();
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    document.body.append(toast);
  }
  toast.textContent = `✓ ${message}`;
  toastTimer = setTimeout(() => toast.remove(), 2600);
}
function serviceDateLabel() { return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Dakar' }).format(new Date()).toLocaleUpperCase('fr-FR'); }
function mobileNavigation() {
  const items = navigationForCurrentUser().filter(([id]) => id !== 'logout').slice(0, 5);
  return `<nav class="mobile-nav" aria-label="Navigation principale">${items.map(([id, icon, label]) => `<button class="${state.activeView === id ? 'active' : ''}" onclick="go('${id}')" aria-label="${label}"><i>${icon}</i><span>${label}</span></button>`).join('')}</nav>`;
}
function escapeAttribute(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function profileNameParts(user) {
  if (user.first_name && user.last_name) return { firstName: user.first_name, lastName: user.last_name };
  const parts = String(user.display_name || '').trim().split(/\s+/);
  return { firstName: parts.slice(0, -1).join(' ') || parts[0] || '', lastName: parts.length > 1 ? parts.at(-1) : '' };
}
function profileModal() {
  if (!state.profileModalOpen || !state.session?.user) return '';
  const user = state.session.user;
  const { firstName, lastName } = profileNameParts(user);
  return `<div class="table-modal-backdrop profile-modal-backdrop" role="presentation" onclick="if(event.target===this)closeProfileModal()"><section class="table-modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title"><header class="table-modal-header"><div><p class="eyebrow">ESPACE PERSONNEL</p><h2 id="profile-modal-title">Modifier mes informations</h2></div><button class="icon-button" type="button" aria-label="Fermer" onclick="closeProfileModal()">×</button></header><p class="profile-modal-intro">Mettez à jour vos coordonnées. Laissez les champs de mot de passe vides si vous ne souhaitez pas le modifier.</p><form class="profile-form" onsubmit="submitProfileUpdate(event)"><div class="profile-name-grid"><label for="profile-first-name">Prénom(s)<input id="profile-first-name" name="first_name" type="text" minlength="1" maxlength="100" value="${escapeAttribute(firstName)}" required autocomplete="given-name" oninput="syncProfileFullName()" /></label><label for="profile-last-name">Nom<input id="profile-last-name" name="last_name" type="text" minlength="1" maxlength="100" value="${escapeAttribute(lastName)}" required autocomplete="family-name" oninput="syncProfileFullName()" /></label></div><label for="profile-name">Nom complet<input id="profile-name" name="display_name" type="text" value="${escapeAttribute(user.display_name)}" readonly aria-readonly="true" /></label><label for="profile-email">Adresse e-mail<input id="profile-email" name="email" type="email" maxlength="254" value="${escapeAttribute(user.email)}" required autocomplete="email" /></label><fieldset><legend>Modifier le mot de passe <span>Facultatif</span></legend><label for="profile-current-password">Mot de passe actuel<input id="profile-current-password" name="current_password" type="password" minlength="8" maxlength="256" autocomplete="current-password" /></label><label for="profile-new-password">Nouveau mot de passe<input id="profile-new-password" name="new_password" type="password" minlength="8" maxlength="256" autocomplete="new-password" /></label></fieldset><p class="profile-form-error" id="profile-form-error" role="alert" aria-live="polite"></p><div class="table-create-actions"><button class="secondary-button" type="button" onclick="closeProfileModal()">Annuler</button><button class="button" type="submit">Enregistrer les modifications</button></div></form></section></div>`;
}

function layout(content) {
  return `<div class="shell">
    <aside class="sidebar"><a class="brand" href="#" onclick="go('dashboard')"><span>✦</span> épicéa</a>
      <div class="restaurant"><small>ÉTABLISSEMENT</small><strong>Épicéa Dakar</strong><span class="service-dot">● ${escapeAttribute(serviceLabel())}</span></div>
      <nav>${navigationForCurrentUser().map(([id, icon, label]) => `<button class="nav-item ${state.activeView === id ? 'active' : ''}" aria-label="${label}" title="${label}" onclick="go('${id}')"><i>${icon}</i><span>${label}</span></button>`).join('')}</nav>
      <div class="profile"><div class="avatar">${state.session?.user?.display_name?.split(' ').map(word => word[0]).join('').slice(0,2) || '?'}</div><div><strong>${state.session?.user?.display_name || 'Utilisateur'}</strong><small>${state.session?.user?.is_super_admin ? 'Super administrateur' : ({ server: 'Serveur', cashier: 'Caissier', manager: 'Manager' }[state.session?.user?.role] || 'Équipe')}</small></div></div>
    </aside>
    <main><header><div><p class="eyebrow">${serviceDateLabel()}</p><h1>${getTitle()}</h1></div><div class="header-actions"><button class="icon-button" aria-label="Rechercher">⌕</button><button class="icon-button ${state.kitchenOrders.some(order => order.status === 'prête') || state.serverCalls.length || state.dashboard.leaveRequests ? 'notification' : ''}" aria-label="Actions en attente" onclick="go('dashboard')">♢</button><button class="date-button">${escapeAttribute(serviceLabel())}</button></div></header>${content}</main>
    ${mobileNavigation()}${profileModal()}${reservationModal()}${state.toast ? `<div class="toast">✓ ${state.toast}</div>` : ''}</div>`;
}

function normalizeDashboard(data) {
  return { ...data, activeOrders: data.active_orders ?? data.activeOrders ?? 0, kitchenOrders: data.kitchen_orders ?? null, leaveRequests: data.open_leave_requests ?? data.leave_requests ?? data.leaveRequests ?? 0 };
}
function serviceLabel() {
  if (state.syncVersion === null) return 'Chargement du service…';
  const service = state.dashboard.service;
  return service ? `Service ${service.service_type === 'lunch' ? 'du midi' : 'du soir'} ouvert` : 'Aucun service ouvert aujourd’hui';
}
function durationLabel(minutes) {
  if (minutes == null || !Number.isFinite(Number(minutes))) return 'Non mesuré';
  const value = Math.max(0, Math.round(Number(minutes)));
  return value < 60 ? `${value} min` : `${Math.floor(value / 60)} h ${String(value % 60).padStart(2, '0')}`;
}
function metricValue(value, money = false) {
  return state.syncVersion === null || value == null ? '—' : money ? euros(value) : value;
}
function metricChange(key) {
  const change = state.dashboard.changes?.[key];
  return change == null ? 'Comparaison indisponible' : `${change > 0 ? '+' : ''}${change.toLocaleString('fr-FR')} % par rapport à hier`;
}
function activityAlerts() {
  const ready = state.kitchenOrders.filter(order => order.status === 'prête');
  const cards = ready.slice(0, 4).map(order => `<div class="watch-item"><span>✓</span><div><strong>${escapeAttribute(order.id)} prête à servir</strong><p>${escapeAttribute(order.table)}</p></div><button onclick="go('kitchen')">Voir</button></div>`);
  if (state.dashboard.leaveRequests) cards.push(`<div class="watch-item"><span>◷</span><div><strong>${state.dashboard.leaveRequests} demande(s) de congés</strong><p>En attente de décision</p></div><button onclick="go('hr')">Voir</button></div>`);
  if (state.serverCalls.length) cards.push(`<div class="watch-item"><span>!</span><div><strong>${state.serverCalls.length} appel(s) de salle</strong><p>En attente de prise en charge</p></div><button onclick="go('servers')">Voir</button></div>`);
  return cards.join('') || `<p class="empty-cart">${state.syncVersion === null ? 'Chargement des alertes…' : 'Aucune action en attente.'}</p>`;
}
function orderFlow() {
  const flow = state.dashboard.order_flow || [];
  const max = Math.max(1, ...flow.map(point => point.orders));
  if (!flow.some(point => point.orders)) return '<p class="empty-cart">Aucune commande enregistrée aujourd’hui.</p>';
  return `<div class="live-order-chart" role="img" aria-label="Commandes du jour par heure à Dakar">${flow.map(point => `<div class="live-order-slot"><div class="live-order-bar" style="height:${100 * point.orders / max}%" title="${point.hour} h : ${point.orders} commande(s)"><span>${point.orders || ''}</span></div><small>${point.hour}</small></div>`).join('')}</div>`;
}
function dashboard() { return layout(`<section class="hero"><div><span class="pill">● Données du restaurant</span><h2>Votre activité<br/>en temps réel.</h2><p aria-live="polite">${dashboardActivity()}</p></div><div class="hero-art">🍽️</div></section>
<p class="metrics-period">Aujourd’hui à Dakar (UTC) · ${escapeAttribute(state.dashboard.date || 'Chargement…')}</p>
<section class="metric-grid"><article><span>Chiffre d’affaires encaissé</span><strong>${metricValue(state.dashboard.revenue, true)}</strong><em>${metricChange('revenue')}</em></article><article><span>Commandes du jour</span><strong>${metricValue(state.dashboard.orders)}</strong><em>Hors commandes annulées · ${metricChange('orders')}</em></article><article><span>Panier moyen</span><strong>${metricValue(state.dashboard.average_basket, true)}</strong><em>Moyenne des commandes du jour · ${metricChange('average_basket')}</em></article><article><span>Attente en cuisine</span><strong>${state.syncVersion === null ? '—' : state.dashboard.average_wait_minutes == null ? 'Aucune attente' : durationLabel(state.dashboard.average_wait_minutes)}</strong><em>Temps écoulé moyen des commandes reçues ou en préparation</em></article></section>
<section class="two-columns"><article class="panel"><div class="panel-title"><div><h3>Flux des commandes</h3><p>Aujourd’hui, par heure à Dakar · hors annulations</p></div></div>${orderFlow()}</article><article class="panel"><div class="panel-title"><div><h3>À surveiller</h3><p>Actions en attente enregistrées</p></div></div>${activityAlerts()}</article></section>`); }

function front() {
  const availableMenu = menu.filter(x => x.available !== false);
  const featured = availableMenu.find(item => item.featured) || availableMenu[0];
  const filtered = state.filter === 'Tous' ? availableMenu : availableMenu.filter(x => x.category === state.filter || x.tags.includes(state.filter));
  return layout(`${featured ? `<section class="front-banner"><div><span class="pill light">${featured.featured ? 'SUGGESTION DU CHEF' : 'LA CARTE'}</span><h2>${escapeAttribute(featured.name)}</h2><p>${escapeAttribute(featured.description)}</p><button class="button light-button" onclick="addToCart(${featured.id})">Ajouter au panier &middot; ${euros(featured.price)}</button></div><div class="dish-large">${featured.emoji}</div></section>` : '<section class="panel"><p>Aucun plat disponible pour le moment.</p></section>'}<div class="front-layout"><section><div class="section-heading"><div><h2>La carte</h2><p>Choisissez vos envies du moment</p></div><div class="estimate">◷ Préparation estimée : <b>${state.dashboard.estimated_minutes == null ? 'Non disponible' : durationLabel(state.dashboard.estimated_minutes)}</b></div></div><div class="chips">${['Tous', 'Entrées', 'Plats', 'Desserts', 'Végétarien', 'Sans gluten'].map(f => `<button class="chip ${state.filter === f ? 'selected' : ''}" onclick="setFilter('${f}')">${f}</button>`).join('')}</div><div class="menu-grid">${filtered.map(item => `<article class="menu-card"><div class="food-image">${item.emoji}${item.tags.includes('Suggestion') ? '<span>★ Plat du jour</span>' : ''}</div><div class="menu-info"><div><h3>${item.name}</h3><p>${item.description}</p><div class="tags">${item.tags.filter(t => t !== 'Suggestion').map(t => `<span>${t}</span>`).join('')}</div></div><div class="price-row"><b>${euros(item.price)}</b><button class="add-button" onclick="addToCart(${item.id})">+</button></div></div></article>`).join('')}</div></section><aside class="cart"><div class="cart-heading"><h3>Votre commande</h3><span>${state.cart.reduce((n,i) => n+i.quantity, 0)} article${state.cart.length !== 1 ? 's' : ''}</span></div>${state.cart.length ? `<div class="cart-items">${state.cart.map(i => `<div><span>${i.quantity}×</span><p>${i.name}</p><b>${euros(i.price*i.quantity)}</b><button onclick="removeFromCart(${i.id})">×</button></div>`).join('')}</div>` : `<div class="empty-cart">Votre panier est vide<br/><small>Ajoutez un plat pour commencer.</small></div>`}${state.orderType === 'Sur place' ? `<div class="table-select-wrap"><label>Table</label><select class="table-select" onchange="setSelectedTable(Number(event.target.value))">${state.tables.map(table => `<option value="${table.id}" ${Number(state.selectedTableId) === Number(table.id) ? 'selected' : ''}>Table ${table.number} · ${table.capacity} pers.</option>`).join('')}</select></div>` : ''}<div class="order-note-wrap"><label>Note pour la cuisine</label><textarea class="order-note" rows="2" placeholder="Ex. sans sel, bien cuit, pas trop épicé..." onchange="setOrderNote(event.target.value)" oninput="setOrderNote(event.target.value)">${state.orderNote}</textarea></div><div class="order-type"><button class="${state.orderType === 'Sur place' ? 'active' : ''}" onclick="setOrderType('Sur place')">♨ Sur place</button><button class="${state.orderType === 'À emporter' ? 'active' : ''}" onclick="setOrderType('À emporter')">▣ À emporter</button></div><div class="cart-total"><span>Total</span><b>${euros(cartTotal())}</b></div><button class="button full" ${!state.cart.length ? 'disabled' : ''} onclick="sendOrder()">Valider ma commande →</button><p class="cart-note">Votre commande sera envoyée en cuisine après validation.</p></aside></div>`); }

function kitchen() {
  const isServer = state.session?.user?.role === 'server';
  const columns = [['reçue','Reçues','Démarrer'],['préparation','En préparation','Marquer prête'],['prête','Prêtes','Marquer servie']];
  const activeOrders = state.kitchenOrders.filter(order => ['reçue', 'préparation', 'prête'].includes(order.status));
  const renderOrder = (order, status, action) => {
    const isReadyForService = status === 'prête';
    const serverCanServe = isServer && isReadyForService;
    const canAct = !isServer || serverCanServe;
    const actionLabel = isServer ? (serverCanServe ? 'Commande servie' : 'Suivi uniquement') : action;
    return `<article class="kitchen-card ${order.elapsedMinutes >= (state.dashboard.estimated_minutes || 30) ? 'overdue' : ''}"><div class="order-card-head"><div><strong>${order.id}</strong><span>${order.table}</span></div><b>◷ ${durationLabel(order.elapsedMinutes)}</b></div><ul>${order.items.map(item=>`<li>${item}</li>`).join('')}</ul>${order.note ? `<p class="allergy">⚠ ${order.note}</p>` : ''}<button class="button full ${status === 'prête' ? 'outline' : ''}" ${!canAct ? 'disabled' : ''} onclick="advanceOrder('${order.id}')">${actionLabel}</button></article>`;
  };
  const statusColumns = columns.map(([status,title,action]) => `<div class="kanban-col"><h3><span class="status-dot ${status}"></span>${title}<b>${activeOrders.filter(order=>order.status===status).length}</b></h3>${activeOrders.filter(order=>order.status===status).map(order => renderOrder(order, status, action)).join('') || '<div class="empty-column">Aucune commande</div>'}</div>`).join('');
  return layout(`<div class="kitchen-head"><div class="kitchen-summary"><span>${activeOrders.length} commandes actives</span><b>Attente moyenne : ${durationLabel(state.dashboard.average_wait_minutes)}</b></div><button class="button" onclick="showToast('Impression de secours lancée')">▤ Imprimer le flux</button></div><section class="kanban">${statusColumns}</section>`);
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
  const initials = user.display_name?.split(' ').map(part => part[0]).join('').slice(0, 2) || 'S';
  const statusLabels = { pending: 'En attente', approved: 'Approuvée', rejected: 'Refusée' };
  const leaveContent = `<section class="leave-tab"><div class="leave-tab-grid"><form class="panel leave-request-form" onsubmit="submitLeaveRequest(event)"><div><p class="eyebrow">NOUVELLE DEMANDE</p><h3>Demander un congé</h3><p>Votre manager sera averti et pourra traiter votre demande.</p></div><label>Date de début<input name="start_date" type="date" required /></label><label>Date de fin<input name="end_date" type="date" required /></label><label>Motif<textarea name="reason" rows="3" minlength="3" maxlength="500" placeholder="Ex. congé annuel" required></textarea></label><p class="leave-form-error" role="alert" aria-live="polite"></p><button class="button" type="submit">Envoyer la demande</button></form><section class="panel leave-history"><div class="panel-title"><div><p class="eyebrow">SUIVI</p><h3>Mes demandes</h3></div><span>${state.myLeaveRequests.length}</span></div>${state.myLeaveRequests.map(request => `<article class="leave-history-row"><div><strong>${request.start_date} → ${request.end_date}</strong><p>${request.reason}</p></div><span class="leave-status ${request.status}">${statusLabels[request.status] || request.status}</span></article>`).join('') || '<p class="empty-cart">Vous n’avez encore soumis aucune demande.</p>'}</section></div></section>`;
  const profileContent = `<section class="account-details panel"><h3>Informations personnelles</h3><dl><div><dt>Nom complet</dt><dd>${user.display_name || 'Non renseigné'}</dd></div><div><dt>Adresse e-mail</dt><dd>${user.email || 'Non renseignée'}</dd></div><div><dt>Profil</dt><dd>${roleLabels[user.role] || 'Membre de l’équipe'}</dd></div><div><dt>Identifiant employé</dt><dd>${user.employee_id ?? 'Non renseigné'}</dd></div><div><dt>État du compte</dt><dd><span class="account-state ${user.active ? 'is-active' : ''}">${user.active ? 'Actif' : 'Inactif'}</span></dd></div></dl></section>`;
  return layout(`<section class="account-page"><div class="account-heading panel"><div class="account-identity"><div class="avatar account-avatar">${initials}</div><div><p class="eyebrow">ESPACE PERSONNEL</p><h2>${user.display_name || 'Serveur'}</h2><span>${roleLabels[user.role] || 'Membre de l’équipe'}</span></div></div><button class="secondary-button" onclick="editMyProfile()">Modifier mes informations</button></div><div class="account-tabs" role="tablist"><button class="${state.accountTab === 'profile' ? 'active' : ''}" onclick="setAccountTab('profile')" role="tab">Mes informations</button><button class="${state.accountTab === 'leave' ? 'active' : ''}" onclick="setAccountTab('leave')" role="tab">Demandes de congés</button></div>${state.accountTab === 'leave' ? leaveContent : profileContent}</section>`);
}
function setAccountTab(tab) { state.accountTab = tab; render(); if (tab === 'leave') loadMyLeaveRequests(); }
async function loadMyLeaveRequests(renderAfter = true) { try { const response = await fetch(`${API_BASE}/leave-requests/mine`); if (response.ok) { const requests = await response.json(); if (JSON.stringify(requests) === JSON.stringify(state.myLeaveRequests)) return; state.myLeaveRequests = requests; if (renderAfter) renderBackground(); } } catch (_) { /* La dernière liste affichée reste disponible. */ } }
async function submitLeaveRequest(event) {
  event.preventDefault();
  if (state.leaveSubmitting) return;
  const form = event.currentTarget;
  const error = form.querySelector('.leave-form-error');
  const payload = Object.fromEntries(new FormData(form));
  payload.reason = payload.reason.trim();
  if (!payload.start_date || !payload.end_date || payload.end_date < payload.start_date || payload.reason.length < 3) {
    error.textContent = 'Vérifiez les dates et renseignez un motif de 3 caractères minimum.';
    return;
  }
  error.textContent = '';
  state.leaveSubmitting = true;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/leave-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Vérifiez les dates et le motif.');
    state.myLeaveRequests.unshift(data);
    form.reset();
    state.leaveSubmitting = false;
    if (form.contains(document.activeElement)) document.activeElement.blur();
    showToast('Demande envoyée au manager');
  } catch (requestError) { state.leaveSubmitting = false; error.textContent = requestError.message || 'Vérifiez les dates et le motif.'; button.disabled = false; }
}

function filterOrderHistory() {
  const query = document.getElementById('history-search').value.trim().toLocaleLowerCase();
  const status = document.getElementById('history-status').value;
  document.querySelectorAll('.order-history-item').forEach(order => {
    order.hidden = (query && !order.dataset.search.includes(query)) || (status && order.dataset.status !== status);
  });
}







function hr() {
  const user = state.session?.user || {};
  const employee = state.employee;
  const requests = state.leaveRequests.filter(request => request.status === 'pending');
  return layout(`<section class="hr-cards"><article class="panel employee-card"><div class="avatar large">${escapeAttribute((user.display_name || '?').slice(0, 2))}</div><div><span class="eyebrow">MON ESPACE</span><h2>${escapeAttribute(user.display_name)}</h2><p>${employee ? `${escapeAttribute(employee.role)} &middot; ${escapeAttribute(employee.contract_type)} depuis le ${escapeAttribute(employee.hire_date)}` : 'Dossier employ&eacute; non renseign&eacute;'}</p></div><button class="secondary-button" onclick="editMyProfile()">Modifier mon profil</button></article><article class="panel leave-balance"><span>Solde de cong&eacute;s</span><strong>&mdash;</strong><p>Non renseign&eacute; : les droits acquis ne sont pas enregistr&eacute;s.</p><button class="text-button" onclick="go('account');setAccountTab('leave')">Demander un cong&eacute;</button></article></section><section class="two-columns"><article class="panel schedule"><div class="panel-title"><div><h3>Mon planning</h3><p>Les sept prochains jours</p></div></div>${state.shifts.map(shift => `<div class="shift"><b>${escapeAttribute(shift.shift_date)}</b><span>${escapeAttribute(shift.start_time)} &mdash; ${escapeAttribute(shift.end_time)}</span></div>`).join('') || '<p>Aucun cr&eacute;neau enregistr&eacute; sur cette p&eacute;riode.</p>'}</article><article class="panel"><h3>Demandes &agrave; valider</h3><p>${requests.length} demande(s) en attente</p>${requests.map(request => `<div class="leave-request"><div><b>${escapeAttribute(request.employee_name)}</b><p>${escapeAttribute(request.reason)} &middot; ${escapeAttribute(request.start_date)} au ${escapeAttribute(request.end_date)}</p></div><button class="approve" onclick="decideLeave(${request.id}, 'approved')" aria-label="Approuver">&#10003;</button><button class="decline" onclick="decideLeave(${request.id}, 'rejected')" aria-label="Refuser">&times;</button></div>`).join('') || '<p>Aucune demande en attente.</p>'}</article></section>`);
}

function manager() { const audit = state.auditLogs.slice(0, 4); return layout(`<section class="metric-grid"><article><span>CA encaissé aujourd’hui</span><strong>${metricValue(state.dashboard.revenue, true)}</strong><em>● Encaissements du jour</em></article><article><span>Commandes actives</span><strong>${metricValue(state.dashboard.activeOrders)}</strong><em>↗ Suivi cuisine</em></article><article><span>Demandes RH</span><strong>${metricValue(state.dashboard.leaveRequests)}</strong><em>● À traiter</em></article><article><span>État du service</span><strong>${state.dashboard.service ? 'Ouvert' : 'Fermé'}</strong><em>${escapeAttribute(serviceLabel())}</em></article></section><section class="two-columns"><article class="panel"><div class="panel-title"><div><h3>Pilotage du service</h3><p>Actions formelles de début et fin de service.</p></div></div><div class="watch-item"><span>☀</span><div><strong>${escapeAttribute(serviceLabel())}</strong><p>${state.dashboard.service ? `Ouvert par ${escapeAttribute(state.dashboard.service.manager_name)}` : 'Aucun service actif pour la date du jour.'}</p></div><button onclick="openService()">Ouvrir</button></div><div class="watch-item urgent"><span>€</span><div><strong>Clôturer et rapprocher</strong><p>Compare les encaissements aux commandes réglées.</p></div><button onclick="closeService()">Clôturer</button></div><div class="watch-item"><span>⌁</span><div><strong>Comptes et permissions</strong><p>Créez les comptes et attribuez les droits granulaires.</p></div><button onclick="manageUsers()">Gérer</button></div></article><article class="panel"><div class="panel-title"><div><h3>Journal d’audit</h3><p>Dernières actions sensibles</p></div></div>${audit.length ? audit.map(log => `<div class="watch-item"><span>✓</span><div><strong>${log.action}</strong><p>${log.actor} · ${log.target}</p></div></div>`).join('') : '<div class="empty-cart">Aucune action récente.</div>'}</article></section><section class="panel menu-management"><div class="panel-title"><div><h3>Carte et disponibilité</h3><p>Les changements sont immédiatement transmis au Front Office.</p></div><button class="button" onclick="createMenuItem()">＋ Ajouter un plat</button></div><div class="menu-table"><div class="table-head"><span>PLAT</span><span>CATÉGORIE</span><span>PRIX</span><span>DISPONIBILITÉ</span></div>${menu.map(m=>`<div><span><i class="mini-food">${m.emoji}</i><b>${m.name}</b>${m.featured?'<em>★ Plat du jour</em>':''}</span><span>${m.category}</span><span>${euros(m.price)}</span><button class="toggle ${m.available===false?'off':''}" onclick="toggleAvailability(${m.id})"><i></i></button></div>`).join('')}</div></section>`); }

function cashier() { const selected = state.orders.find(order => order.id === state.selectedOrderId) || state.orders[0]; return layout(`<section class="cashier-grid"><article class="panel orders-list"><div class="panel-title"><div><h3>Commandes à encaisser</h3><p>${state.orders.length} commande(s) en attente</p></div><button class="text-button" onclick="createReservation()">+ Réservation</button></div>${state.orders.map(o => `<button class="cash-order ${selected && o.id===selected.id?'chosen':''}" onclick="selectCashOrder('${o.id}')"><span class="table-number">${o.table.replace('Table ','T.')}</span><div><strong>${o.id} · ${o.type}</strong><p>${o.items.join(' · ')}</p></div><b>${euros(o.remainingAmount ?? o.total)}</b><i>›</i></button>`).join('') || '<div class="empty-cart">Aucune commande à encaisser.</div>'}</article><article class="panel payment">${selected ? `<span class="eyebrow">COMMANDE ${selected.id} · ${selected.table.toUpperCase()}</span><h2>${euros(selected.remainingAmount ?? selected.total)}</h2><div class="receipt-line"><span>Montant dû</span><b>${euros(selected.remainingAmount ?? selected.total)}</b></div><hr/><h3>Mode de règlement</h3><div class="payment-methods"><button class="${state.paymentMethod==='card'?'selected':''}" onclick="setPaymentMethod('card')">▣<span>Carte</span></button><button class="${state.paymentMethod==='cash'?'selected':''}" onclick="setPaymentMethod('cash')">▤<span>Espèces</span></button><button class="${state.paymentMethod==='mobile_money'?'selected':''}" onclick="setPaymentMethod('mobile_money')">◉<span>Mobile money</span></button></div><button class="button full" onclick="paySelectedOrder()">Encaisser ${euros(selected.remainingAmount ?? selected.total)}</button><button class="text-button centered" onclick="splitPayment()">Diviser l’addition</button>` : '<h2>Caisse à jour</h2><p>Toutes les commandes ont été encaissées.</p>'}<hr/><button class="secondary-button full" onclick="openCashRegister()">Ouvrir la caisse</button><button class="secondary-button full" onclick="closeCashRegister()">Clôturer la caisse</button><button class="text-button centered" onclick="configureWaitTime()">Configurer le temps d’attente</button></article></section>`); }
function loginScreen() { return `<main class="auth-page"><section class="auth-card"><a class="brand" href="/"><span>✦</span> épicéa</a><p class="eyebrow">BACK OFFICE SÉCURISÉ</p><h1>Connexion à votre espace</h1><p>Utilisez vos identifiants personnels pour accéder aux opérations du restaurant.</p><form onsubmit="login(event)"><label>Adresse email<input id="login-email" type="email" value="admin@epicea.local" required autocomplete="username" /></label><label>Mot de passe<input id="login-password" type="password" value="Admin2026!" required autocomplete="current-password" /></label><button class="button full" type="submit">Se connecter</button></form><p class="auth-hint">Démo super administrateur : admin@epicea.local</p></section></main>`; }


function servers() {
  const tables = state.tables;
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
  return layout(`<section class="floor-toolbar"><div class="floor-toolbar-copy"><p>Sélectionnez une table pour consulter ou gérer sa commande.</p>${mergeHint}${unmergeHint}</div><div class="floor-toolbar-actions"><button class="button" type="button" onclick="openTableCreateModal()">＋ Ajouter une table</button>${mergeActions}</div><div class="legend"><span><i class="free"></i>Libre</span><span><i class="occupied"></i>Occupée</span><span><i class="bill"></i>Réservée</span><span><i class="clean"></i>À nettoyer</span></div></section><section class="floor-layout"><article class="floor-plan"><div class="room-label bar">BAR</div><div class="table-grid">${tables.map(table => { const selected = state.selectedMergeTableIds.includes(table.id); const action = state.tableMergeMode ? `toggleMergeTable(${table.id})` : state.tableUnmergeMode ? (table.merged_table_ids?.length > 1 ? `unmergeTable(${table.id})` : 'showToast(\'Cette table ne fait pas partie d’une fusion\')') : `openTableModal(${table.id})`; return `<button class="table ${statusClass[table.status] || 'free'} ${table.number % 3 === 0 ? 'round' : ''} ${state.tableMergeMode || state.tableUnmergeMode ? 'merge-selectable' : ''} ${selected ? 'merge-selected' : ''}" ${state.tableMergeMode ? `aria-pressed="${selected}"` : ''} onclick="${action}">${label(table)}<span>${table.capacity} pers.</span>${table.reservations?.length ? '<i aria-label="Table réservée">R</i>' : ''}</button>`; }).join('')}</div><div class="room-label terrace">TERRASSE</div></article><aside class="servers-panel"><div class="servers-panel-heading"><h3>Serveurs</h3><span>${serverList.length}</span></div>${serverList.map(server => { const assigned = tables.filter(table => table.server_name === server.display_name); const initials = server.display_name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(); return `<div class="server-row"><span class="server-avatar">${initials}</span><div><strong>${server.display_name}</strong><p>${assigned.length ? `Tables ${assigned.map(label).join(', ')}` : 'Aucune table affectée'}</p></div><span class="server-table-count">${assigned.length}</span></div>`; }).join('') || '<p class="servers-empty">Aucun serveur enregistré.</p>'}</aside></section>${state.tableModalId ? tableModal() : ''}${state.tableCreateMode ? tableCreateModal() : ''}${state.tableMergeConfirmMode ? tableMergeModal() : ''}`);
}

function tableCreateModal() {
  const knownNumbers = state.tables.length ? state.tables.map(table => table.number) : [];
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
  return `<div class="table-modal-backdrop" role="presentation" onclick="if(event.target===this)closeTableModal()"><section class="table-modal" role="dialog" aria-modal="true" aria-labelledby="table-modal-title"><header class="table-modal-header"><div><p class="eyebrow">PLAN DE SALLE</p><h2 id="table-modal-title">Table ${table.number}</h2></div><button class="icon-button" type="button" aria-label="Fermer" onclick="closeTableModal()">×</button></header><div class="table-modal-summary"><div><span>Serveur assigné</span><strong>${server}</strong></div><div><span>État de la table</span><strong class="table-status-label ${table.status}">${({free:'Libre',occupied:'Occupée',reserved:'Réservée',cleaning:'À nettoyer'})[table.status] || table.status}</strong></div></div>${tableReservationPanel(table)}${state.tableOrdersLoading ? '<div class="table-modal-empty">Chargement de la commande…</div>' : order ? `<section class="table-current-order"><div class="table-current-order-heading"><div><p class="eyebrow">COMMANDE ACTUELLE</p><h3>${order.public_number}</h3></div><span class="order-status ${order.status}">${orderStatusLabels[order.status] || order.status}</span></div><ul>${orderLines.map(line => `<li><span>${line.quantity}× ${line.label}</span><b>${euros(line.quantity * line.unit_price)}</b></li>`).join('')}</ul>${order.notes ? `<p class="table-order-note">Note cuisine : ${order.notes}</p>` : ''}<div class="table-order-total"><span>Total</span><strong>${euros(order.total)}</strong></div><button class="secondary-button table-print-button" type="button" onclick="printTableReceipt()">▤ Imprimer le reçu / la facture</button></section>` : '<div class="table-modal-empty">Aucune commande actuelle pour cette table.</div>'}<section class="table-modal-actions"><button class="button" type="button" onclick="toggleTableOrderForm()">＋ Ajouter une commande</button><button class="secondary-button" type="button" ${order ? 'disabled title="La commande doit être réglée avant de libérer la table."' : ''} onclick="releaseTable(${table.id})">Rendre la table disponible</button></section>${order ? '<p class="table-release-hint">Réglez la commande actuelle avant de libérer la table.</p>' : ''}${state.tableAddMode ? `<form class="table-order-form" onsubmit="submitTableOrder(event)"><h3>Nouvelle commande · Table ${table.number}</h3><label>Plat<select required onchange="setTableOrderItem(Number(this.value))">${availableMenu.map(item => `<option value="${item.id}" ${item.id === state.tableNewItemId ? 'selected' : ''}>${item.name} · ${euros(item.price)}</option>`).join('')}</select></label><label>Quantité<input type="number" min="1" max="30" value="${state.tableNewQuantity}" required oninput="state.tableNewQuantity=Number(this.value)" /></label><label>Note pour la cuisine<textarea rows="2" maxlength="500" placeholder="Précisions utiles…" oninput="state.tableNewNote=this.value">${state.tableNewNote}</textarea></label><div class="table-order-form-actions"><button class="button" type="submit">Envoyer en cuisine</button><button class="text-button" type="button" onclick="toggleTableOrderForm(false)">Annuler</button></div></form>` : ''}<section class="table-print-receipt"><h1>Épicéa</h1><p>Reçu de commande</p><hr/><p><b>${order?.public_number || ''}</b> · Table ${table.number}</p><p>Serveur : ${server}</p><p>${order ? orderStatusLabels[order.status] || order.status : ''}</p><hr/>${orderLines.map(line => `<p>${line.quantity}× ${line.label}<span>${euros(line.quantity * line.unit_price)}</span></p>`).join('')}<hr/><p><b>Total</b><b>${order ? euros(order.total) : ''}</b></p>${order?.notes ? `<p>Note : ${order.notes}</p>` : ''}<p>${new Date().toLocaleString('fr-FR')}</p></section></section></div>`;
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

function handleExpiredSession() {
  const form = document.querySelector('.leave-request-form');
  if (form) state.leaveDraft = Object.fromEntries(new FormData(form));
  savedSession = null;
  state.session = null;
  state.syncVersion = null;
  state.leaveSubmitting = false;
  state.profileModalOpen = false;
  localStorage.removeItem('epicea-back-office-session');
  render(true);
  const hint = document.querySelector('.auth-hint');
  if (hint) hint.textContent = 'Votre session a expiré. Reconnectez-vous pour continuer : votre demande est conservée.';
}
function render(force = false) {
  if (!force && (document.activeElement?.closest('.leave-request-form') || state.leaveSubmitting)) return;
  const leaveForm = document.querySelector('.leave-request-form');
  if (leaveForm) state.leaveDraft = Object.fromEntries(new FormData(leaveForm));
  const leaveDraft = state.leaveDraft;
  if (!state.session) { document.getElementById('app').innerHTML = loginScreen(); return; }
  const views = { dashboard, front, kitchen, history: orderHistory, account, servers, cashier, manager, hr };
  document.getElementById('app').innerHTML = views[state.activeView]();
  if (leaveDraft) {
    const nextForm = document.querySelector('.leave-request-form');
    if (nextForm) for (const [name, value] of Object.entries(leaveDraft)) nextForm.elements.namedItem(name).value = value;
  }
  syncThemeButton();
  syncTableServerSelect();
  syncTableMergeAttribution();
  syncTableOrderGrouping();
  if (state.activeView === 'servers' && state.session.user.role === 'server') {
    const assignButton = document.querySelector('.table-detail .button.full');
    if (assignButton) assignButton.textContent = 'M’assigner une table';
  }
  syncTableReleaseButton();
  if (state.reservationModalOpen) updateReservationSubmit();
  window.enhanceVisuals?.();
}
function go(view) { if (view === 'logout') { logout(); return; } state.activeView = view; render(); }
function setFilter(filter) { state.filter = filter; render(); }
function setSelectedTable(tableId) { state.selectedTableId = Number(tableId) || 1; render(); }
function setOrderNote(note) { state.orderNote = String(note || '').slice(0, 500); }
function setOrderType(type) { state.orderType = type; if (type === 'Sur place' && !state.selectedTableId) state.selectedTableId = 1; render(); }
function selectCashOrder(id) { state.selectedOrderId = id; render(); }
function setPaymentMethod(method) { state.paymentMethod = method; render(); }
function editMyProfile() { state.profileModalOpen = true; render(); }
function closeProfileModal() { state.profileModalOpen = false; render(); }
function syncProfileFullName() {
  const firstName = document.getElementById('profile-first-name')?.value.trim() || '';
  const lastName = document.getElementById('profile-last-name')?.value.trim() || '';
  const fullName = document.getElementById('profile-name');
  if (fullName) fullName.value = `${firstName} ${lastName}`.trim();
}
async function submitProfileUpdate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.getElementById('profile-form-error');
  const firstName = form.first_name.value.trim();
  const lastName = form.last_name.value.trim();
  const email = form.email.value.trim();
  const currentPassword = form.current_password.value;
  const newPassword = form.new_password.value;
  if ((currentPassword && !newPassword) || (!currentPassword && newPassword)) { error.textContent = 'Saisissez votre mot de passe actuel et votre nouveau mot de passe.'; return; }
  const payload = { first_name: firstName, last_name: lastName, email };
  if (newPassword) { payload.current_password = currentPassword; payload.new_password = newPassword; }
  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/auth/me`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || 'Mise à jour impossible.');
    state.session.user = data;
    savedSession.user = data;
    localStorage.setItem('epicea-back-office-session', JSON.stringify(savedSession));
    state.profileModalOpen = false;
    showToast('Informations personnelles mises à jour');
  } catch (error) {
    submitButton.disabled = false;
    error && (document.getElementById('profile-form-error').textContent = error.message || 'Vérifiez les informations saisies.');
  }
}
async function login(event) { event.preventDefault(); const email = document.getElementById('login-email').value; const password = document.getElementById('login-password').value; try { const response = await nativeFetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); if (!response.ok) throw new Error(); const data = await response.json(); savedSession = { token: data.access_token, user: data.user, expiresAt: data.expires_at }; state.session = savedSession; state.syncVersion = null; state.orders = []; state.kitchenOrders = []; localStorage.setItem('epicea-back-office-session', JSON.stringify(savedSession)); render(); syncBackOffice(); } catch (_) { alert('Identifiants incorrects ou serveur indisponible.'); } }
async function logout() { try { await fetch(`${API_BASE}/auth/logout`, { method: 'POST' }); } catch (_) { /* La suppression locale reste prioritaire. */ } savedSession = null; state.session = null; localStorage.removeItem('epicea-back-office-session'); render(); }
function addToCart(id) { const item = menu.find(x => x.id === id); const inCart = state.cart.find(x => x.id === id); if (inCart) inCart.quantity++; else state.cart.push({ ...item, quantity: 1 }); showToast(`${item.name} ajouté au panier`); }
function removeFromCart(id) { const i = state.cart.findIndex(x=>x.id===id); if (state.cart[i].quantity > 1) state.cart[i].quantity--; else state.cart.splice(i,1); render(); }
async function sendOrder() {
  const draft = [...state.cart];
  const tableId = state.orderType === 'Sur place' ? Number(state.selectedTableId || state.tables[0]?.id) : null;
  if (state.orderType === 'Sur place' && !tableId) { showToast('Choisissez une table enregistrée.'); return; }
  const orderNote = state.orderNote.trim();
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
    if (!response.ok) { showToast('Envoi refus\u00e9. Votre brouillon est conserv\u00e9.'); return; }
    await response.json();
  } catch (_) {
    showToast('Connexion indisponible. Votre brouillon est conserv\u00e9.'); return;
  }
  await refreshOperations();
  state.cart = [];
  state.orderNote = '';
  showToast('Commande envoyée en cuisine. Merci !');
}
async function advanceOrder(id) {
  const order = state.kitchenOrders.find(item => item.id === id);
  if (!order?.remoteId) return;
  const status = order.status === 'reçue' ? 'preparing' : order.status === 'préparation' ? 'ready' : 'served';
  try {
    const response = await fetch(`${API_BASE}/orders/${order.remoteId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!response.ok) throw new Error();
    await refreshOperations();
    showToast('Statut de la commande mis à jour.');
  } catch (_) { showToast('Modification non enregistrée. Vérifiez la connexion et vos droits.'); }
}
async function cancelFirstOrder() { const order = state.orders[0]; if (!order || !confirm(`Annuler ${order.id} ? Cette action sera tracée.`)) return; try { if (order.remoteId) { const response = await fetch(`${API_BASE}/orders/${order.remoteId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) }); if (!response.ok) throw new Error(); } state.orders = state.orders.filter(item => item.id !== order.id); showToast('Commande annulée et journalisée'); } catch (_) { showToast('Annulation impossible hors connexion'); } }
async function paySelectedOrder() {
  const order = state.orders.find(item => item.id === state.selectedOrderId) || state.orders[0];
  if (!order?.remoteId) return;
  try {
    const response = await fetch(`${API_BASE}/orders/${order.remoteId}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: order.remainingAmount ?? order.total, method: state.paymentMethod, cashier_name: state.session.user.display_name }) });
    if (!response.ok) throw new Error();
    await refreshOperations();
    showToast('Paiement enregistré.');
  } catch (_) { showToast('Le paiement n’a pas pu être enregistré.'); }
}

async function toggleAvailability(id) { const item = menu.find(menuItem => menuItem.id === id); const available = item.available === false; item.available = available; render(); try { const response = await fetch(`${API_BASE}/menu/${id}/availability`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ available }) }); if (!response.ok) throw new Error(); showToast(available ? 'Plat rendu disponible' : 'Plat marqué indisponible'); } catch (_) { item.available = !available; showToast('Mise à jour impossible hors connexion'); } }
async function decideLeave(id, status) { try { const response = await fetch(`${API_BASE}/leave-requests/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); if (!response.ok) throw new Error(); state.leaveRequests = state.leaveRequests.map(request => request.id === id ? { ...request, status } : request); showToast(status === 'approved' ? 'Congé approuvé' : 'Demande refusée'); } catch (_) { showToast('Mise à jour impossible hors connexion'); } }
async function openService() { try { const response = await fetch(`${API_BASE}/services`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_date: new Date().toISOString().slice(0, 10), service_type: 'lunch', manager_name: 'Amadou Diallo' }) }); if (!response.ok) throw new Error(); showToast('Service du midi ouvert'); refreshOperations(); } catch (_) { showToast('Ouverture du service impossible'); } }
async function closeService() { const actualTotal = Number(prompt('Total réellement encaissé (€) :', String(state.dashboard.revenue))); if (!Number.isFinite(actualTotal)) return; try { const services = await (await fetch(`${API_BASE}/services`)).json(); const current = services.find(service => service.status === 'open'); if (!current) throw new Error(); const response = await fetch(`${API_BASE}/services/${current.id}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actual_total: actualTotal }) }); if (!response.ok) throw new Error(); const report = await response.json(); showToast(`Service clôturé · écart ${euros(report.discrepancy)}`); refreshOperations(); } catch (_) { showToast('Clôture du service impossible'); } }
async function closeCashRegister() { if (!state.dashboard.cash_register) { showToast('Aucune caisse ouverte aujourd\u2019hui'); return; } const actualTotal = Number(prompt('Montant compté dans la caisse (€) :', String(state.dashboard.revenue))); if (!Number.isFinite(actualTotal)) return; try { const response = await fetch(`${API_BASE}/cash-registers/${state.dashboard.cash_register.id}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actual_total: actualTotal }) }); if (!response.ok) throw new Error(); await refreshOperations(); showToast('Caisse clôturée'); } catch (_) { showToast('Clôture de caisse impossible'); } }

async function createMenuItem() { const name = prompt('Nom du plat :'); const price = Number(prompt('Prix (€) :', '10')); if (!name || !Number.isFinite(price)) return; try { const response = await fetch(`${API_BASE}/menu`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, category: 'Plats', price, description: '' }) }); if (!response.ok) throw new Error(); showToast('Plat ajouté à la carte'); loadMenuFromApi(); } catch (_) { showToast('Ajout du plat non autorisé'); } }
async function manageUsers() { const email = prompt('Email du compte :'); if (!email) return; const displayName = prompt('Nom affiché :'); const role = prompt('Profil : manager, server ou cashier', 'server'); const password = prompt('Mot de passe temporaire (8 caractères minimum) :', 'Bienvenue2026!'); if (!displayName || !password) return; try { const response = await fetch(`${API_BASE}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, display_name: displayName, password, role }) }); if (!response.ok) throw new Error(); showToast(`Compte ${role} créé`); } catch (_) { showToast('Création refusée : super administrateur requis'); } }
async function configureWaitTime() { const minutes = Number(prompt('Délai estimé en minutes :', '30')); if (!Number.isFinite(minutes)) return; try { const response = await fetch(`${API_BASE}/wait-time-rules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ min_orders: 0, max_orders: 5, estimated_minutes: minutes, updated_by: 'Caisse' }) }); if (!response.ok) throw new Error(); await refreshOperations(); showToast('Estimation d’attente mise à jour'); } catch (_) { showToast('Modification non autorisée'); } }
async function openCashRegister() { const openingFloat = Number(prompt('Fond de caisse (€) :', '100')); if (!Number.isFinite(openingFloat)) return; try { const response = await fetch(`${API_BASE}/cash-registers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opening_float: openingFloat, opened_by: state.session.user.display_name }) }); if (!response.ok) throw new Error(); await refreshOperations(); showToast('Caisse ouverte'); } catch (_) { showToast('Ouverture de caisse non autorisée'); } }
async function splitPayment() { const order = state.orders.find(item => item.id === state.selectedOrderId) || state.orders[0]; if (!order) return; const due = order.remainingAmount ?? order.total; const amount = Number(prompt(`Montant a encaisser sur ${euros(due)} :`, String(due / 2))); if (!Number.isFinite(amount)) return; try { const response = await fetch(`${API_BASE}/orders/${order.remoteId}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, method: state.paymentMethod }) }); if (!response.ok) throw new Error(); const result = await response.json(); showToast(result.remaining_amount ? `Solde restant : ${euros(result.remaining_amount)}` : 'Addition réglée'); loadApplicationData(); } catch (_) { showToast('Division de l’addition impossible'); } }
async function reassignTable() { const tableId = Number(prompt(state.session?.user?.role === 'server' ? 'Numéro de la table à vous assigner :' : 'Numéro de la table à réassigner :', '4')); const serverName = state.session?.user?.role === 'server' ? state.session.user.display_name : prompt('Nom du serveur :', 'Mariam Sarr'); if (!tableId || !serverName) return; try { const response = await fetch(`${API_BASE}/tables/${tableId}/assignment`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ server_name: serverName }) }); if (!response.ok) throw new Error(); showToast(state.session?.user?.role === 'server' ? `Vous êtes assigné(e) à la table ${tableId}` : `Table ${tableId} réassignée à ${serverName}`); syncBackOffice(); } catch (_) { showToast('Réassignation impossible'); } }
async function showTableHistory(tableId) { try { const response = await fetch(`${API_BASE}/tables/${tableId}/history`); if (!response.ok) throw new Error(); const history = await response.json(); showToast(`Table ${tableId} : ${history.length} commande(s) dans l’historique`); } catch (_) { showToast('Historique de table indisponible'); } }
let menuSignature = '';
async function loadMenuFromApi() {
  try {
    const response = await fetch(`${API_BASE}/menu`);
    if (!response.ok) return;
    const remoteMenu = await response.json();
    const signature = JSON.stringify(remoteMenu);
    if (signature === menuSignature) return;
    menuSignature = signature;
    menu.splice(0, menu.length, ...remoteMenu.map(remote => ({ ...remote, emoji: '\u{1F37D}', tags: [...(remote.dietary_tags || []), ...(remote.featured ? ['Suggestion'] : [])] })));
    if (['front', 'manager'].includes(state.activeView)) renderBackground();
  } catch (_) { /* Keep the last loaded menu available while offline. */ }
}
async function loadApplicationData() { state.syncVersion = null; await syncBackOffice(); }
async function refreshOperations() { state.syncVersion = null; await syncBackOffice(); }
let syncInProgress = false;
let pendingBackgroundRender = false;
function renderBackground() {
  if (state.reservationModalOpen || state.profileModalOpen || state.leaveSubmitting || document.activeElement?.closest('form')) {
    pendingBackgroundRender = true;
    return;
  }
  pendingBackgroundRender = false;
  render();
}
document.addEventListener('focusout', () => {
  if (pendingBackgroundRender) setTimeout(renderBackground, 0);
});
function mapApiOrder(order, labels) { const createdAt = new Date(/[Zz]|[+-]\d\d:\d\d$/.test(order.created_at) ? order.created_at : order.created_at.replace(' ', 'T') + 'Z'); return { id: order.public_number, remoteId: order.id, elapsedMinutes: Math.max(0, (Date.now() - createdAt.getTime()) / 60000), remainingAmount: order.remaining_amount ?? order.total, table: order.table_number ? `Table ${order.table_number}` : 'À emporter', type: order.order_type === 'dine_in' ? 'Sur place' : 'À emporter', date: createdAt.toLocaleDateString('fr-FR'), time: createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), status: labels[order.status] || 'reçue', paymentStatus: order.payment_status, items: order.lines.map(line => `${line.quantity}× ${line.label}`), note: order.notes, total: order.total }; }
async function syncBackOffice() {
  if (!state.session || syncInProgress) return;
  syncInProgress = true;
  try {
    const query = state.syncVersion === null ? '' : `?since=${state.syncVersion}`;
    const response = await fetch(`${API_BASE}/back-office/snapshot${query}`);
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (data.version === state.syncVersion) return;
    state.syncVersion = data.version;
    if (data.user) {
      state.session.user = data.user;
      localStorage.setItem('epicea-back-office-session', JSON.stringify(state.session));
    }
    const labels = data.status_labels;
    state.orders = data.orders.map(order => mapApiOrder(order, labels));
    state.orderHistory = (data.order_history || data.orders).map(order => mapApiOrder(order, labels));
    state.selectedOrderId = state.orders.some(order => order.id === state.selectedOrderId) ? state.selectedOrderId : state.orders[0]?.id || null;
    state.tables = data.tables;
    if (!state.tables.some(table => table.id === state.selectedTableId)) state.selectedTableId = state.tables[0]?.id || null;
    state.servers = data.servers || [];
    state.serverCalls = data.server_calls;
    state.leaveRequests = data.leave_requests;
    state.auditLogs = data.audit_logs;
    state.dashboard = normalizeDashboard(data.dashboard);
    state.kitchenOrders = (data.kitchen_orders || data.orders).map(order => mapApiOrder(order, labels));
    state.employee = data.employee || null;
    state.shifts = data.shifts || [];
    if (state.activeView === 'account' && state.accountTab === 'leave') await loadMyLeaveRequests(false);
    renderBackground();
  } catch (_) { /* Conservation du dernier état affiché en cas de perte réseau. */ }
  finally { syncInProgress = false; }
}
function reservationDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Dakar' }).format(date);
}
function tableReservationPanel(table) {
  const reservations = table.reservations || [];
  return `<section class="table-reservation-panel" aria-label="Réservations de la table"><h3>Réservations</h3>${reservations.map(item => `<article class="reservation-summary"><strong>${escapeAttribute(item.customer_name)}</strong><p>${item.party_size} personne(s) · ${escapeAttribute(reservationDate(item.reserved_at))} (Dakar)</p><p>Tables ${escapeAttribute(item.table_numbers.join(', '))} · ${item.duration_minutes} minutes</p>${item.notes ? `<p class="reservation-note">${escapeAttribute(item.notes)}</p>` : ''}<button class="secondary-button" type="button" onclick="cancelTableReservation(${item.id})">Annuler la réservation</button></article>`).join('') || '<p>Aucune réservation à venir pour cette table.</p>'}<button class="text-button" type="button" onclick="createReservation(${table.id})">+ Ajouter une réservation</button></section>`;
}
function createReservation(tableId = null) {
  state.reservationDraft = { customerName: '', partySize: 2, reservedAt: '', notes: '', tableIds: [], preferredTable: tableId };
  state.reservationTables = [];
  state.reservationLoading = false;
  state.reservationSaving = false;
  state.reservationRequest++;
  state.reservationModalOpen = true;
  render();
  document.getElementById('reservation-name')?.focus();
}
function closeReservationModal() {
  if (state.reservationSaving) return;
  state.reservationModalOpen = false;
  state.reservationRequest++;
  render();
}
function reservationOptions() {
  const draft = state.reservationDraft;
  if (state.reservationLoading) return '<p role="status">Recherche des tables disponibles…</p>';
  if (!draft?.reservedAt) return '<p>Renseignez la date et l’heure pour afficher les disponibilités.</p>';
  if (!state.reservationTables.length) return '<p>Aucune table disponible pour ce créneau.</p>';
  return `<label for="reservation-tables">Tables disponibles (${state.reservationTables.length})</label><select id="reservation-tables" name="table_ids" multiple size="${Math.min(6, state.reservationTables.length)}" required onchange="updateReservationSelection(this)">${state.reservationTables.map(table => `<option value="${table.id}" ${draft.tableIds.includes(table.id) ? 'selected' : ''}>Table ${escapeAttribute(table.display_number || table.number)} · ${table.capacity} places</option>`).join('')}</select><p class="reservation-help">Sélectionnez une ou plusieurs tables (Ctrl/Cmd + clic sur ordinateur). La capacité totale doit couvrir le nombre de personnes.</p><p id="reservation-capacity" aria-live="polite"></p>`;
}
function reservationModal() {
  if (!state.reservationModalOpen) return '';
  const draft = state.reservationDraft;
  return `<div class="table-modal-backdrop reservation-backdrop" onclick="if(event.target===this)closeReservationModal()"><section class="table-modal reservation-modal" role="dialog" aria-modal="true" aria-labelledby="reservation-title"><header class="table-modal-header"><div><p class="eyebrow">ACCUEILLIR VOS CLIENTS</p><h2 id="reservation-title">Nouvelle réservation</h2></div><button type="button" class="icon-button" aria-label="Fermer la réservation" onclick="closeReservationModal()" ${state.reservationSaving ? 'disabled' : ''}>×</button></header><p>Heure de Dakar (UTC). Chaque réservation bloque les tables pendant 2 heures.</p><form id="reservation-form" class="reservation-form" onsubmit="submitReservation(event)"><label for="reservation-name">Nom de la réservation<input id="reservation-name" name="customer_name" minlength="2" maxlength="100" required value="${escapeAttribute(draft.customerName)}" oninput="state.reservationDraft.customerName=this.value" autocomplete="name" /></label><div class="reservation-fields"><label for="reservation-party">Nombre de personnes<input id="reservation-party" name="party_size" type="number" min="1" max="30" required value="${draft.partySize}" oninput="state.reservationDraft.partySize=Number(this.value);updateReservationSubmit()" /></label><label for="reservation-date">Date et heure de la réservation<input id="reservation-date" name="reserved_at" type="datetime-local" min="${new Date().toISOString().slice(0,16)}" required value="${escapeAttribute(draft.reservedAt)}" oninput="state.reservationDraft.reservedAt=this.value;loadReservationAvailability()" /></label></div><label for="reservation-notes">Note et précisions du client<textarea id="reservation-notes" name="notes" rows="3" maxlength="1000" oninput="state.reservationDraft.notes=this.value">${escapeAttribute(draft.notes)}</textarea></label><div id="reservation-availability">${reservationOptions()}</div><p id="reservation-error" role="alert" class="reservation-error"></p><div class="reservation-actions"><button class="secondary-button" type="button" onclick="closeReservationModal()" ${state.reservationSaving ? 'disabled' : ''}>Annuler</button><button class="button" type="submit" id="reservation-submit" disabled>Enregistrer la réservation</button></div></form></section></div>`;
}
function updateReservationSelection(select) {
  state.reservationDraft.tableIds = Array.from(select.selectedOptions, option => Number(option.value));
  updateReservationSubmit();
}
function updateReservationSubmit() {
  const draft = state.reservationDraft;
  if (!draft) return;
  const capacity = state.reservationTables.filter(table => draft.tableIds.includes(table.id)).reduce((sum, table) => sum + table.capacity, 0);
  const output = document.getElementById('reservation-capacity');
  if (output) output.textContent = `${draft.tableIds.length} table(s) sélectionnée(s) · ${capacity} place(s) pour ${draft.partySize || 0} personne(s)`;
  const button = document.getElementById('reservation-submit');
  if (button) button.disabled = state.reservationLoading || state.reservationSaving || !draft.reservedAt || !draft.tableIds.length || !draft.partySize || capacity < draft.partySize;
}
async function loadReservationAvailability() {
  const draft = state.reservationDraft;
  const request = ++state.reservationRequest;
  state.reservationLoading = true;
  state.reservationTables = [];
  draft.tableIds = [];
  const container = document.getElementById('reservation-availability');
  const error = document.getElementById('reservation-error');
  if (error) error.textContent = '';
  if (container) container.innerHTML = reservationOptions();
  updateReservationSubmit();
  try {
    if (!draft.reservedAt) return;
    const response = await fetch(`${API_BASE}/reservations/availability?reserved_at=${encodeURIComponent(draft.reservedAt + ':00Z')}`);
    const result = await response.json();
    if (request !== state.reservationRequest || !state.reservationModalOpen) return;
    if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Disponibilités indisponibles. Vérifiez la date et l’heure.');
    state.reservationTables = result.tables;
    if (draft.preferredTable && result.tables.some(table => table.id === draft.preferredTable)) draft.tableIds = [draft.preferredTable];
  } catch (failure) {
    if (request === state.reservationRequest && error) error.textContent = failure.message || 'Impossible de charger les disponibilités.';
  } finally {
    if (request === state.reservationRequest) {
      state.reservationLoading = false;
      if (container) container.innerHTML = reservationOptions();
      updateReservationSubmit();
    }
  }
}
async function submitReservation(event) {
  event.preventDefault();
  if (state.reservationSaving || state.reservationLoading) return;
  const draft = state.reservationDraft;
  const error = document.getElementById('reservation-error');
  state.reservationSaving = true;
  updateReservationSubmit();
  try {
    const response = await fetch(`${API_BASE}/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_name: draft.customerName.trim(), party_size: draft.partySize, reserved_at: draft.reservedAt + ':00Z', notes: draft.notes.trim(), table_ids: draft.tableIds }) });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 409) await loadReservationAvailability();
      throw new Error(typeof result.detail === 'string' ? result.detail : 'Vérifiez les informations de la réservation.');
    }
    state.reservationModalOpen = false;
    await refreshOperations();
    showToast('Réservation enregistrée.');
  } catch (failure) {
    if (error) error.textContent = failure.message || 'La réservation n’a pas pu être enregistrée.';
  } finally {
    state.reservationSaving = false;
    updateReservationSubmit();
  }
}
async function cancelTableReservation(id) {
  if (!confirm('Annuler cette réservation pour toutes ses tables ?')) return;
  try {
    const response = await fetch(`${API_BASE}/reservations/${id}/cancel`, { method: 'POST' });
    if (!response.ok) throw new Error();
    await refreshOperations();
    showToast('Réservation annulée. Les tables sont à jour.');
  } catch (_) { showToast('Annulation impossible. Actualisez les données et réessayez.'); }
}
// Preserve inline template handlers while the runtime is loaded as an ES module.
Object.assign(window, { createReservation, closeReservationModal, loadReservationAvailability, updateReservationSelection, updateReservationSubmit, submitReservation, cancelTableReservation, state, navigationForCurrentUser, euros, cartTotal, getTitle, showToast, serviceDateLabel, mobileNavigation, escapeAttribute, profileNameParts, profileModal, layout, dashboard, front, kitchen, orderHistory, account, setAccountTab, loadMyLeaveRequests, submitLeaveRequest, filterOrderHistory, servers, cashier, manager, hr, loginScreen, tableCreateModal, openTableCreateModal, closeTableCreateModal, tableMergeModal, startTableMerge, startTableUnmerge, cancelTableUnmergeSelection, cancelTableMergeSelection, toggleMergeTable, openTableMergeModal, closeTableMergeModal, submitTableMerge, submitTableCreate, currentTableOrder, syncTableOrderGrouping, tableModal, openTableModal, loadTableOrders, closeTableModal, toggleTableOrderForm, setTableOrderItem, syncTableServerSelect, assignTableServer, toggleTheme, syncThemeButton, submitTableOrder, releaseTable, printTableReceipt, syncTableReleaseButton, unmergeTable, syncTableMergeAttribution, handleExpiredSession, render, go, setFilter, setSelectedTable, setOrderNote, setOrderType, selectCashOrder, setPaymentMethod, editMyProfile, closeProfileModal, syncProfileFullName, submitProfileUpdate, login, logout, addToCart, removeFromCart, sendOrder, advanceOrder, cancelFirstOrder, paySelectedOrder, toggleAvailability, decideLeave, openService, closeService, closeCashRegister, createReservation, createMenuItem, manageUsers, configureWaitTime, openCashRegister, splitPayment, reassignTable, showTableHistory, loadMenuFromApi, loadApplicationData, refreshOperations, mapApiOrder, syncBackOffice });
render();
loadMenuFromApi();
syncBackOffice();
setInterval(() => {
  if (state.session && !document.hidden) {
    syncBackOffice();
  }
}, 2000);
setInterval(() => {
  if (state.session && !document.hidden) loadMenuFromApi();
}, 30000);
