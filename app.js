'use strict';
(() => {
  const AppConfig = Object.freeze({
    schemaVersion: 2,
    storageKey: 'rusHistory',
    legacyKeys: Object.freeze({
      theme: 'rusHistoryTheme',
      favorites: 'rusHistoryFavorites'
    }),
    defaultTheme: 'light',
    validThemes: Object.freeze(['light', 'dark']),
    defaultPeriod: 'Все'
  });

  const Storage = (() => {
    const createDefaults = () => ({
      schemaVersion: AppConfig.schemaVersion,
      preferences: {
        theme: null
      },
      collections: {
        favorites: []
      },
      interface: {
        query: '',
        period: AppConfig.defaultPeriod,
        favoritesOnly: false
      }
    });

    const normalizeFavorites = value => {
      if (!Array.isArray(value)) return [];
      return [...new Set(value.map(Number).filter(Number.isFinite))];
    };

    const normalizeTheme = value => AppConfig.validThemes.includes(value) ? value : null;

    const normalize = value => {
      const defaults = createDefaults();
      if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;

      return {
        schemaVersion: AppConfig.schemaVersion,
        preferences: {
          theme: normalizeTheme(value.preferences && value.preferences.theme)
        },
        collections: {
          favorites: normalizeFavorites(value.collections && value.collections.favorites)
        },
        interface: {
          query: typeof (value.interface && value.interface.query) === 'string' ? value.interface.query : '',
          period: typeof (value.interface && value.interface.period) === 'string' ? value.interface.period : AppConfig.defaultPeriod,
          favoritesOnly: Boolean(value.interface && value.interface.favoritesOnly)
        }
      };
    };

    const readJson = key => {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? null : JSON.parse(raw);
      } catch {
        return null;
      }
    };

    const writeJson = (key, value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    };

    const remove = key => {
      try {
        localStorage.removeItem(key);
      } catch {
        // Приложение продолжает работу даже при недоступном localStorage.
      }
    };

    const migrateLegacy = () => {
      const migrated = createDefaults();
      const legacyTheme = (() => {
        try {
          return localStorage.getItem(AppConfig.legacyKeys.theme);
        } catch {
          return null;
        }
      })();
      const legacyFavorites = readJson(AppConfig.legacyKeys.favorites);

      migrated.preferences.theme = normalizeTheme(legacyTheme);
      migrated.collections.favorites = normalizeFavorites(legacyFavorites);
      return migrated;
    };

    const load = () => {
      const stored = readJson(AppConfig.storageKey);
      let data;

      if (stored && stored.schemaVersion === AppConfig.schemaVersion) {
        data = normalize(stored);
      } else if (stored && typeof stored === 'object') {
        data = normalize(stored);
      } else {
        data = migrateLegacy();
      }

      writeJson(AppConfig.storageKey, data);
      remove(AppConfig.legacyKeys.theme);
      remove(AppConfig.legacyKeys.favorites);
      return data;
    };

    const save = data => writeJson(AppConfig.storageKey, normalize(data));

    return Object.freeze({ load, save });
  })();

  const persisted = Storage.load();
  const state = {
    query: persisted.interface.query,
    period: persisted.interface.period,
    favoritesOnly: persisted.interface.favoritesOnly,
    favorites: new Set(persisted.collections.favorites),
    theme: persisted.preferences.theme,
    activeEventId: null
  };

  const elements = {
    timeline: document.getElementById('timeline'),
    filters: document.getElementById('periodFilters'),
    searchInput: document.getElementById('searchInput'),
    favoritesOnly: document.getElementById('favoritesOnly'),
    resultCount: document.getElementById('resultCount'),
    emptyState: document.getElementById('emptyState'),
    themeToggle: document.getElementById('themeToggle'),
    modal: document.getElementById('eventModal'),
    modalClose: document.getElementById('modalClose'),
    modalFavorite: document.getElementById('modalFavorite'),
    modalImage: document.getElementById('modalImage'),
    modalPeriod: document.getElementById('modalPeriod'),
    modalYear: document.getElementById('modalYear'),
    modalTitle: document.getElementById('modalTitle'),
    modalDescription: document.getElementById('modalDescription')
  };

  function saveState() {
    Storage.save({
      schemaVersion: AppConfig.schemaVersion,
      preferences: { theme: state.theme },
      collections: { favorites: [...state.favorites] },
      interface: {
        query: state.query,
        period: state.period,
        favoritesOnly: state.favoritesOnly
      }
    });
  }

  function setTheme(theme, persist = true) {
    state.theme = AppConfig.validThemes.includes(theme) ? theme : AppConfig.defaultTheme;
    document.documentElement.dataset.theme = state.theme;
    elements.themeToggle.textContent = state.theme === 'dark' ? '☀' : '☾';
    elements.themeToggle.setAttribute('aria-label', state.theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
    if (persist) saveState();
  }

  function initTheme() {
    const preferred = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : AppConfig.defaultTheme;
    setTheme(state.theme || preferred, false);
  }

  function createFilters() {
    const periods = [AppConfig.defaultPeriod, ...new Set(HISTORY_EVENTS.map(event => event.period))];
    if (!periods.includes(state.period)) state.period = AppConfig.defaultPeriod;
    elements.filters.innerHTML = periods.map(period => `<button class="filter-button${period === state.period ? ' active' : ''}" type="button" data-period="${period}">${period}</button>`).join('');
  }

  function visibleEvents() {
    const query = state.query.trim().toLocaleLowerCase('ru');
    return HISTORY_EVENTS.filter(event => {
      const text = `${event.year} ${event.title} ${event.summary} ${event.description} ${event.period}`.toLocaleLowerCase('ru');
      return (state.period === AppConfig.defaultPeriod || event.period === state.period)
        && (!state.favoritesOnly || state.favorites.has(event.id))
        && (!query || text.includes(query));
    });
  }

  function render() {
    const events = visibleEvents();
    elements.timeline.innerHTML = events.map(event => {
      const favorite = state.favorites.has(event.id);
      return `<article class="event-card" data-id="${event.id}" tabindex="0" aria-label="${event.year}. ${event.title}"><img class="event-image" src="${event.image}" alt="Иллюстрация к событию «${event.title}»"><div class="event-body"><div class="event-top"><div><p class="event-year">${event.year}</p><h2 class="event-title">${event.title}</h2></div><button class="favorite-button${favorite ? ' active' : ''}" type="button" data-favorite-id="${event.id}" aria-label="${favorite ? 'Удалить из избранного' : 'Добавить в избранное'}">${favorite ? '★' : '☆'}</button></div><p class="event-summary">${event.summary}</p><span class="period-badge">${event.period}</span></div></article>`;
    }).join('');
    elements.resultCount.textContent = `Событий: ${events.length}`;
    elements.emptyState.hidden = events.length !== 0;
  }

  function updateModalFavorite() {
    const active = state.favorites.has(state.activeEventId);
    elements.modalFavorite.textContent = active ? '★ Удалить из избранного' : '☆ Добавить в избранное';
  }

  function toggleFavorite(id) {
    state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
    saveState();
    render();
    if (state.activeEventId === id) updateModalFavorite();
  }

  function openModal(id) {
    const event = HISTORY_EVENTS.find(item => item.id === id);
    if (!event) return;
    state.activeEventId = id;
    elements.modalImage.src = event.image;
    elements.modalImage.alt = `Иллюстрация к событию «${event.title}»`;
    elements.modalPeriod.textContent = event.period;
    elements.modalYear.textContent = event.year;
    elements.modalTitle.textContent = event.title;
    elements.modalDescription.textContent = event.description;
    updateModalFavorite();
    elements.modal.showModal();
  }

  elements.filters.addEventListener('click', event => {
    const button = event.target.closest('[data-period]');
    if (!button) return;
    state.period = button.dataset.period;
    createFilters();
    saveState();
    render();
  });

  elements.searchInput.addEventListener('input', () => {
    state.query = elements.searchInput.value;
    saveState();
    render();
  });

  elements.favoritesOnly.addEventListener('change', () => {
    state.favoritesOnly = elements.favoritesOnly.checked;
    saveState();
    render();
  });

  elements.themeToggle.addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));

  elements.timeline.addEventListener('click', event => {
    const favoriteButton = event.target.closest('[data-favorite-id]');
    if (favoriteButton) {
      event.stopPropagation();
      toggleFavorite(Number(favoriteButton.dataset.favoriteId));
      return;
    }
    const card = event.target.closest('[data-id]');
    if (card) openModal(Number(card.dataset.id));
  });

  elements.timeline.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-id]')) {
      event.preventDefault();
      openModal(Number(event.target.dataset.id));
    }
  });

  elements.modalClose.addEventListener('click', () => elements.modal.close());
  elements.modalFavorite.addEventListener('click', () => toggleFavorite(state.activeEventId));
  elements.modal.addEventListener('click', event => {
    if (event.target === elements.modal) elements.modal.close();
  });
  elements.modal.addEventListener('close', () => {
    state.activeEventId = null;
  });

  initTheme();
  createFilters();
  elements.searchInput.value = state.query;
  elements.favoritesOnly.checked = state.favoritesOnly;
  saveState();
  render();
})();
