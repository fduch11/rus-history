'use strict';

(() => {
  const modal = document.getElementById('eventModal');
  const modalTitle = document.getElementById('modalTitle');
  const timeline = document.getElementById('timeline');
  const resetFilters = document.getElementById('resetFilters');

  if (!modal || !modalTitle || !timeline) return;

  const HASH_PATTERN = /^#event-(\d+)$/u;
  let applyingHash = false;
  let suppressCloseSync = false;

  function eventById(id) {
    return HISTORY_EVENTS.find(event => event.id === id) || null;
  }

  function activeEvent() {
    const title = modalTitle.textContent.trim();
    return HISTORY_EVENTS.find(event => event.title === title) || null;
  }

  function eventHash(id) {
    return `#event-${id}`;
  }

  function clearHash() {
    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    history.replaceState(null, '', cleanUrl);
  }

  function openCard(id) {
    const card = timeline.querySelector(`[data-id="${id}"]`);
    if (!card) return false;
    card.click();
    return true;
  }

  function openEventFromHash(id) {
    const event = eventById(id);
    if (!event) {
      if (modal.open) {
        suppressCloseSync = true;
        modal.close();
      }
      clearHash();
      return;
    }

    applyingHash = true;
    if (openCard(id)) {
      applyingHash = false;
      return;
    }

    if (resetFilters) resetFilters.click();
    requestAnimationFrame(() => {
      openCard(id);
      applyingHash = false;
    });
  }

  function handleHash() {
    const match = window.location.hash.match(HASH_PATTERN);
    if (!match) {
      if (modal.open) {
        suppressCloseSync = true;
        modal.close();
      }
      return;
    }

    openEventFromHash(Number(match[1]));
  }

  function syncHashFromModal() {
    if (!modal.open || applyingHash) return;
    const event = activeEvent();
    if (!event) return;
    const nextHash = eventHash(event.id);
    if (window.location.hash !== nextHash) history.pushState(null, '', nextHash);
  }

  const titleObserver = new MutationObserver(syncHashFromModal);
  titleObserver.observe(modalTitle, { childList: true, characterData: true, subtree: true });

  modal.addEventListener('close', () => {
    if (suppressCloseSync) {
      suppressCloseSync = false;
      return;
    }
    if (HASH_PATTERN.test(window.location.hash)) clearHash();
  });

  window.addEventListener('hashchange', handleHash);
  window.addEventListener('popstate', handleHash);

  handleHash();
})();
