'use strict';

(() => {
  const STORAGE_KEYS = Object.freeze({
    app: 'rusHistory',
    quiz: 'rusHistoryQuiz',
    reading: 'rusHistoryReading'
  });
  const BACKUP_FORMAT = 'rus-history-backup';
  const BACKUP_VERSION = 2;
  const panel = document.getElementById('progressPanel');
  const overallText = document.getElementById('overallProgressText');
  const overallBar = document.getElementById('overallProgressBar');
  const viewedText = document.getElementById('viewedProgressText');
  const periodList = document.getElementById('periodProgressList');
  const exportButton = document.getElementById('exportProgress');
  const importButton = document.getElementById('importProgress');
  const importInput = document.getElementById('importProgressFile');
  const resetButton = document.getElementById('resetProgress');
  const status = document.getElementById('progressStatus');
  const timeline = document.getElementById('timeline');

  if (!panel || !overallText || !overallBar || !periodList || !timeline) return;

  const uniqueIds = value => {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(Number).filter(Number.isFinite))];
  };

  function readJson(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function removeKey(key) {
    localStorage.removeItem(key);
  }

  function readAppData() {
    return readJson(STORAGE_KEYS.app);
  }

  function collectionsFrom(data) {
    const source = data.collections && typeof data.collections === 'object' ? data.collections : {};
    return {
      viewed: new Set(uniqueIds(source.viewed)),
      studied: new Set(uniqueIds(source.studied)),
      favorites: uniqueIds(source.favorites)
    };
  }

  function percentage(value, total) {
    return total ? Math.round((value / total) * 100) : 0;
  }

  function createPeriodRow(period, studied, total) {
    const row = document.createElement('div');
    row.className = 'period-progress-row';

    const heading = document.createElement('div');
    heading.className = 'period-progress-heading';
    const name = document.createElement('span');
    name.textContent = period;
    const count = document.createElement('span');
    count.textContent = `${studied} из ${total}`;
    heading.append(name, count);

    const track = document.createElement('div');
    track.className = 'progress-track';
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', `Изучено событий периода «${period}»`);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(total));
    track.setAttribute('aria-valuenow', String(studied));
    const fill = document.createElement('span');
    fill.className = 'progress-fill';
    fill.style.width = `${percentage(studied, total)}%`;
    track.append(fill);

    row.append(heading, track);
    return row;
  }

  function renderProgress() {
    const collections = collectionsFrom(readAppData());
    const total = HISTORY_EVENTS.length;
    const studiedCount = HISTORY_EVENTS.filter(event => collections.studied.has(event.id)).length;
    const viewedCount = HISTORY_EVENTS.filter(event => collections.viewed.has(event.id)).length;

    overallText.textContent = `Изучено ${studiedCount} из ${total} событий (${percentage(studiedCount, total)}%)`;
    viewedText.textContent = `Просмотрено ${viewedCount} из ${total} событий`;
    overallBar.setAttribute('aria-valuemax', String(total));
    overallBar.setAttribute('aria-valuenow', String(studiedCount));
    const overallFill = overallBar.querySelector('.progress-fill');
    if (overallFill) overallFill.style.width = `${percentage(studiedCount, total)}%`;

    const periods = new Map();
    HISTORY_EVENTS.forEach(event => {
      if (!periods.has(event.period)) periods.set(event.period, { total: 0, studied: 0 });
      const item = periods.get(event.period);
      item.total += 1;
      if (collections.studied.has(event.id)) item.studied += 1;
    });

    const fragment = document.createDocumentFragment();
    periods.forEach((value, period) => fragment.append(createPeriodRow(period, value.studied, value.total)));
    periodList.replaceChildren(fragment);
  }

  function downloadJson(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = `rus-history-progress-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  function normalizeAppData(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-root');
    const collections = value.collections;
    if (!collections || typeof collections !== 'object' || Array.isArray(collections)) throw new Error('invalid-collections');

    return {
      ...value,
      collections: {
        ...collections,
        favorites: uniqueIds(collections.favorites),
        viewed: uniqueIds(collections.viewed),
        studied: uniqueIds(collections.studied)
      }
    };
  }

  function normalizeObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value;
  }

  function createBackupPayload() {
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        rusHistory: readAppData(),
        rusHistoryQuiz: readJson(STORAGE_KEYS.quiz),
        rusHistoryReading: readJson(STORAGE_KEYS.reading)
      }
    };
  }

  function normalizeImportedPayload(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-payload');

    if (value.format === BACKUP_FORMAT) {
      const data = value.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid-backup-data');
      return {
        app: normalizeAppData(data.rusHistory),
        quiz: normalizeObject(data.rusHistoryQuiz),
        reading: normalizeObject(data.rusHistoryReading)
      };
    }

    return {
      app: normalizeAppData(value),
      quiz: {},
      reading: {}
    };
  }

  function writeImportedPayload(payload) {
    writeJson(STORAGE_KEYS.app, payload.app);

    if (Object.keys(payload.quiz).length > 0) writeJson(STORAGE_KEYS.quiz, payload.quiz);
    else removeKey(STORAGE_KEYS.quiz);

    if (Object.keys(payload.reading).length > 0) writeJson(STORAGE_KEYS.reading, payload.reading);
    else removeKey(STORAGE_KEYS.reading);
  }

  exportButton.addEventListener('click', () => {
    downloadJson(createBackupPayload());
    status.textContent = 'Экспортированы прогресс, статистика тестов и настройки чтения.';
  });

  importButton.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      try {
        const imported = normalizeImportedPayload(JSON.parse(String(reader.result || '')));
        writeImportedPayload(imported);
        status.textContent = 'Данные импортированы. Приложение перезагружается.';
        window.location.reload();
      } catch {
        status.textContent = 'Файл не содержит корректных данных приложения.';
        importInput.value = '';
      }
    });
    reader.addEventListener('error', () => {
      status.textContent = 'Не удалось прочитать выбранный файл.';
      importInput.value = '';
    });
    reader.readAsText(file);
  });

  resetButton.addEventListener('click', () => {
    const confirmed = window.confirm('Удалить прогресс, избранное, статистику тестов и настройки чтения?');
    if (!confirmed) return;
    removeKey(STORAGE_KEYS.app);
    removeKey(STORAGE_KEYS.quiz);
    removeKey(STORAGE_KEYS.reading);
    status.textContent = 'Локальные данные удалены. Приложение перезагружается.';
    window.location.reload();
  });

  const observer = new MutationObserver(renderProgress);
  observer.observe(timeline, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('storage', event => {
    if (Object.values(STORAGE_KEYS).includes(event.key)) renderProgress();
  });

  renderProgress();
})();
