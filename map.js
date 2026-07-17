'use strict';

(() => {
  const panel = document.getElementById('mapPanel');
  const svg = document.getElementById('historyMap');
  const status = document.getElementById('mapStatus');
  const reset = document.getElementById('mapReset');
  const searchInput = document.getElementById('searchInput');
  const resetFilters = document.getElementById('resetFilters');
  const modalPlace = document.getElementById('modalPlace');

  if (!panel || !svg || !status || !searchInput) return;

  const points = Object.freeze([
    { name: 'Киев', x: 210, y: 250 },
    { name: 'Новгород', x: 235, y: 105 },
    { name: 'Москва', x: 330, y: 175 },
    { name: 'Казань', x: 455, y: 190 },
    { name: 'Куликово поле', x: 350, y: 230 },
    { name: 'Санкт-Петербург', x: 205, y: 75 }
  ]);

  let activePlace = '';

  function createSvgElement(tag, attributes = {}) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function createMap() {
    svg.replaceChildren();
    svg.setAttribute('viewBox', '0 0 620 340');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Условная карта основных исторических центров');

    const land = createSvgElement('path', {
      class: 'map-land',
      d: 'M70 70 C150 20 270 35 340 65 C430 45 535 90 560 155 C585 220 535 295 430 300 C330 325 220 295 145 270 C80 245 45 170 70 70 Z'
    });
    const river = createSvgElement('path', {
      class: 'map-river',
      d: 'M250 55 C285 115 250 165 285 215 C310 250 300 285 330 315'
    });
    svg.append(land, river);

    points.forEach(point => {
      const group = createSvgElement('g', {
        class: 'map-point',
        tabindex: '0',
        role: 'button',
        'aria-label': `Показать события: ${point.name}`,
        'data-map-place': point.name,
        transform: `translate(${point.x} ${point.y})`
      });
      const circle = createSvgElement('circle', { r: 7 });
      const label = createSvgElement('text', { x: 12, y: 5 });
      label.textContent = point.name;
      group.append(circle, label);
      svg.append(group);
    });
  }

  function setActivePlace(place, filter = true) {
    activePlace = place;
    svg.querySelectorAll('[data-map-place]').forEach(point => {
      point.classList.toggle('active', point.getAttribute('data-map-place') === place);
    });
    status.textContent = place ? `Выбрано: ${place}` : 'Выберите точку на карте';
    if (reset) reset.hidden = !place;

    if (filter) {
      searchInput.value = place;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function handlePoint(target) {
    const point = target.closest('[data-map-place]');
    if (!point) return;
    const place = point.getAttribute('data-map-place') || '';
    setActivePlace(activePlace === place ? '' : place);
  }

  svg.addEventListener('click', event => handlePoint(event.target));
  svg.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const point = event.target.closest('[data-map-place]');
    if (!point) return;
    event.preventDefault();
    handlePoint(point);
  });

  if (reset) {
    reset.addEventListener('click', () => {
      setActivePlace('', false);
      if (resetFilters) resetFilters.click();
      else {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  searchInput.addEventListener('input', () => {
    if (activePlace && searchInput.value !== activePlace) setActivePlace('', false);
  });

  if (modalPlace) {
    const updateSelectedEvent = () => {
      const place = modalPlace.textContent.trim();
      const known = points.find(point => place.includes(point.name));
      if (known) {
        setActivePlace(known.name, false);
        status.textContent = `Место открытого события: ${place}`;
      } else if (place) {
        status.textContent = `Место открытого события: ${place}`;
      }
    };
    new MutationObserver(updateSelectedEvent).observe(modalPlace, { childList: true, characterData: true, subtree: true });
  }

  createMap();
  setActivePlace('', false);
})();
