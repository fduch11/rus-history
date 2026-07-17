'use strict';

(() => {
  const modal = document.getElementById('eventModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalYear = document.getElementById('modalYear');
  const place = document.getElementById('modalPlace');
  const description = document.getElementById('modalDescription');
  const course = document.getElementById('modalCourse');
  const causes = document.getElementById('modalCauses');
  const consequences = document.getElementById('modalConsequences');
  const people = document.getElementById('modalPeople');
  const fact = document.getElementById('modalFact');
  const sources = document.getElementById('modalSources');
  const related = document.getElementById('modalRelated');
  const previousButton = document.getElementById('modalPrevious');
  const nextButton = document.getElementById('modalNext');
  const studiedButton = document.getElementById('modalStudied');
  const shareButton = document.getElementById('modalShare');
  const shareStatus = document.getElementById('modalShareStatus');
  const resetFilters = document.getElementById('resetFilters');
  const timeline = document.getElementById('timeline');

  if (!modal || !modalTitle || !modalYear || !timeline) return;

  let activeEvent = null;
  let lastTrigger = null;

  function createListItems(container, values) {
    container.replaceChildren();
    const items = Array.isArray(values) ? values : [];
    items.forEach(value => {
      const item = document.createElement('li');
      item.textContent = String(value);
      container.append(item);
    });
    container.closest('.modal-section').hidden = items.length === 0;
  }

  function readStoredCollections() {
    try {
      const data = JSON.parse(localStorage.getItem('rusHistory') || '{}');
      return data.collections && typeof data.collections === 'object'
        ? data.collections
        : {};
    } catch {
      return {};
    }
  }

  function updateStudiedButton() {
    if (!activeEvent) return;
    const collections = readStoredCollections();
    const studied = Array.isArray(collections.studied)
      && collections.studied.map(Number).includes(activeEvent.id);
    studiedButton.textContent = studied ? '✓ Изучено' : 'Отметить изученным';
    studiedButton.classList.toggle('active', studied);
    studiedButton.setAttribute('aria-pressed', String(studied));
  }

  function openEvent(id) {
    const card = timeline.querySelector(`[data-id="${id}"]`);
    if (card) {
      card.click();
      return;
    }

    if (resetFilters) resetFilters.click();
    requestAnimationFrame(() => {
      const visibleCard = timeline.querySelector(`[data-id="${id}"]`);
      if (visibleCard) visibleCard.click();
    });
  }

  function createEventButton(event, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'related-event-button';
    button.textContent = `${label}${event.year} — ${event.title}`;
    button.addEventListener('click', () => openEvent(event.id));
    return button;
  }

  function populateRelated(event) {
    related.replaceChildren();
    const relatedEvents = (event.related || [])
      .map(id => HISTORY_EVENTS.find(item => item.id === Number(id)))
      .filter(Boolean);
    relatedEvents.forEach(item => related.append(createEventButton(item, '')));
    related.closest('.modal-section').hidden = relatedEvents.length === 0;
  }

  function setNeighborButton(button, event, prefix) {
    if (!event) {
      button.hidden = true;
      button.onclick = null;
      return;
    }
    button.hidden = false;
    button.textContent = `${prefix}${event.year} — ${event.title}`;
    button.onclick = () => openEvent(event.id);
  }

  function findEventFromModal() {
    const title = modalTitle.textContent.trim();
    const year = modalYear.textContent.trim();
    return HISTORY_EVENTS.find(event => event.title === title && event.year === year)
      || HISTORY_EVENTS.find(event => event.title === title)
      || null;
  }

  function populateModal() {
    activeEvent = findEventFromModal();
    if (!activeEvent) return;

    const index = HISTORY_EVENTS.findIndex(event => event.id === activeEvent.id);
    const previous = index > 0 ? HISTORY_EVENTS[index - 1] : null;
    const next = index >= 0 && index < HISTORY_EVENTS.length - 1 ? HISTORY_EVENTS[index + 1] : null;

    place.textContent = activeEvent.place || 'Место не указано';
    description.textContent = activeEvent.description || activeEvent.summary || '';
    course.textContent = activeEvent.course || '';
    fact.textContent = activeEvent.fact || '';
    course.closest('.modal-section').hidden = !course.textContent;
    fact.closest('.modal-section').hidden = !fact.textContent;

    createListItems(causes, activeEvent.causes);
    createListItems(consequences, activeEvent.consequences);
    createListItems(people, activeEvent.people);
    createListItems(sources, activeEvent.sources);
    populateRelated(activeEvent);
    setNeighborButton(previousButton, previous, '← ');
    setNeighborButton(nextButton, next, '→ ');
    updateStudiedButton();
    shareStatus.textContent = '';
  }

  async function copyShareText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('copy-failed');
  }

  studiedButton.addEventListener('click', () => {
    if (!activeEvent) return;
    const cardButton = timeline.querySelector(`[data-study-id="${activeEvent.id}"]`);
    if (cardButton) {
      cardButton.click();
      updateStudiedButton();
    }
  });

  shareButton.addEventListener('click', async () => {
    if (!activeEvent) return;
    const text = `${activeEvent.year} — ${activeEvent.title}\n${activeEvent.summary}`;
    const shareData = { title: activeEvent.title, text, url: window.location.href };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        shareStatus.textContent = 'Событие отправлено.';
      } else {
        await copyShareText(`${text}\n${window.location.href}`);
        shareStatus.textContent = 'Текст и ссылка скопированы.';
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      shareStatus.textContent = 'Не удалось поделиться событием.';
    }
  });

  timeline.addEventListener('click', event => {
    const card = event.target.closest('[data-id]');
    if (card) lastTrigger = card;
  }, true);

  timeline.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-id]')) {
      lastTrigger = event.target;
    }
  }, true);

  const titleObserver = new MutationObserver(populateModal);
  titleObserver.observe(modalTitle, { childList: true, characterData: true, subtree: true });

  modal.addEventListener('close', () => {
    activeEvent = null;
    if (lastTrigger && lastTrigger.isConnected) lastTrigger.focus();
  });
})();
