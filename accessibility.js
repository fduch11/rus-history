'use strict';

(() => {
  const modal = document.getElementById('eventModal');
  const modalTitle = document.getElementById('modalTitle');
  const timeline = document.getElementById('timeline');
  const quizPanel = document.getElementById('quizPanel');
  const mapPanel = document.getElementById('mapPanel');
  const progressPanel = document.getElementById('progressPanel');

  if (modal && modalTitle) {
    modal.setAttribute('aria-labelledby', 'modalTitle');
    modal.setAttribute('aria-modal', 'true');

    modal.addEventListener('cancel', event => {
      event.preventDefault();
      modal.close();
    });
  }

  if (timeline) {
    timeline.setAttribute('aria-live', 'polite');
    timeline.setAttribute('aria-busy', 'false');

    new MutationObserver(() => {
      timeline.setAttribute('aria-busy', 'false');
    }).observe(timeline, { childList: true });
  }

  if (quizPanel) quizPanel.setAttribute('aria-describedby', 'quizProgress quizFeedback');
  if (mapPanel) mapPanel.setAttribute('aria-describedby', 'mapStatus');
  if (progressPanel) progressPanel.setAttribute('aria-describedby', 'overallProgressText viewedProgressText progressStatus');

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (modal && modal.open) modal.close();
  });

  document.querySelectorAll('button:not([aria-label])').forEach(button => {
    if (!button.textContent.trim()) button.setAttribute('aria-label', 'Кнопка');
  });
})();
