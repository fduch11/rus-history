#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = __dirname;
const errors = [];
const warnings = [];

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function readText(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    addError(`Отсутствует файл: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function listRootFiles(extension) {
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(extension))
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right, 'ru'));
}

function checkJavaScriptSyntax() {
  const files = listRootFiles('.js');
  files.forEach(file => {
    try {
      new vm.Script(readText(file), { filename: file });
    } catch (error) {
      addError(`Ошибка синтаксиса JavaScript в ${file}: ${error.message}`);
    }
  });
  return files.length;
}

function normalizeLocalPath(reference, sourceFile) {
  const withoutFragment = reference.split('#')[0].split('?')[0].trim();
  if (!withoutFragment || withoutFragment === '.') return null;
  if (/^(?:https?:|data:|mailto:|tel:|javascript:|\/\/)/i.test(withoutFragment)) {
    addError(`Внешняя или недопустимая ссылка в ${sourceFile}: ${reference}`);
    return null;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    addError(`Некорректно закодированный путь в ${sourceFile}: ${reference}`);
    return null;
  }

  const sourceDirectory = path.dirname(sourceFile);
  const normalized = path.normalize(path.join(sourceDirectory, decoded.replace(/^\.\//, '')));
  const resolved = path.resolve(ROOT, normalized);
  const rootPrefix = `${path.resolve(ROOT)}${path.sep}`;

  if (resolved !== path.resolve(ROOT) && !resolved.startsWith(rootPrefix)) {
    addError(`Путь выходит за пределы проекта в ${sourceFile}: ${reference}`);
    return null;
  }

  return path.relative(ROOT, resolved) || '.';
}

function checkReference(reference, sourceFile, checkedPaths) {
  const normalized = normalizeLocalPath(reference, sourceFile);
  if (!normalized || checkedPaths.has(normalized)) return;
  checkedPaths.add(normalized);
  if (!fs.existsSync(path.join(ROOT, normalized))) {
    addError(`Локальный путь из ${sourceFile} не существует: ${reference}`);
  }
}

function checkLocalPaths() {
  const checkedPaths = new Set();
  const indexHtml = readText('index.html');

  for (const match of indexHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    checkReference(match[1], 'index.html', checkedPaths);
  }

  listRootFiles('.css').forEach(file => {
    const css = readText(file);
    for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      checkReference(match[1], file, checkedPaths);
    }
  });

  const manifestText = readText('manifest.webmanifest');
  if (manifestText) {
    try {
      const manifest = JSON.parse(manifestText);
      if (typeof manifest.start_url === 'string') checkReference(manifest.start_url, 'manifest.webmanifest', checkedPaths);
      if (Array.isArray(manifest.icons)) {
        manifest.icons.forEach(icon => {
          if (icon && typeof icon.src === 'string') checkReference(icon.src, 'manifest.webmanifest', checkedPaths);
        });
      }
    } catch (error) {
      addError(`Ошибка JSON в manifest.webmanifest: ${error.message}`);
    }
  }

  const serviceWorker = readText('service-worker.js');
  for (const match of serviceWorker.matchAll(/["'](\.\/[^"']*)["']/g)) {
    checkReference(match[1], 'service-worker.js', checkedPaths);
  }

  ['package.json', 'package-lock.json', 'node_modules'].forEach(forbiddenPath => {
    if (fs.existsSync(path.join(ROOT, forbiddenPath))) {
      addError(`Обнаружена запрещённая npm-зависимость: ${forbiddenPath}`);
    }
  });

  const appFiles = new Set(['index.html', 'manifest.webmanifest', 'service-worker.js']);
  for (const match of indexHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    const normalized = normalizeLocalPath(match[1], 'index.html');
    if (normalized && /\.(?:js|css)$/i.test(normalized)) appFiles.add(normalized);
  }

  appFiles.forEach(file => {
    if (!fs.existsSync(path.join(ROOT, file))) return;
    const text = readText(file);
    if (/https?:\/\//i.test(text)) addError(`Внешний URL обнаружен в ${file}`);
    if (/\bfetch\s*\(/.test(text)) addError(`Вызов fetch обнаружен в ${file}`);
  });

  return checkedPaths.size;
}

function loadHistoryEvents() {
  const sandbox = {
    console,
    document: { addEventListener() {} },
    HTMLImageElement: class HTMLImageElement {}
  };
  const context = vm.createContext(sandbox);

  ['data.js', 'event-details.js', 'illustrations.js'].forEach(file => {
    const source = readText(file);
    if (!source) return;
    try {
      vm.runInContext(source, context, { filename: file });
    } catch (error) {
      addError(`Не удалось выполнить ${file}: ${error.message}`);
    }
  });

  try {
    vm.runInContext('globalThis.__validatedHistoryEvents = HISTORY_EVENTS;', context);
  } catch (error) {
    addError(`Не удалось получить HISTORY_EVENTS: ${error.message}`);
    return [];
  }

  return context.__validatedHistoryEvents;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateStringArray(event, field) {
  const value = event[field];
  if (!Array.isArray(value) || value.length === 0) {
    addError(`Событие ${event.id}: поле ${field} должно быть непустым массивом`);
    return;
  }
  value.forEach((item, index) => {
    if (!isNonEmptyString(item)) addError(`Событие ${event.id}: ${field}[${index}] должно быть непустой строкой`);
  });
}

function validateEvents(events) {
  if (!Array.isArray(events)) {
    addError('HISTORY_EVENTS не является массивом');
    return { eventCount: 0, imageCount: 0 };
  }
  if (events.length < 100) addError(`Недостаточно событий: ${events.length}, требуется не менее 100`);

  const ids = new Set();
  const titles = new Set();
  const imagePaths = new Set();
  const requiredStrings = ['year', 'century', 'title', 'period', 'place', 'summary', 'description', 'course', 'fact', 'image'];
  const requiredArrays = ['causes', 'consequences', 'people', 'sources'];
  let previousSortYear = -Infinity;

  events.forEach((event, index) => {
    const label = event && Number.isInteger(event.id) ? event.id : `позиция ${index + 1}`;
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      addError(`Событие ${label}: запись должна быть объектом`);
      return;
    }

    if (!Number.isInteger(event.id) || event.id <= 0) {
      addError(`Событие ${label}: id должен быть положительным целым числом`);
    } else if (ids.has(event.id)) {
      addError(`Повторяющийся id: ${event.id}`);
    } else {
      ids.add(event.id);
      if (event.id !== index + 1) addWarning(`Событие ${event.id}: ожидаемый последовательный id ${index + 1}`);
    }

    requiredStrings.forEach(field => {
      if (!isNonEmptyString(event[field])) addError(`Событие ${label}: поле ${field} должно быть непустой строкой`);
    });
    requiredArrays.forEach(field => validateStringArray(event, field));

    if (isNonEmptyString(event.title)) {
      if (titles.has(event.title)) addWarning(`Повторяющееся название: ${event.title}`);
      titles.add(event.title);
    }

    if (!Number.isInteger(event.sortYear) || event.sortYear < 800 || event.sortYear > 2100) {
      addError(`Событие ${label}: некорректный sortYear ${event.sortYear}`);
    } else {
      const yearMatch = isNonEmptyString(event.year) ? event.year.match(/^(\d{3,4})/) : null;
      if (!yearMatch || Number(yearMatch[1]) !== event.sortYear) {
        addError(`Событие ${label}: year «${event.year}» не соответствует sortYear ${event.sortYear}`);
      }
      if (event.sortYear < previousSortYear) {
        addError(`Событие ${label}: нарушена хронология после ${previousSortYear}`);
      }
      previousSortYear = event.sortYear;
    }

    if (!event.coordinates || typeof event.coordinates !== 'object') {
      addError(`Событие ${label}: отсутствуют coordinates`);
    } else {
      const { lat, lon } = event.coordinates;
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) addError(`Событие ${label}: некорректная широта ${lat}`);
      if (!Number.isFinite(lon) || lon < -180 || lon > 180) addError(`Событие ${label}: некорректная долгота ${lon}`);
    }

    if (!Array.isArray(event.related)) {
      addError(`Событие ${label}: related должно быть массивом`);
    } else {
      const relatedIds = new Set();
      event.related.forEach(relatedId => {
        if (!Number.isInteger(relatedId) || relatedId <= 0) addError(`Событие ${label}: некорректная связь ${relatedId}`);
        if (relatedId === event.id) addError(`Событие ${label}: связь с самим собой`);
        if (relatedIds.has(relatedId)) addError(`Событие ${label}: повторяющаяся связь ${relatedId}`);
        relatedIds.add(relatedId);
      });
    }

    if (isNonEmptyString(event.image)) {
      if (/^(?:https?:|data:|\/\/)/i.test(event.image) || event.image.includes('..')) {
        addError(`Событие ${label}: изображение должно быть локальным: ${event.image}`);
      } else if (!/^images\/[A-Za-z0-9._/-]+\.(?:svg|png|webp|jpe?g)$/i.test(event.image)) {
        addError(`Событие ${label}: некорректный путь изображения ${event.image}`);
      } else {
        imagePaths.add(event.image);
        if (!fs.existsSync(path.join(ROOT, event.image))) addError(`Событие ${label}: файл изображения отсутствует: ${event.image}`);
      }
    }
  });

  events.forEach(event => {
    if (!event || !Array.isArray(event.related)) return;
    event.related.forEach(relatedId => {
      if (!ids.has(relatedId)) addError(`Событие ${event.id}: связь указывает на отсутствующий id ${relatedId}`);
    });
  });

  if (!fs.existsSync(path.join(ROOT, 'images/fallback.svg'))) addError('Отсутствует обязательное fallback-изображение images/fallback.svg');
  if (imagePaths.size < 15) addError(`Используется только ${imagePaths.size} уникальных изображений, требуется не менее 15`);

  return { eventCount: events.length, imageCount: imagePaths.size };
}

const jsCount = checkJavaScriptSyntax();
const localPathCount = checkLocalPaths();
const events = loadHistoryEvents();
const { eventCount, imageCount } = validateEvents(events);

console.log(`Событий проверено: ${eventCount}`);
console.log(`Уникальных изображений проверено: ${imageCount}`);
console.log(`JavaScript-файлов проверено: ${jsCount}`);
console.log(`Локальных путей проверено: ${localPathCount}`);

if (warnings.length) {
  console.warn('\nПредупреждения:');
  warnings.forEach(message => console.warn(`- ${message}`));
}

if (errors.length) {
  console.error('\nОшибки:');
  errors.forEach(message => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log('\nПроверка завершена без ошибок.');
}
