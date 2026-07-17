'use strict';
(() => {
  const timeline = document.getElementById('timeline');
  const navigation = document.getElementById('centuryNavigation');
  const navigationList = document.getElementById('centuryNavigationList');
  const backToTop = document.getElementById('backToTop');
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  let scheduled = false;
  let activeCentury = '';

  function centurySections() {
    return [...timeline.querySelectorAll('.century-group')];
  }

  function setActiveCentury(century) {
    if (activeCentury === century) return;
    activeCentury = century;
    navigationList.querySelectorAll('[data-century-target]').forEach(button => {
      const active = button.dataset.century === century;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'true' : 'false');
      if (active) button.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
    });
  }

  function updateScrollState() {
    scheduled = false;
    const sections = centurySections();
    const threshold = 155;
    let current = sections[0] || null;

    sections.forEach(section => {
      if (section.getBoundingClientRect().top <= threshold) current = section;
    });

    setActiveCentury(current ? current.dataset.century : '');
    backToTop.classList.toggle('visible', window.scrollY > 600);
    backToTop.setAttribute('aria-hidden', window.scrollY > 600 ? 'false' : 'true');
  }

  function scheduleScrollUpdate() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(updateScrollState);
  }

  function refreshNavigation() {
    const sections = centurySections();
    const fragment = document.createDocumentFragment();

    sections.forEach((section, index) => {
      const century = section.dataset.century || `Век ${index + 1}`;
      section.id = `century-section-${index + 1}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'century-nav-button';
      button.dataset.century = century;
      button.dataset.centuryTarget = section.id;
      button.textContent = century;
      button.setAttribute('aria-current', 'false');
      fragment.append(button);
    });

    navigationList.replaceChildren(fragment);
    navigation.hidden = sections.length === 0;
    activeCentury = '';
    scheduleScrollUpdate();
  }

  navigationList.addEventListener('click', event => {
    const button = event.target.closest('[data-century-target]');
    if (!button) return;
    const section = document.getElementById(button.dataset.centuryTarget);
    if (!section) return;
    section.scrollIntoView({
      behavior: reducedMotion && reducedMotion.matches ? 'auto' : 'smooth',
      block: 'start'
    });
    setActiveCentury(button.dataset.century);
  });

  backToTop.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: reducedMotion && reducedMotion.matches ? 'auto' : 'smooth'
    });
  });

  const timelineObserver = new MutationObserver(refreshNavigation);
  timelineObserver.observe(timeline, { childList: true });
  window.addEventListener('scroll', scheduleScrollUpdate, { passive: true });
  window.addEventListener('resize', scheduleScrollUpdate, { passive: true });

  refreshNavigation();
})();
