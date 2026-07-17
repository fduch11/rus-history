'use strict';
(() => {
  const fallback = 'images/fallback.svg';
  const exact = new Map([
    ['Призвание Рюрика', 'images/862-rurik.svg'],
    ['Крещение Руси', 'images/988-baptism.svg'],
    ['Ледовое побоище', 'images/1242-ice-battle.svg'],
    ['Куликовская битва', 'images/1380-kulikovo.svg'],
    ['Основание Санкт-Петербурга', 'images/1703-petersburg.svg'],
    ['Отечественная война 1812 года', 'images/1812-war.svg']
  ]);

  function selectImage(event) {
    if (exact.has(event.title)) return exact.get(event.title);
    const text = `${event.title} ${event.summary}`.toLocaleLowerCase('ru');
    if (text.includes('великая отечественная') || (event.sortYear >= 1941 && event.sortYear <= 1945)) return 'images/1945-victory.svg';
    if (text.includes('казан')) return 'images/kazan.svg';
    if (text.includes('монгол') || text.includes('ордын') || text.includes('батый')) return 'images/mongol-invasion.svg';
    if (text.includes('смут') || text.includes('ополчен') || text.includes('самозван')) return 'images/time-of-troubles.svg';
    if (text.includes('космос') || text.includes('гагарин') || text.includes('спутник')) return 'images/space.svg';
    if (event.period === 'Древняя Русь' || event.sortYear < 1132) return 'images/ancient-city.svg';
    if (event.period === 'Раздробленность') return 'images/mongol-invasion.svg';
    if (event.period === 'Московское княжество') return 'images/moscow-kremlin.svg';
    if (event.period === 'Русское царство') return event.sortYear < 1613 ? 'images/time-of-troubles.svg' : 'images/moscow-kremlin.svg';
    if (event.period === 'Российская империя') return 'images/empire.svg';
    if (event.period === 'Революция и СССР') return 'images/revolution.svg';
    return fallback;
  }

  HISTORY_EVENTS.forEach(event => {
    event.image = selectImage(event);
  });

  document.addEventListener('error', event => {
    const image = event.target;
    if (image instanceof HTMLImageElement && !image.dataset.fallbackApplied) {
      image.dataset.fallbackApplied = 'true';
      image.src = fallback;
    }
  }, true);
})();