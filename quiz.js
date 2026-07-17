'use strict';

(() => {
  const STORAGE_KEY = 'rusHistoryQuiz';
  const panel = document.getElementById('quizPanel');
  const typeLabel = document.getElementById('quizType');
  const questionText = document.getElementById('quizQuestion');
  const options = document.getElementById('quizOptions');
  const feedback = document.getElementById('quizFeedback');
  const progress = document.getElementById('quizProgress');
  const stats = document.getElementById('quizStats');
  const nextButton = document.getElementById('quizNext');
  const restartButton = document.getElementById('quizRestart');

  if (!panel || !questionText || !options || !nextButton) return;

  const TYPES = ['date', 'event', 'person', 'sequence', 'period'];
  const LABELS = {
    date: 'Дата', event: 'Событие', person: 'Личность', sequence: 'Последовательность', period: 'Период'
  };
  let questions = [];
  let index = 0;
  let score = 0;
  let answered = false;

  const unique = values => [...new Set(values.filter(value => value !== null && value !== undefined && String(value).trim()))];
  const shuffle = values => {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const sample = values => values[Math.floor(Math.random() * values.length)];

  function readStats() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        best: Number.isFinite(Number(value.best)) ? Number(value.best) : 0,
        attempts: Number.isFinite(Number(value.attempts)) ? Number(value.attempts) : 0,
        totalCorrect: Number.isFinite(Number(value.totalCorrect)) ? Number(value.totalCorrect) : 0,
        totalQuestions: Number.isFinite(Number(value.totalQuestions)) ? Number(value.totalQuestions) : 0
      };
    } catch {
      return { best: 0, attempts: 0, totalCorrect: 0, totalQuestions: 0 };
    }
  }

  function writeStats(value) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* статистика необязательна */ }
  }

  function renderStats() {
    const value = readStats();
    const accuracy = value.totalQuestions ? Math.round(value.totalCorrect / value.totalQuestions * 100) : 0;
    stats.textContent = `Лучший: ${value.best}/10 · Попыток: ${value.attempts} · Точность: ${accuracy}%`;
  }

  function distinctOptions(correct, pool) {
    const alternatives = shuffle(unique(pool).filter(value => String(value) !== String(correct))).slice(0, 3);
    if (alternatives.length < 3) return null;
    return shuffle([correct, ...alternatives]);
  }

  function makeDateQuestion(event) {
    const choices = distinctOptions(event.year, HISTORY_EVENTS.map(item => item.year));
    return choices && { type: 'date', prompt: `В каком году произошло событие «${event.title}»?`, correct: event.year, choices };
  }

  function makeEventQuestion(event) {
    const choices = distinctOptions(event.title, HISTORY_EVENTS.map(item => item.title));
    return choices && { type: 'event', prompt: `Какое событие произошло в ${event.year} году?`, correct: event.title, choices };
  }

  function makePersonQuestion(event) {
    const person = Array.isArray(event.people) ? event.people[0] : null;
    if (!person) return null;
    const pool = HISTORY_EVENTS.flatMap(item => Array.isArray(item.people) ? item.people : []);
    const choices = distinctOptions(person, pool);
    return choices && { type: 'person', prompt: `Кто связан с событием «${event.title}»?`, correct: person, choices };
  }

  function makePeriodQuestion(event) {
    const choices = distinctOptions(event.period, HISTORY_EVENTS.map(item => item.period));
    return choices && { type: 'period', prompt: `К какому историческому периоду относится «${event.title}»?`, correct: event.period, choices };
  }

  function makeSequenceQuestion() {
    const ordered = [...HISTORY_EVENTS].sort((a, b) => a.sortYear - b.sortYear || a.id - b.id);
    const start = Math.floor(Math.random() * (ordered.length - 3));
    const pair = ordered.slice(start, start + 2);
    const correct = `${pair[0].title} → ${pair[1].title}`;
    const pool = [];
    for (let i = 0; i < 16; i += 1) {
      const a = sample(ordered);
      const b = sample(ordered.filter(item => item.id !== a.id));
      const first = a.sortYear <= b.sortYear ? a : b;
      const second = first === a ? b : a;
      pool.push(`${first.title} → ${second.title}`);
    }
    const choices = distinctOptions(correct, pool);
    return choices && { type: 'sequence', prompt: 'Какая последовательность событий расположена от более раннего к более позднему?', correct, choices };
  }

  function buildQuestion(type) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const event = sample(HISTORY_EVENTS);
      const question = type === 'date' ? makeDateQuestion(event)
        : type === 'event' ? makeEventQuestion(event)
          : type === 'person' ? makePersonQuestion(event)
            : type === 'period' ? makePeriodQuestion(event)
              : makeSequenceQuestion();
      if (question && new Set(question.choices.map(String)).size === 4) return question;
    }
    return null;
  }

  function buildQuiz() {
    const result = [];
    const repeatedTypes = [...TYPES, ...TYPES];
    repeatedTypes.forEach(type => {
      const question = buildQuestion(type);
      if (question) result.push(question);
    });
    return shuffle(result).slice(0, 10);
  }

  function showQuestion() {
    answered = false;
    const question = questions[index];
    if (!question) return finishQuiz();
    typeLabel.textContent = LABELS[question.type];
    questionText.textContent = question.prompt;
    progress.textContent = `Вопрос ${index + 1} из ${questions.length} · Правильных: ${score}`;
    feedback.textContent = '';
    options.replaceChildren();
    question.choices.forEach(choice => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quiz-option';
      button.textContent = choice;
      button.addEventListener('click', () => answerQuestion(button, choice));
      options.append(button);
    });
    nextButton.hidden = true;
    restartButton.hidden = true;
  }

  function answerQuestion(selectedButton, choice) {
    if (answered) return;
    answered = true;
    const question = questions[index];
    const correct = String(choice) === String(question.correct);
    if (correct) score += 1;
    options.querySelectorAll('button').forEach(button => {
      button.disabled = true;
      if (button.textContent === String(question.correct)) button.classList.add('correct');
    });
    if (!correct) selectedButton.classList.add('incorrect');
    feedback.textContent = correct ? 'Верно.' : `Неверно. Правильный ответ: ${question.correct}.`;
    progress.textContent = `Вопрос ${index + 1} из ${questions.length} · Правильных: ${score}`;
    nextButton.hidden = false;
    nextButton.textContent = index === questions.length - 1 ? 'Показать результат' : 'Следующий вопрос';
  }

  function finishQuiz() {
    const value = readStats();
    value.attempts += 1;
    value.best = Math.max(value.best, score);
    value.totalCorrect += score;
    value.totalQuestions += questions.length;
    writeStats(value);
    typeLabel.textContent = 'Результат';
    questionText.textContent = `${score} из ${questions.length}`;
    options.replaceChildren();
    const result = document.createElement('div');
    result.className = 'quiz-result';
    const strong = document.createElement('strong');
    strong.textContent = score >= 8 ? 'Высокий результат' : score >= 5 ? 'Базовые знания закреплены' : 'Стоит повторить события';
    const text = document.createElement('span');
    text.textContent = `Правильных ответов: ${score}. Лучший результат: ${value.best} из 10.`;
    result.append(strong, text);
    options.append(result);
    feedback.textContent = '';
    progress.textContent = `Тест завершён · ${score}/${questions.length}`;
    nextButton.hidden = true;
    restartButton.hidden = false;
    renderStats();
  }

  function startQuiz() {
    questions = buildQuiz();
    index = 0;
    score = 0;
    if (questions.length < 10) {
      questionText.textContent = 'Недостаточно данных для формирования теста.';
      return;
    }
    showQuestion();
  }

  nextButton.addEventListener('click', () => {
    if (!answered) return;
    index += 1;
    showQuestion();
  });
  restartButton.addEventListener('click', startQuiz);

  renderStats();
  startQuiz();
})();