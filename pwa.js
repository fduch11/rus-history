'use strict';

(() => {
  if (!('serviceWorker' in navigator)) return;
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(error => {
      console.warn('Не удалось зарегистрировать service worker:', error);
    });
  }, { once: true });
})();
