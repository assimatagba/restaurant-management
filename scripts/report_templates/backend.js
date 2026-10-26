(() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function openTab(key, focus = false) {
    const active = tabs.find(tab => tab.dataset.tab === key) || tabs[0];
    for (const tab of tabs) {
      const selected = tab === active;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    }
    if (focus) active.focus();
    history.replaceState(null, '', '#' + active.dataset.tab);
  }
  document.addEventListener('click', event => {
    const control = event.target.closest('[data-tab], [data-open]');
    if (control) openTab(control.dataset.tab || control.dataset.open, Boolean(control.dataset.open));
  });
  document.querySelector('[role="tablist"]').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = tabs.indexOf(document.activeElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    openTab(tabs[index].dataset.tab, true);
  });
  for (const search of document.querySelectorAll('[data-search]')) {
    search.addEventListener('input', () => {
      const list = document.querySelector(`[data-suite="${search.dataset.search}"]`);
      const query = search.value.trim().toLocaleLowerCase('fr-FR');
      let visible = 0;
      for (const card of list.querySelectorAll('.test-card')) {
        card.hidden = !card.textContent.toLocaleLowerCase('fr-FR').includes(query);
        if (!card.hidden) visible++;
      }
      list.nextElementSibling.hidden = visible !== 0;
    });
  }
  window.addEventListener('hashchange', () => openTab(location.hash.slice(1)));
  openTab(location.hash.slice(1));
})();
