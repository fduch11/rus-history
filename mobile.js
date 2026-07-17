'use strict';
(() => {
  const root = document.documentElement;
  let frame = 0;

  function updateViewportHeight() {
    frame = 0;
    const viewport = window.visualViewport;
    const height = viewport ? viewport.height : window.innerHeight;
    root.style.setProperty('--app-viewport-height', `${Math.round(height)}px`);
    root.classList.toggle('keyboard-visible', Boolean(viewport && window.innerHeight - viewport.height > 120));
  }

  function scheduleUpdate() {
    if (frame) return;
    frame = window.requestAnimationFrame(updateViewportHeight);
  }

  window.addEventListener('resize', scheduleUpdate, { passive: true });
  window.addEventListener('orientationchange', scheduleUpdate, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleUpdate, { passive: true });
    window.visualViewport.addEventListener('scroll', scheduleUpdate, { passive: true });
  }

  document.addEventListener('focusin', event => {
    if (!event.target.matches('input, select, textarea')) return;
    window.setTimeout(() => event.target.scrollIntoView({ block: 'center', inline: 'nearest' }), 120);
  });

  updateViewportHeight();
})();
