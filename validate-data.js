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

function validate() {
  const errors = [];
  const warnings = [];
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

    ['year', 'century', 'title', 'period', 'summary', 'description', 'course', 'fact', 'image'].forEach(field => {
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

    if (Array.isArray(event.related)) {
      const uniqueRelated = new Set(event.related);
      if (uniqueRelated.size !== event.related.length) warnings.push(`${label}: в related есть повторы.`);
      if (event.related.includes(event.id)) errors.push(`${label}: событие ссылается само на себя.`);
    }

    if (isNonEmptyString(event.image)) {
      const imagePath = path.resolve(ROOT, event.image);
      if (!imagePath.startsWith(`${ROOT}${path.sep}`)) {
        errors.push(`${label}: путь изображения выходит за пределы проекта.`);
      } else if (!fs.existsSync(imagePath)) {
        errors.push(`${label}: изображение не найдено — ${event.image}.`);
      }
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

  console.log(`Проверено событий: ${(events || []).length}`);
  console.log(`Ошибок: ${errors.length}; предупреждений: ${warnings.length}`);
  warnings.forEach(message => console.warn(`ПРЕДУПРЕЖДЕНИЕ: ${message}`));
  errors.forEach(message => console.error(`ОШИБКА: ${message}`));

  if (errors.length > 0) {
    process.exitCode = 1;
  } else {
    console.log('Структура исторических данных корректна.');
  }
}

validate();
