'use strict';

(() => {
  const navigation = document.getElementById('centuryNavigation');
  const links = document.getElementById('centuryLinks');
  const timeline = document.getElementById('timeline');
  const backToTop = document.getElementById('backToTop');

  if (!navigation || !links || !timeline || !backToTop) return;

  const reducedMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let sections = [];
  let activeCentury = '';
  let scrollFrame = 0;
  let rebuildFrame = 0;

  function setActiveCentury(century) {
    if (!century || century === activeCentury) return;
    activeCentury = century;

    links.querySelectorAll('[data-century-link]').forEach(button => {
      const active = button.dataset.centuryLink === century;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'true' : 'false');
      if (active) {
        button.scrollIntoView({
          behavior: reducedMotion ? 'auto' : 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    });
  }

  function updateFromScroll() {
    scrollFrame = 0;
    const marker = navigation.getBoundingClientRect().bottom + 24;
    let current = sections[0] || null;

    sections.forEach(section => {
      if (section.getBoundingClientRect().top <= marker) current = section;
    });

    if (current) setActiveCentury(current.dataset.century);
    backToTop.hidden = window.scrollY < 600;
  }

  function scheduleScrollUpdate() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(updateFromScroll);
  }

  function rebuildNavigation() {
    rebuildFrame = 0;
    sections = [...timeline.querySelectorAll('.century-group[data-century]')];
    links.replaceChildren();

    const fragment = document.createDocumentFragment();
    sections.forEach(section => {
      const century = section.dataset.century;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'century-link';
      button.dataset.centuryLink = century;
      button.textContent = century.replace(/\s+век$/u, '');
      button.setAttribute('aria-label', `Перейти к разделу «${century}»`);
      button.addEventListener('click', () => {
        section.scrollIntoView({
          behavior: reducedMotion ? 'auto' : 'smooth',
          block: 'start'
        });
        setActiveCentury(century);
      });
      fragment.append(button);
    });

    links.append(fragment);
    navigation.hidden = sections.length === 0;
    activeCentury = '';
    updateFromScroll();
  }

  function scheduleRebuild() {
    if (rebuildFrame) cancelAnimationFrame(rebuildFrame);
    rebuildFrame = requestAnimationFrame(rebuildNavigation);
  }

  const timelineObserver = new MutationObserver(scheduleRebuild);
  timelineObserver.observe(timeline, { childList: true });

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  });
  window.addEventListener('scroll', scheduleScrollUpdate, { passive: true });
  window.addEventListener('resize', scheduleScrollUpdate);

  rebuildNavigation();
})();
