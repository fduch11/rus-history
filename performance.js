'use strict';

(() => {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;

  const INPUT_DELAY = 160;
  let timer = 0;
  let composing = false;

  function forwardInput() {
    window.clearTimeout(timer);
    timer = 0;
    const forwarded = new Event('input', { bubbles: true });
    Object.defineProperty(forwarded, 'historyPerformanceForwarded', { value: true });
    searchInput.dispatchEvent(forwarded);
  }

  function scheduleInput() {
    window.clearTimeout(timer);
    timer = window.setTimeout(forwardInput, INPUT_DELAY);
  }

  searchInput.addEventListener('compositionstart', () => {
    composing = true;
    window.clearTimeout(timer);
  }, true);

  searchInput.addEventListener('compositionend', () => {
    composing = false;
    scheduleInput();
  }, true);

  searchInput.addEventListener('input', event => {
    if (event.historyPerformanceForwarded) return;
    event.stopImmediatePropagation();
    if (!composing) scheduleInput();
  }, true);

  searchInput.addEventListener('change', () => {
    if (timer) forwardInput();
  }, true);

  searchInput.addEventListener('blur', () => {
    if (timer) forwardInput();
  }, true);

  window.addEventListener('pagehide', () => {
    if (timer) forwardInput();
  }, { once: true });
})();