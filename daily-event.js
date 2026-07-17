'use strict';

(() => {
  const card = document.getElementById('dailyEvent');
  const image = document.getElementById('dailyEventImage');
  const year = document.getElementById('dailyEventYear');
  const title = document.getElementById('dailyEventTitle');
  const summary = document.getElementById('dailyEventSummary');
  const openButton = document.getElementById('dailyEventOpen');
  const anotherButton = document.getElementById('dailyEventAnother');
  const resetFilters = document.getElementById('resetFilters');
  const timeline = document.getElementById('timeline');

  if (!card || !image || !year || !title || !summary || !openButton || !anotherButton || !timeline) return;

  let currentIndex = 0;

  function dayNumber(date = new Date()) {
    const start = Date.UTC(date.getUTCFullYear(), 0, 0);
    const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return Math.floor((current - start) / 86400000);
  }

  function stableDailyIndex() {
    const date = new Date();
    const seed = date.getUTCFullYear() * 1000 + dayNumber(date);
    return seed % HISTORY_EVENTS.length;
  }

  function renderEvent() {
    const event = HISTORY_EVENTS[currentIndex];
    if (!event) return;
    image.src = event.image;
    image.alt = `Иллюстрация к событию «${event.title}»`;
    year.textContent = event.year;
    title.textContent = event.title;
    summary.textContent = event.summary;
    openButton.dataset.eventId = String(event.id);
  }

  function openEvent(id) {
    const eventCard = timeline.querySelector(`[data-id="${id}"]`);
    if (eventCard) {
      eventCard.click();
      return;
    }
    if (resetFilters) resetFilters.click();
    requestAnimationFrame(() => {
      const visibleCard = timeline.querySelector(`[data-id="${id}"]`);
      if (visibleCard) visibleCard.click();
    });
  }

  openButton.addEventListener('click', () => openEvent(Number(openButton.dataset.eventId)));
  anotherButton.addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % HISTORY_EVENTS.length;
    renderEvent();
  });

  currentIndex = stableDailyIndex();
  renderEvent();
})();
