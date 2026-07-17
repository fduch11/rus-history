'use strict';

(() => {
  const panel = document.getElementById('mapPanel');
  const svg = document.getElementById('historyMap');
  const status = document.getElementById('mapStatus');
  const reset = document.getElementById('mapReset');
  const modalPlace = document.getElementById('modalPlace');

  if (!panel || !svg || !status) return;

  const VIEWBOX = Object.freeze({ width: 720, height: 420 });
  const MAIN_AREA = Object.freeze({ x: 88, y: 44, width: 592, height: 314 });
  const INSET_AREA = Object.freeze({ x: 24, y: 286, width: 136, height: 92 });
  const MAIN_BOUNDS = Object.freeze({ minLon: 20, maxLon: 140, minLat: 35, maxLat: 65 });
  const CLUSTER_DISTANCE = 24;

  let placeGroups = [];
  let clusters = [];
  let activeClusterId = '';
  let previewClusterId = '';

  function createSvgElement(tag, attributes = {}) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function normalizePlace(value) {
    return String(value || '').trim();
  }

  function uniqueNumbers(values) {
    return [...new Set(values.map(Number).filter(Number.isFinite))];
  }

  function isMainCoordinate(lat, lon) {
    return Number.isFinite(lat)
      && Number.isFinite(lon)
      && lon >= MAIN_BOUNDS.minLon
      && lon <= MAIN_BOUNDS.maxLon
      && lat >= MAIN_BOUNDS.minLat
      && lat <= MAIN_BOUNDS.maxLat;
  }

  function projectMain(lat, lon) {
    const x = MAIN_AREA.x + ((lon - MAIN_BOUNDS.minLon) / (MAIN_BOUNDS.maxLon - MAIN_BOUNDS.minLon)) * MAIN_AREA.width;
    const y = MAIN_AREA.y + ((MAIN_BOUNDS.maxLat - lat) / (MAIN_BOUNDS.maxLat - MAIN_BOUNDS.minLat)) * MAIN_AREA.height;
    return { x, y };
  }

  function buildPlaceGroups() {
    const groups = new Map();

    HISTORY_EVENTS.forEach(event => {
      if (!event || !event.coordinates || !Number.isFinite(event.coordinates.lat) || !Number.isFinite(event.coordinates.lon)) return;
      const place = normalizePlace(event.place);
      if (!place) return;

      const key = `${place}|${event.coordinates.lat}|${event.coordinates.lon}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          place,
          lat: event.coordinates.lat,
          lon: event.coordinates.lon,
          eventIds: [],
          titles: [],
          count: 0
        });
      }

      const item = groups.get(key);
      item.eventIds.push(event.id);
      item.titles.push(event.title);
      item.count += 1;
    });

    return [...groups.values()]
      .map(group => {
        const isMain = isMainCoordinate(group.lat, group.lon);
        return {
          ...group,
          eventIds: uniqueNumbers(group.eventIds),
          region: isMain ? 'main' : 'inset',
          ...(
            isMain
              ? projectMain(group.lat, group.lon)
              : { x: 0, y: 0 }
          )
        };
      })
      .sort((a, b) => a.region.localeCompare(b.region, 'ru') || a.x - b.x || a.y - b.y || a.place.localeCompare(b.place, 'ru'));
  }

  function positionInsetGroups(groups) {
    const insetGroups = groups.filter(group => group.region === 'inset');
    insetGroups.forEach((group, index) => {
      const columns = 2;
      const column = index % columns;
      const row = Math.floor(index / columns);
      group.x = INSET_AREA.x + 28 + column * 54;
      group.y = INSET_AREA.y + 26 + row * 28;
    });
  }

  function clusterGroups(groups) {
    const nextClusters = [];

    groups.forEach(group => {
      const candidate = nextClusters.find(cluster => {
        if (cluster.region !== group.region) return false;
        const distance = Math.hypot(cluster.x - group.x, cluster.y - group.y);
        return distance <= CLUSTER_DISTANCE;
      });

      if (!candidate) {
        nextClusters.push({
          id: `${group.region}-${nextClusters.length + 1}`,
          region: group.region,
          x: group.x,
          y: group.y,
          placeGroups: [group],
          eventIds: [...group.eventIds]
        });
        return;
      }

      candidate.placeGroups.push(group);
      candidate.eventIds = uniqueNumbers(candidate.eventIds.concat(group.eventIds));
      const size = candidate.placeGroups.length;
      candidate.x = candidate.placeGroups.reduce((sum, item) => sum + item.x, 0) / size;
      candidate.y = candidate.placeGroups.reduce((sum, item) => sum + item.y, 0) / size;
    });

    return nextClusters.map(cluster => {
      const places = cluster.placeGroups.map(group => group.place);
      const totalEvents = cluster.eventIds.length;
      const primaryPlace = cluster.placeGroups.slice().sort((a, b) => b.count - a.count || a.place.localeCompare(b.place, 'ru'))[0];
      const isSinglePlace = cluster.placeGroups.length === 1;
      const label = isSinglePlace ? primaryPlace.place : `${cluster.placeGroups.length} места`;
      const radius = Math.max(7, Math.min(17, 7 + totalEvents * 0.35));
      const summary = isSinglePlace
        ? `${primaryPlace.place} · ${totalEvents} событий`
        : `${cluster.placeGroups.length} мест · ${totalEvents} событий`;

      return {
        ...cluster,
        places,
        totalEvents,
        primaryPlace: primaryPlace.place,
        isSinglePlace,
        label,
        radius,
        summary
      };
    });
  }

  function buildMapData() {
    placeGroups = buildPlaceGroups();
    positionInsetGroups(placeGroups);
    clusters = clusterGroups(placeGroups);
  }

  function createBackdrop() {
    const fragment = document.createDocumentFragment();
    const frame = createSvgElement('rect', {
      class: 'map-frame',
      x: MAIN_AREA.x,
      y: MAIN_AREA.y,
      width: MAIN_AREA.width,
      height: MAIN_AREA.height,
      rx: 20
    });
    const sea = createSvgElement('rect', {
      class: 'map-sea',
      x: MAIN_AREA.x,
      y: MAIN_AREA.y,
      width: MAIN_AREA.width,
      height: MAIN_AREA.height,
      rx: 20
    });
    const land = createSvgElement('path', {
      class: 'map-land',
      d: 'M120 88 C160 56 230 54 295 82 C348 55 416 60 468 98 C514 132 571 137 611 190 C632 221 624 262 584 289 C533 323 452 330 378 309 C318 339 232 334 172 292 C118 254 92 202 102 150 C107 124 109 104 120 88 Z'
    });

    fragment.append(sea, land);

    for (let lon = MAIN_BOUNDS.minLon; lon <= MAIN_BOUNDS.maxLon; lon += 20) {
      const x = MAIN_AREA.x + ((lon - MAIN_BOUNDS.minLon) / (MAIN_BOUNDS.maxLon - MAIN_BOUNDS.minLon)) * MAIN_AREA.width;
      fragment.append(createSvgElement('line', {
        class: 'map-grid',
        x1: x,
        y1: MAIN_AREA.y,
        x2: x,
        y2: MAIN_AREA.y + MAIN_AREA.height
      }));
    }

    for (let lat = MAIN_BOUNDS.minLat; lat <= MAIN_BOUNDS.maxLat; lat += 10) {
      const y = MAIN_AREA.y + ((MAIN_BOUNDS.maxLat - lat) / (MAIN_BOUNDS.maxLat - MAIN_BOUNDS.minLat)) * MAIN_AREA.height;
      fragment.append(createSvgElement('line', {
        class: 'map-grid',
        x1: MAIN_AREA.x,
        y1: y,
        x2: MAIN_AREA.x + MAIN_AREA.width,
        y2: y
      }));
    }

    fragment.append(frame);

    const inset = createSvgElement('rect', {
      class: 'map-inset',
      x: INSET_AREA.x,
      y: INSET_AREA.y,
      width: INSET_AREA.width,
      height: INSET_AREA.height,
      rx: 16
    });
    const insetTitle = createSvgElement('text', {
      class: 'map-inset-title',
      x: INSET_AREA.x + 12,
      y: INSET_AREA.y + 18
    });
    insetTitle.textContent = 'Удалённые точки';

    fragment.append(inset, insetTitle);
    return fragment;
  }

  function clusterAriaLabel(cluster) {
    const places = cluster.places.slice(0, 4).join(', ');
    const more = cluster.places.length > 4 ? ` и ещё ${cluster.places.length - 4}` : '';
    return `Показать события: ${places}${more}. Всего событий: ${cluster.totalEvents}.`;
  }

  function renderCluster(cluster) {
    const group = createSvgElement('g', {
      class: 'map-point-group',
      tabindex: '0',
      role: 'button',
      'data-map-cluster-id': cluster.id,
      'aria-label': clusterAriaLabel(cluster),
      transform: `translate(${cluster.x} ${cluster.y})`
    });

    const point = createSvgElement('circle', {
      class: 'map-point-circle',
      r: cluster.radius
    });
    const pulse = createSvgElement('circle', {
      class: 'map-point-pulse',
      r: cluster.radius + 5
    });
    const title = createSvgElement('title');
    title.textContent = `${cluster.summary}: ${cluster.places.join(', ')}`;
    group.append(pulse, point, title);

    if (cluster.totalEvents > 1) {
      const count = createSvgElement('text', {
        class: 'map-point-count',
        y: 4
      });
      count.textContent = String(cluster.totalEvents);
      group.append(count);
    }

    const shouldShowLabel = cluster.totalEvents >= 3 || cluster.isSinglePlace === false;
    if (shouldShowLabel) {
      const label = createSvgElement('text', {
        class: 'map-point-label',
        x: cluster.radius + 10,
        y: 5
      });
      label.textContent = cluster.label;
      group.append(label);
    }

    return group;
  }

  function renderMap() {
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Историческая карта событий по реальным координатам');
    svg.append(createBackdrop());
    clusters.forEach(cluster => svg.append(renderCluster(cluster)));
    syncClusterClasses();
  }

  function clusterById(id) {
    return clusters.find(cluster => cluster.id === id) || null;
  }

  function clusterByPlace(place) {
    return clusters.find(cluster => cluster.places.includes(place)) || null;
  }

  function syncClusterClasses() {
    svg.querySelectorAll('[data-map-cluster-id]').forEach(node => {
      const id = node.getAttribute('data-map-cluster-id') || '';
      node.classList.toggle('active', id === activeClusterId);
      node.classList.toggle('preview', id === previewClusterId && id !== activeClusterId);
    });
  }

  function dispatchMapFilter(cluster) {
    window.dispatchEvent(new CustomEvent('rus-history:set-map-filter', {
      detail: {
        eventIds: cluster.eventIds,
        label: cluster.summary
      }
    }));
  }

  function clearMapSelection(notifyApp = true) {
    activeClusterId = '';
    if (notifyApp) window.dispatchEvent(new CustomEvent('rus-history:clear-map-filter'));
    if (!previewClusterId) {
      status.textContent = `На карте ${placeGroups.length} мест и ${clusters.length} групп точек.`;
    }
    if (reset) reset.hidden = true;
    syncClusterClasses();
  }

  function setActiveCluster(cluster, notifyApp = true) {
    activeClusterId = cluster.id;
    status.textContent = `Выбрано: ${cluster.summary}.`;
    if (reset) reset.hidden = false;
    if (notifyApp) dispatchMapFilter(cluster);
    syncClusterClasses();
  }

  function toggleCluster(id) {
    const cluster = clusterById(id);
    if (!cluster) return;
    if (activeClusterId === id) {
      clearMapSelection(true);
      return;
    }
    setActiveCluster(cluster, true);
  }

  function handlePoint(target) {
    const point = target.closest('[data-map-cluster-id]');
    if (!point) return;
    toggleCluster(point.getAttribute('data-map-cluster-id') || '');
  }

  function updatePreviewFromModal() {
    const place = modalPlace ? normalizePlace(modalPlace.textContent) : '';
    if (!place) {
      previewClusterId = '';
      if (!activeClusterId) status.textContent = `На карте ${placeGroups.length} мест и ${clusters.length} групп точек.`;
      syncClusterClasses();
      return;
    }

    const cluster = clusterByPlace(place);
    previewClusterId = cluster ? cluster.id : '';
    if (!activeClusterId) {
      status.textContent = cluster
        ? `Место открытого события: ${place}. ${cluster.summary}.`
        : `Место открытого события: ${place}.`;
    }
    syncClusterClasses();
  }

  svg.addEventListener('click', event => handlePoint(event.target));
  svg.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const point = event.target.closest('[data-map-cluster-id]');
    if (!point) return;
    event.preventDefault();
    toggleCluster(point.getAttribute('data-map-cluster-id') || '');
  });

  if (reset) {
    reset.addEventListener('click', () => {
      clearMapSelection(true);
      updatePreviewFromModal();
    });
  }

  window.addEventListener('rus-history:map-filter-cleared', () => {
    activeClusterId = '';
    if (reset) reset.hidden = true;
    updatePreviewFromModal();
  });

  if (modalPlace) {
    new MutationObserver(updatePreviewFromModal).observe(modalPlace, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  buildMapData();
  renderMap();
  if (reset) reset.hidden = true;
  status.textContent = `На карте ${placeGroups.length} мест и ${clusters.length} групп точек.`;
})();
