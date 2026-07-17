'use strict';

(() => {
  const STORAGE_KEY = 'rusHistoryReading';
  const root = document.documentElement;
  const panel = document.getElementById('readingSettings');
  const buttons = panel ? [...panel.querySelectorAll('[data-text-size]')] : [];
  const status = document.getElementById('readingStatus');
  const validSizes = new Set(['small', 'medium', 'large']);

  if (!panel || buttons.length === 0) return;

  function readSettings() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  function writeSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Настройки остаются применёнными до закрытия страницы.
    }
  }

  function currentTheme() {
    return root.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function applySize(size, announce = false) {
    const normalized = validSizes.has(size) ? size : 'medium';
    root.dataset.textSize = normalized;
    buttons.forEach(button => {
      const active = button.dataset.textSize === normalized;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    writeSettings({ ...readSettings(), theme: currentTheme(), textSize: normalized });
    if (announce && status) {
      const labels = { small: 'Мелкий', medium: 'Средний', large: 'Крупный' };
      status.textContent = `Размер текста: ${labels[normalized]}.`;
    }
  }

  buttons.forEach(button => {
    button.addEventListener('click', () => applySize(button.dataset.textSize || 'medium', true));
  });

  const stored = readSettings();
  applySize(validSizes.has(stored.textSize) ? stored.textSize : 'medium');

  new MutationObserver(() => {
    const settings = readSettings();
    writeSettings({ ...settings, theme: currentTheme(), textSize: root.dataset.textSize || 'medium' });
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
})();