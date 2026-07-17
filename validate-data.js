'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const REQUIRED_FIELDS = Object.freeze([
  'id', 'year', 'sortYear', 'century', 'title', 'period', 'place',
  'summary', 'description', 'course', 'causes', 'consequences',
  'people', 'fact', 'sources', 'related', 'image'
]);

const CONTENT_WARNING_LIMIT = 6;
const GENERIC_DESCRIPTION_SUFFIX = 'Событие стало заметной частью исторического развития государства и общества.';
const GENERIC_COURSE_PREFIX = 'Основные действия разворачивались в месте';
const GENERIC_FACT_PREFIX = 'Для хронологической навигации событие отнесено к периоду';
const GENERIC_CAUSE_FRAGMENT = 'Политические, военные или социальные процессы';

function loadEvents() {
  const context = vm.createContext({ console });
  ['data.js', 'event-details.js', 'illustrations.js'].forEach(file => {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  });
  return vm.runInContext('HISTORY_EVENTS', context);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sameString(a, b) {
  return normalizeWhitespace(a) === normalizeWhitespace(b);
}

function isValidCoordinatePair(value) {
  return Boolean(value)
    && typeof value === 'object'
    && Number.isFinite(value.lat)
    && Number.isFinite(value.lon)
    && value.lat >= -90
    && value.lat <= 90
    && value.lon >= -180
    && value.lon <= 180;
}

function createWarningTracker() {
  return new Map();
}

function addWarning(tracker, code, label) {
  if (!tracker.has(code)) tracker.set(code, []);
  tracker.get(code).push(label);
}

function formatWarning(code, labels) {
  const samples = labels.slice(0, CONTENT_WARNING_LIMIT).join(', ');
  const suffix = labels.length > CONTENT_WARNING_LIMIT ? ` и ещё ${labels.length - CONTENT_WARNING_LIMIT}` : '';
  const descriptions = {
    genericDescription: 'описание содержит шаблонную добавку вместо содержательного расширения',
    genericCourse: 'поле course построено по однотипному шаблону',
    genericFact: 'поле fact содержит только техническую фразу о периоде',
    genericCauses: 'поле causes выглядит шаблонным и не раскрывает причины события',
    adjacentRelatedOnly: 'related содержит только соседние по порядку ID без содержательных связей',
    repeatedSources: 'источники совпадают с типовым набором периода без уточнения для события'
  };
  return `${descriptions[code]}: ${labels.length} событий (${samples}${suffix})`;
}

function validate() {
  const errors = [];
  const warningTracker = createWarningTracker();
  let events;

  try {
    events = loadEvents();
  } catch (error) {
    console.error(`Ошибка загрузки данных: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (!Array.isArray(events)) {
    errors.push('HISTORY_EVENTS должен быть массивом.');
  } else if (events.length < 100) {
    errors.push(`В базе только ${events.length} событий; требуется не менее 100.`);
  }

  const ids = new Set();
  const years = [];
  const sourcesByPeriod = new Map();

  (events || []).forEach((event, index) => {
    const label = `Событие #${index + 1}${event && event.id !== undefined ? ` (id ${event.id})` : ''}`;

    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      errors.push(`${label}: запись должна быть объектом.`);
      return;
    }

    REQUIRED_FIELDS.forEach(field => {
      if (!(field in event)) errors.push(`${label}: отсутствует поле ${field}.`);
    });

    if (!Number.isInteger(event.id) || event.id <= 0) {
      errors.push(`${label}: id должен быть положительным целым числом.`);
    } else if (ids.has(event.id)) {
      errors.push(`${label}: повторяющийся id ${event.id}.`);
    } else {
      ids.add(event.id);
    }

    if (!Number.isFinite(event.sortYear)) {
      errors.push(`${label}: sortYear должен быть числом.`);
    } else {
      years.push({ id: event.id, sortYear: event.sortYear });
    }

    ['year', 'century', 'title', 'period', 'place', 'summary', 'description', 'course', 'fact', 'image'].forEach(field => {
      if (!isNonEmptyString(event[field])) errors.push(`${label}: поле ${field} должно быть непустой строкой.`);
    });

    ['causes', 'consequences', 'people', 'sources', 'related'].forEach(field => {
      if (!Array.isArray(event[field])) errors.push(`${label}: поле ${field} должно быть массивом.`);
    });

    ['causes', 'consequences', 'people', 'sources'].forEach(field => {
      if (Array.isArray(event[field]) && event[field].some(item => !isNonEmptyString(item))) {
        errors.push(`${label}: поле ${field} содержит пустое или нестроковое значение.`);
      }
    });

    if (!isValidCoordinatePair(event.coordinates)) {
      errors.push(`${label}: coordinates должны содержать корректные lat/lon в допустимых диапазонах.`);
    }

    if (Array.isArray(event.related)) {
      const uniqueRelated = new Set(event.related);
      if (uniqueRelated.size !== event.related.length) errors.push(`${label}: в related есть повторы.`);
      if (event.related.includes(event.id)) errors.push(`${label}: событие ссылается само на себя.`);

      if (event.related.length > 0 && event.related.every(relatedId => relatedId === event.id - 1 || relatedId === event.id + 1)) {
        addWarning(warningTracker, 'adjacentRelatedOnly', `${event.id} «${event.title}»`);
      }
    }

    if (isNonEmptyString(event.image)) {
      const imagePath = path.resolve(ROOT, event.image);
      if (!imagePath.startsWith(`${ROOT}${path.sep}`)) {
        errors.push(`${label}: путь изображения выходит за пределы проекта.`);
      } else if (!fs.existsSync(imagePath)) {
        errors.push(`${label}: изображение не найдено — ${event.image}.`);
      }
    }

    if (sameString(event.description, `${event.summary} ${GENERIC_DESCRIPTION_SUFFIX}`)) {
      addWarning(warningTracker, 'genericDescription', `${event.id} «${event.title}»`);
    }

    if (normalizeWhitespace(event.course).startsWith(GENERIC_COURSE_PREFIX)) {
      addWarning(warningTracker, 'genericCourse', `${event.id} «${event.title}»`);
    }

    if (normalizeWhitespace(event.fact).startsWith(GENERIC_FACT_PREFIX)) {
      addWarning(warningTracker, 'genericFact', `${event.id} «${event.title}»`);
    }

    if (Array.isArray(event.causes)
      && event.causes.length > 0
      && event.causes.every(item => normalizeWhitespace(item).includes(GENERIC_CAUSE_FRAGMENT))) {
      addWarning(warningTracker, 'genericCauses', `${event.id} «${event.title}»`);
    }

    if (Array.isArray(event.sources) && isNonEmptyString(event.period)) {
      const normalizedSources = JSON.stringify(event.sources.map(normalizeWhitespace));
      if (!sourcesByPeriod.has(event.period)) {
        sourcesByPeriod.set(event.period, new Map());
      }
      const periodSources = sourcesByPeriod.get(event.period);
      if (!periodSources.has(normalizedSources)) periodSources.set(normalizedSources, []);
      periodSources.get(normalizedSources).push(`${event.id} «${event.title}»`);
    }
  });

  (events || []).forEach(event => {
    if (!event || !Array.isArray(event.related)) return;
    event.related.forEach(relatedId => {
      if (!Number.isInteger(relatedId) || !ids.has(relatedId)) {
        errors.push(`Событие id ${event.id}: ссылка related ведёт на неизвестный id ${relatedId}.`);
      }
    });
  });

  for (let index = 1; index < years.length; index += 1) {
    if (years[index].sortYear < years[index - 1].sortYear) {
      errors.push(`Нарушена хронология: id ${years[index].id} расположен раньше id ${years[index - 1].id}.`);
    }
  }

  sourcesByPeriod.forEach(periodSources => {
    periodSources.forEach(labels => {
      if (labels.length > 1) {
        labels.forEach(label => addWarning(warningTracker, 'repeatedSources', label));
      }
    });
  });

  const warnings = [...warningTracker.entries()].map(([code, labels]) => formatWarning(code, labels));

  console.log(`Проверено событий: ${(events || []).length}`);
  console.log(`Ошибок: ${errors.length}; предупреждений: ${warnings.length}`);
  warnings.forEach(message => console.warn(`ПРЕДУПРЕЖДЕНИЕ: ${message}`));
  errors.forEach(message => console.error(`ОШИБКА: ${message}`));

  if (errors.length > 0) {
    process.exitCode = 1;
  } else if (warnings.length === 0) {
    console.log('Структура и базовое качество исторических данных корректны.');
  } else {
    console.log('Структурные ошибки не найдены, но есть предупреждения по качеству данных.');
  }
}

validate();
