'use strict';
(() => {
  const AppConfig = Object.freeze({
    schemaVersion: 4,
    storageKey: 'rusHistory',
    legacyKeys: Object.freeze({
      theme: 'rusHistoryTheme',
      favorites: 'rusHistoryFavorites'
    }),
    defaultTheme: 'light',
    validThemes: Object.freeze(['light', 'dark']),
    defaultPeriod: 'Все',
    defaultCentury: 'Все века',
    defaultSort: 'oldest',
    validSorts: Object.freeze(['oldest', 'newest', 'title'])
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
      interface: {
        query: '',
        period: AppConfig.defaultPeriod,
        century: AppConfig.defaultCentury,
        sort: AppConfig.defaultSort,
        favoritesOnly: false,
        unviewedOnly: false
      }
    });

    const normalizeTheme = value => AppConfig.validThemes.includes(value) ? value : null;
    const normalizeSort = value => AppConfig.validSorts.includes(value) ? value : AppConfig.defaultSort;

    const normalize = value => {
      const defaults = createDefaults();
      if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
      const ui = value.interface && typeof value.interface === 'object' ? value.interface : {};
      const collections = value.collections && typeof value.collections === 'object' ? value.collections : {};
      const preferences = value.preferences && typeof value.preferences === 'object' ? value.preferences : {};
      return {
        schemaVersion: AppConfig.schemaVersion,
        preferences: { theme: normalizeTheme(preferences.theme) },
        collections: {
          favorites: normalizeIds(collections.favorites),
          viewed: normalizeIds(collections.viewed),
          studied: normalizeIds(collections.studied)
        },
        interface: {
          query: typeof ui.query === 'string' ? ui.query : '',
          period: typeof ui.period === 'string' ? ui.period : AppConfig.defaultPeriod,
          century: typeof ui.century === 'string' ? ui.century : AppConfig.defaultCentury,
          sort: normalizeSort(ui.sort),
          favoritesOnly: Boolean(ui.favoritesOnly),
          unviewedOnly: Boolean(ui.unviewedOnly)
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
        // Приложение продолжает работу при недоступном localStorage.
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
    century: persisted.interface.century,
    sort: persisted.interface.sort,
    favoritesOnly: persisted.interface.favoritesOnly,
    unviewedOnly: persisted.interface.unviewedOnly,
    favorites: new Set(persisted.collections.favorites),
    viewed: new Set(persisted.collections.viewed),
    studied: new Set(persisted.collections.studied),
    theme: persisted.preferences.theme,
    activeEventId: null,
    mapFilterIds: null,
    mapFilterLabel: ''
  };

  const elements = {
    timeline: document.getElementById('timeline'),
    filters: document.getElementById('periodFilters'),
    searchInput: document.getElementById('searchInput'),
    centuryFilter: document.getElementById('centuryFilter'),
    sortSelect: document.getElementById('sortSelect'),
    favoritesOnly: document.getElementById('favoritesOnly'),
    unviewedOnly: document.getElementById('unviewedOnly'),
    resetFilters: document.getElementById('resetFilters'),
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

  const flattenText = value => {
    if (Array.isArray(value)) return value.map(flattenText).join(' ');
    if (value && typeof value === 'object') return Object.values(value).map(flattenText).join(' ');
    return value === null || value === undefined ? '' : String(value);
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
        century: state.century,
        sort: state.sort,
        favoritesOnly: state.favoritesOnly,
        unviewedOnly: state.unviewedOnly
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
    const preferred = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : AppConfig.defaultTheme;
    setTheme(state.theme || preferred, false);
  }

  function createPeriodFilters() {
    const periods = [AppConfig.defaultPeriod, ...new Set(HISTORY_EVENTS.map(event => event.period))];
    if (!periods.includes(state.period)) state.period = AppConfig.defaultPeriod;
    elements.filters.replaceChildren();
    const fragment = document.createDocumentFragment();
    periods.forEach(period => {
      const button = createElement('button', `filter-button${period === state.period ? ' active' : ''}`, period);
      button.type = 'button';
      button.dataset.period = period;
      button.setAttribute('aria-pressed', String(period === state.period));
      fragment.append(button);
    });
    elements.filters.append(fragment);
  }

  function createCenturyFilter() {
    const centuries = [AppConfig.defaultCentury, ...new Set(HISTORY_EVENTS.map(event => event.century))];
    if (!centuries.includes(state.century)) state.century = AppConfig.defaultCentury;
    elements.centuryFilter.replaceChildren();
    centuries.forEach(century => {
      const option = createElement('option', '', century);
      option.value = century;
      elements.centuryFilter.append(option);
    });
    elements.centuryFilter.value = state.century;
  }

  function eventSearchText(event) {
    return [
      event.year,
      event.sortYear,
      event.century,
      event.title,
      event.period,
      event.place,
      event.summary,
      event.description,
      event.course,
      event.causes,
      event.consequences,
      event.people,
      event.fact,
      event.sources
    ].map(flattenText).join(' ').toLocaleLowerCase('ru');
  }

  function visibleEvents() {
    const query = state.query.trim().toLocaleLowerCase('ru');
    const filtered = HISTORY_EVENTS.filter(event => {
      return (state.period === AppConfig.defaultPeriod || event.period === state.period)
        && (state.century === AppConfig.defaultCentury || event.century === state.century)
        && (!state.favoritesOnly || state.favorites.has(event.id))
        && (!state.unviewedOnly || !state.viewed.has(event.id))
        && (!state.mapFilterIds || state.mapFilterIds.has(event.id))
        && (!query || eventSearchText(event).includes(query));
    });

    return [...filtered].sort((a, b) => {
      if (state.sort === 'newest') return b.sortYear - a.sortYear || b.id - a.id;
      if (state.sort === 'title') return a.title.localeCompare(b.title, 'ru') || a.sortYear - b.sortYear;
      return a.sortYear - b.sortYear || a.id - b.id;
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
    const mapSuffix = state.mapFilterLabel ? ` · Карта: ${state.mapFilterLabel}` : '';
    elements.resultCount.textContent = `Найдено: ${events.length} · Просмотрено: ${state.viewed.size} · Изучено: ${state.studied.size}${mapSuffix}`;
    elements.emptyState.hidden = events.length !== 0;
  }

  function applyMapFilter(detail) {
    const ids = detail && Array.isArray(detail.eventIds)
      ? [...new Set(detail.eventIds.map(Number).filter(Number.isFinite))]
      : [];
    state.mapFilterIds = ids.length > 0 ? new Set(ids) : null;
    state.mapFilterLabel = detail && typeof detail.label === 'string' ? detail.label : '';
    render();
  }

  function clearMapFilter(notify = true) {
    if (!state.mapFilterIds && !state.mapFilterLabel) return;
    state.mapFilterIds = null;
    state.mapFilterLabel = '';
    render();
    if (notify) window.dispatchEvent(new CustomEvent('rus-history:map-filter-cleared'));
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

  function resetFilters() {
    state.query = '';
    state.period = AppConfig.defaultPeriod;
    state.century = AppConfig.defaultCentury;
    state.sort = AppConfig.defaultSort;
    state.favoritesOnly = false;
    state.unviewedOnly = false;
    elements.searchInput.value = '';
    elements.centuryFilter.value = state.century;
    elements.sortSelect.value = state.sort;
    elements.favoritesOnly.checked = false;
    elements.unviewedOnly.checked = false;
    createPeriodFilters();
    clearMapFilter();
    saveState();
    render();
  }

  elements.filters.addEventListener('click', event => {
    const button = event.target.closest('[data-period]');
    if (!button) return;
    state.period = button.dataset.period;
    createPeriodFilters();
    saveState();
    render();
  });

  elements.searchInput.addEventListener('input', () => {
    state.query = elements.searchInput.value;
    saveState();
    render();
  });

  elements.centuryFilter.addEventListener('change', () => {
    state.century = elements.centuryFilter.value;
    saveState();
    render();
  });

  elements.sortSelect.addEventListener('change', () => {
    state.sort = AppConfig.validSorts.includes(elements.sortSelect.value) ? elements.sortSelect.value : AppConfig.defaultSort;
    saveState();
    render();
  });

  elements.favoritesOnly.addEventListener('change', () => {
    state.favoritesOnly = elements.favoritesOnly.checked;
    saveState();
    render();
  });

  elements.unviewedOnly.addEventListener('change', () => {
    state.unviewedOnly = elements.unviewedOnly.checked;
    saveState();
    render();
  });

  elements.resetFilters.addEventListener('click', resetFilters);
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

  window.addEventListener('rus-history:set-map-filter', event => {
    applyMapFilter(event.detail);
  });
  window.addEventListener('rus-history:clear-map-filter', () => {
    clearMapFilter(false);
  });

  initTheme();
  createPeriodFilters();
  createCenturyFilter();
  elements.searchInput.value = state.query;
  elements.sortSelect.value = state.sort;
  elements.favoritesOnly.checked = state.favoritesOnly;
  elements.unviewedOnly.checked = state.unviewedOnly;
  saveState();
  render();
})();
