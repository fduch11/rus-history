'use strict';
(() => {
  const AppConfig = Object.freeze({
    schemaVersion: 3,
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
    const normalizeIds = value => {
      if (!Array.isArray(value)) return [];
      return [...new Set(value.map(Number).filter(Number.isFinite))];
    };

    const createDefaults = () => ({
      schemaVersion: AppConfig.schemaVersion,
      preferences: { theme: null },
      collections: { favorites: [], viewed: [], studied: [] },
      interface: { query: '', period: AppConfig.defaultPeriod, favoritesOnly: false }
    });

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
          favorites: normalizeIds(value.collections && value.collections.favorites),
          viewed: normalizeIds(value.collections && value.collections.viewed),
          studied: normalizeIds(value.collections && value.collections.studied)
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
      try {
        migrated.preferences.theme = normalizeTheme(localStorage.getItem(AppConfig.legacyKeys.theme));
      } catch {
        migrated.preferences.theme = null;
      }
      migrated.collections.favorites = normalizeIds(readJson(AppConfig.legacyKeys.favorites));
      return migrated;
    };

    const load = () => {
      const stored = readJson(AppConfig.storageKey);
      const data = stored && typeof stored === 'object' ? normalize(stored) : migrateLegacy();
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
    viewed: new Set(persisted.collections.viewed),
    studied: new Set(persisted.collections.studied),
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

  const createElement = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  function saveState() {
    Storage.save({
      schemaVersion: AppConfig.schemaVersion,
      preferences: { theme: state.theme },
      collections: {
        favorites: [...state.favorites],
        viewed: [...state.viewed],
        studied: [...state.studied]
      },
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
    elements.filters.replaceChildren();
    const fragment = document.createDocumentFragment();
    periods.forEach(period => {
      const button = createElement('button', `filter-button${period === state.period ? ' active' : ''}`, period);
      button.type = 'button';
      button.dataset.period = period;
      fragment.append(button);
    });
    elements.filters.append(fragment);
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

  function createStatusBadge(label, className) {
    return createElement('span', `event-status ${className}`, label);
  }

  function createEventCard(event) {
    const favorite = state.favorites.has(event.id);
    const viewed = state.viewed.has(event.id);
    const studied = state.studied.has(event.id);
    const card = createElement('article', `event-card${viewed ? ' is-viewed' : ''}${studied ? ' is-studied' : ''}`);
    card.dataset.id = String(event.id);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${event.year}. ${event.title}`);

    const image = createElement('img', 'event-image');
    image.src = event.image;
    image.alt = `Иллюстрация к событию «${event.title}»`;
    image.loading = 'lazy';
    image.decoding = 'async';

    const body = createElement('div', 'event-body');
    const top = createElement('div', 'event-top');
    const heading = createElement('div', 'event-heading');
    heading.append(createElement('p', 'event-year', event.year), createElement('h2', 'event-title', event.title));

    const favoriteButton = createElement('button', `favorite-button${favorite ? ' active' : ''}`, favorite ? '★' : '☆');
    favoriteButton.type = 'button';
    favoriteButton.dataset.favoriteId = String(event.id);
    favoriteButton.setAttribute('aria-label', favorite ? 'Удалить из избранного' : 'Добавить в избранное');
    top.append(heading, favoriteButton);

    const summary = createElement('p', 'event-summary', event.summary);
    const meta = createElement('div', 'event-meta');
    meta.append(createElement('span', 'period-badge', event.period));
    if (event.place) meta.append(createElement('span', 'place-badge', event.place));

    const footer = createElement('div', 'event-footer');
    const statuses = createElement('div', 'event-statuses');
    if (viewed) statuses.append(createStatusBadge('Просмотрено', 'viewed'));
    if (studied) statuses.append(createStatusBadge('Изучено', 'studied'));

    const studiedButton = createElement('button', `study-button${studied ? ' active' : ''}`, studied ? '✓ Изучено' : 'Отметить изученным');
    studiedButton.type = 'button';
    studiedButton.dataset.studyId = String(event.id);
    studiedButton.setAttribute('aria-pressed', String(studied));
    footer.append(statuses, studiedButton);

    body.append(top, summary, meta, footer);
    card.append(image, body);
    return card;
  }

  function render() {
    const events = visibleEvents();
    const groups = new Map();
    events.forEach(event => {
      if (!groups.has(event.century)) groups.set(event.century, []);
      groups.get(event.century).push(event);
    });

    const fragment = document.createDocumentFragment();
    groups.forEach((groupEvents, century) => {
      const section = createElement('section', 'century-group');
      section.dataset.century = century;
      const header = createElement('header', 'century-header');
      header.append(createElement('h2', 'century-title', century), createElement('span', 'century-count', `${groupEvents.length} событий`));
      const list = createElement('div', 'century-events');
      groupEvents.forEach(event => list.append(createEventCard(event)));
      section.append(header, list);
      fragment.append(section);
    });

    elements.timeline.replaceChildren(fragment);
    elements.resultCount.textContent = `Событий: ${events.length} · Просмотрено: ${state.viewed.size} · Изучено: ${state.studied.size}`;
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

  function toggleStudied(id) {
    if (state.studied.has(id)) {
      state.studied.delete(id);
    } else {
      state.studied.add(id);
      state.viewed.add(id);
    }
    saveState();
    render();
  }

  function openModal(id) {
    const event = HISTORY_EVENTS.find(item => item.id === id);
    if (!event) return;
    state.activeEventId = id;
    state.viewed.add(id);
    saveState();
    render();
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
    const studiedButton = event.target.closest('[data-study-id]');
    if (studiedButton) {
      event.stopPropagation();
      toggleStudied(Number(studiedButton.dataset.studyId));
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