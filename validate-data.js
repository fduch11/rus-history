#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = __dirname;
const errors = [];
const warnings = [];

function error(message) {
  errors.push(message);
}

function warning(message) {
  warnings.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    error(`Отсутствует файл: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function rootFiles(extension) {
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(extension))
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right, 'ru'));
}

function checkJavaScriptSyntax() {
  const files = rootFiles('.js');
  files.forEach(file => {
    try {
      new vm.Script(read(file), { filename: file });
    } catch (exception) {
      error(`Ошибка синтаксиса JavaScript в ${file}: ${exception.message}`);
    }
  });
  return files.length;
}

function normalizeLocalPath(reference, sourceFile) {
  const cleanReference = reference.split('#')[0].split('?')[0].trim();
  if (!cleanReference || cleanReference === '.') return null;
  if (/^(?:https?:|data:|mailto:|tel:|javascript:|\/\/)/i.test(cleanReference)) {
    error(`Внешняя или недопустимая ссылка в ${sourceFile}: ${reference}`);
    return null;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(cleanReference);
  } catch {
    error(`Некорректно закодированный путь в ${sourceFile}: ${reference}`);
    return null;
  }

  const resolved = path.resolve(ROOT, path.dirname(sourceFile), decoded.replace(/^\.\//, ''));
  const resolvedRoot = path.resolve(ROOT);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    error(`Путь выходит за пределы проекта в ${sourceFile}: ${reference}`);
    return null;
  }
  return path.relative(ROOT, resolved) || '.';
}

function checkReference(reference, sourceFile, checkedPaths) {
  const normalized = normalizeLocalPath(reference, sourceFile);
  if (!normalized || checkedPaths.has(normalized)) return;
  checkedPaths.add(normalized);
  if (!fs.existsSync(path.join(ROOT, normalized))) {
    error(`Локальный путь из ${sourceFile} не существует: ${reference}`);
  }
}

function checkLocalPathsAndDependencies() {
  const checkedPaths = new Set();
  const indexHtml = read('index.html');

  for (const match of indexHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    checkReference(match[1], 'index.html', checkedPaths);
  }

  rootFiles('.css').forEach(file => {
    for (const match of read(file).matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      checkReference(match[1], file, checkedPaths);
    }
  });

  const manifestText = read('manifest.webmanifest');
  if (manifestText) {
    try {
      const manifest = JSON.parse(manifestText);
      if (typeof manifest.start_url === 'string') checkReference(manifest.start_url, 'manifest.webmanifest', checkedPaths);
      if (Array.isArray(manifest.icons)) {
        manifest.icons.forEach(icon => {
          if (icon && typeof icon.src === 'string') checkReference(icon.src, 'manifest.webmanifest', checkedPaths);
        });
      }
    } catch (exception) {
      error(`Ошибка JSON в manifest.webmanifest: ${exception.message}`);
    }
  }

  const serviceWorker = read('service-worker.js');
  for (const match of serviceWorker.matchAll(/["'](\.\/[^"']*)["']/g)) {
    checkReference(match[1], 'service-worker.js', checkedPaths);
  }

  ['package.json', 'package-lock.json', 'node_modules'].forEach(forbiddenPath => {
    if (fs.existsSync(path.join(ROOT, forbiddenPath))) error(`Обнаружена запрещённая npm-зависимость: ${forbiddenPath}`);
  });

  const applicationFiles = new Set(['index.html', 'manifest.webmanifest', 'service-worker.js']);
  for (const match of indexHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    const normalized = normalizeLocalPath(match[1], 'index.html');
    if (normalized && /\.(?:js|css)$/i.test(normalized)) applicationFiles.add(normalized);
  }

  applicationFiles.forEach(file => {
    if (!fs.existsSync(path.join(ROOT, file))) return;
    const content = read(file);
    if (/https?:\/\//i.test(content)) error(`Внешний URL обнаружен в ${file}`);
    if (/\bfetch\s*\(/.test(content)) error(`Вызов fetch обнаружен в ${file}`);
  });

  return checkedPaths.size;
}

function loadHistoryEvents() {
  const context = vm.createContext({
    console,
    document: { addEventListener() {} },
    HTMLImageElement: class HTMLImageElement {}
  });

  ['data.js', 'event-details.js', 'illustrations.js'].forEach(file => {
    try {
      vm.runInContext(read(file), context, { filename: file });
    } catch (exception) {
      error(`Не удалось выполнить ${file}: ${exception.message}`);
    }
  });

  try {
    return vm.runInContext('HISTORY_EVENTS', context);
  } catch (exception) {
    error(`Не удалось получить HISTORY_EVENTS: ${exception.message}`);
    return [];
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateEvents(events) {
  if (!Array.isArray(events)) {
    error('HISTORY_EVENTS не является массивом');
    return { eventCount: 0, usedImageCount: 0 };
  }
  if (events.length < 100) error(`Недостаточно событий: ${events.length}, требуется не менее 100`);

  const ids = new Set();
  const usedImages = new Set();
  const requiredStrings = ['year', 'century', 'title', 'period', 'place', 'summary', 'description', 'course', 'fact', 'image'];
  const requiredArrays = ['causes', 'consequences', 'people', 'sources', 'related'];
  let previousSortYear = -Infinity;

  events.forEach((event, index) => {
    const label = event && Number.isInteger(event.id) ? event.id : `позиция ${index + 1}`;
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      error(`Событие ${label}: запись должна быть объектом`);
      return;
    }

    if (!Number.isInteger(event.id) || event.id <= 0) {
      error(`Событие ${label}: id должен быть положительным целым числом`);
    } else if (ids.has(event.id)) {
      error(`Повторяющийся id: ${event.id}`);
    } else {
      ids.add(event.id);
      if (event.id !== index + 1) warning(`Событие ${event.id}: ожидаемый последовательный id ${index + 1}`);
    }

    requiredStrings.forEach(field => {
      if (!nonEmptyString(event[field])) error(`Событие ${label}: поле ${field} должно быть непустой строкой`);
    });

    requiredArrays.forEach(field => {
      if (!Array.isArray(event[field])) {
        error(`Событие ${label}: поле ${field} должно быть массивом`);
        return;
      }
      if (field !== 'related') {
        event[field].forEach((item, itemIndex) => {
          if (!nonEmptyString(item)) error(`Событие ${label}: ${field}[${itemIndex}] должно быть непустой строкой`);
        });
      }
    });

    if (!Number.isInteger(event.sortYear) || event.sortYear < 800 || event.sortYear > 2100) {
      error(`Событие ${label}: некорректный sortYear ${event.sortYear}`);
    } else {
      const yearMatch = nonEmptyString(event.year) ? event.year.match(/^(\d{3,4})/) : null;
      if (!yearMatch || Number(yearMatch[1]) !== event.sortYear) {
        error(`Событие ${label}: year «${event.year}» не соответствует sortYear ${event.sortYear}`);
      }
      if (event.sortYear < previousSortYear) error(`Событие ${label}: нарушена хронология после ${previousSortYear}`);
      previousSortYear = event.sortYear;
    }

    if (!event.coordinates || typeof event.coordinates !== 'object') {
      error(`Событие ${label}: отсутствуют coordinates`);
    } else {
      const { lat, lon } = event.coordinates;
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) error(`Событие ${label}: некорректная широта ${lat}`);
      if (!Number.isFinite(lon) || lon < -180 || lon > 180) error(`Событие ${label}: некорректная долгота ${lon}`);
    }

    if (Array.isArray(event.related)) {
      const relatedIds = new Set();
      event.related.forEach(relatedId => {
        if (!Number.isInteger(relatedId) || relatedId <= 0) error(`Событие ${label}: некорректная связь ${relatedId}`);
        if (relatedId === event.id) error(`Событие ${label}: связь с самим собой`);
        if (relatedIds.has(relatedId)) error(`Событие ${label}: повторяющаяся связь ${relatedId}`);
        relatedIds.add(relatedId);
      });
    }

    if (nonEmptyString(event.image)) {
      if (/^(?:https?:|data:|\/\/)/i.test(event.image) || event.image.includes('..')) {
        error(`Событие ${label}: изображение должно быть локальным: ${event.image}`);
      } else {
        usedImages.add(event.image);
        if (!fs.existsSync(path.join(ROOT, event.image))) error(`Событие ${label}: файл изображения отсутствует: ${event.image}`);
      }
    }
  });

  events.forEach(event => {
    if (!event || !Array.isArray(event.related)) return;
    event.related.forEach(relatedId => {
      if (!ids.has(relatedId)) error(`Событие ${event.id}: связь указывает на отсутствующий id ${relatedId}`);
    });
  });

  const imageDirectory = path.join(ROOT, 'images');
  const localIllustrations = fs.existsSync(imageDirectory)
    ? fs.readdirSync(imageDirectory).filter(file => file.toLowerCase().endsWith('.svg'))
    : [];
  if (localIllustrations.length < 15) error(`В каталоге images только ${localIllustrations.length} SVG, требуется не менее 15`);
  if (!fs.existsSync(path.join(imageDirectory, 'fallback.svg'))) error('Отсутствует images/fallback.svg');

  return { eventCount: events.length, usedImageCount: usedImages.size, localIllustrationCount: localIllustrations.length };
}

const javaScriptCount = checkJavaScriptSyntax();
const localPathCount = checkLocalPathsAndDependencies();
const events = loadHistoryEvents();
const validationResult = validateEvents(events);

console.log(`Событий проверено: ${validationResult.eventCount}`);
console.log(`Используемых изображений проверено: ${validationResult.usedImageCount}`);
console.log(`Локальных SVG найдено: ${validationResult.localIllustrationCount || 0}`);
console.log(`JavaScript-файлов проверено: ${javaScriptCount}`);
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
