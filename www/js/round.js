/* Mates — shared practice-round engine.
 * Used by all modes: level (fixed), adaptive and timed.
 * cfg = { op, level, count, timed?, adaptive?, returnScreen, onComplete(results) }
 * Adaptive rules (spec): step up after 3 consecutive correct,
 * step down after 2 wrong, clamped to levels 1–5. */
window.Mates = window.Mates || {};
Mates.screens = Mates.screens || {};
Mates.actions = Mates.actions || {};

Mates.round = (function () {
  let r = null; // active round state (null when no round is running)

  function praiseText() {
    const i = Math.floor(Math.random() * 5);
    return Mates.t('feedback.praise' + (i + 1));
  }

  /** One random question at the given level; "mixed" picks a random operation. */
  function generateFor(op, level) {
    if (op === 'mixed') {
      const ops = Mates.questions.OPS;
      return Mates.questions.generate(ops[Math.floor(Math.random() * ops.length)], level);
    }
    return Mates.questions.generate(op, level);
  }

  function currentQuestion() {
    if (r.questions) return r.questions[r.index];
    // adaptive/timed: generate on the fly, cached per index
    if (!r.currentQ) {
      let q, guard = 0;
      do {
        q = generateFor(r.op, r.level);
      } while (keyOf(q) === r.lastKey && guard++ < 50);
      r.lastKey = keyOf(q);
      r.currentQ = q;
    }
    return r.currentQ;
  }

  function keyOf(q) { return q.a + q.op + q.b; }

  /** Start a round and show the round screen. */
  function start(cfg) {
    r = {
      op: cfg.op,
      level: Math.min(5, Math.max(1, cfg.level || 1)),
      count: cfg.count || 10,
      timed: !!cfg.timed,
      adaptive: !!cfg.adaptive,
      returnScreen: cfg.returnScreen || 'home',
      onComplete: cfg.onComplete || null,
      index: 0,
      score: 0,
      input: '',
      locked: false,
      feedback: null, // { type: 'ok'|'no', text }
      streakCorrect: 0,
      streakWrong: 0,
      timeLeft: cfg.timed ? 60 : 0,
      timerId: null,
      // Timed rounds run until the clock hits 0: no fixed count, questions
      // are generated on demand (also required for "mixed" operation).
      count: cfg.timed ? Infinity : (cfg.count || 10),
      questions: (cfg.adaptive || cfg.timed) ? null : Mates.questions.generateRound(cfg.op, cfg.level, cfg.count),
      currentQ: null,
      lastKey: null
    };
    if (r.timed) {
      r.timerId = setInterval(tick, 1000);
    }
    Mates.router.go('round');
  }

  /** One timer tick (also exposed for tests). */
  function tick() {
    if (!r || !r.timed) return;
    r.timeLeft--;
    if (r.timeLeft <= 0) finish();
    else updateClock();
  }

  /** Update clock + score in place. Re-rendering the whole screen on every
   *  tick replaces all DOM nodes and makes the round visibly flicker. */
  function updateClock() {
    const clock = document.getElementById('roundTimer');
    if (clock) clock.textContent = '⏱ ' + r.timeLeft;
    const score = document.getElementById('roundScore');
    if (score) score.textContent = String(r.score);
  }

  /** Keypad input: digit string, 'back' or 'enter'. */
  function keypad(action) {
    if (!r || r.locked) return;
    if (action === 'back') {
      r.input = r.input.slice(0, -1);
    } else if (action === 'enter') {
      submit();
      return;
    } else {
      if (r.input.length < 4) r.input += action;
    }
    render();
  }

  function submit() {
    if (!r || r.locked || r.input === '') return;
    const q = currentQuestion();
    const correct = Number(r.input) === q.answer;
    if (correct) r.score++;
    Mates.sound.play(correct ? 'correct' : 'wrong');

    // Adaptive difficulty adjustment
    if (r.adaptive) {
      if (correct) {
        r.streakCorrect++;
        r.streakWrong = 0;
        if (r.streakCorrect >= 3) {
          r.level = Math.min(5, r.level + 1);
          r.streakCorrect = 0;
        }
      } else {
        r.streakWrong++;
        r.streakCorrect = 0;
        if (r.streakWrong >= 2) {
          r.level = Math.max(1, r.level - 1);
          r.streakWrong = 0;
        }
      }
    }

    if (r.timed) {
      // quick flash, then straight to the next question
      r.feedback = correct ? { type: 'ok', text: praiseText() }
        : { type: 'no', text: Mates.t('feedback.wrong', { n: q.answer }) };
      advance();
      return;
    }

    r.locked = true;
    r.feedback = correct ? { type: 'ok', text: praiseText() }
      : { type: 'no', text: Mates.t('feedback.wrong', { n: q.answer }) };
    render();
    setTimeout(advance, 1000);
  }

  function advance() {
    if (!r) return;
    r.locked = false;
    r.input = '';
    r.feedback = null;
    r.currentQ = null; // adaptive: next question is generated on demand
    r.index++;
    if (r.index >= r.count || (r.timed && r.timeLeft <= 0)) {
      finish();
      return;
    }
    render();
  }

  function finish() {
    if (!r) return;
    const onComplete = r.onComplete;
    const results = {
      op: r.op, count: r.index, score: r.score,
      level: r.level, timed: r.timed, adaptive: r.adaptive
    };
    if (r.timerId) clearInterval(r.timerId);
    r = null;
    // Record before rendering so record functions can attach extra info
    // (e.g. high scores) that the results screen displays.
    if (onComplete) onComplete(results);
    if (results.newBadges && results.newBadges.length) Mates.sound.play('badge');
    Mates.state.lastResults = results;
    Mates.router.go('results');
  }

  /** Quit the current round without recording. */
  function quit() {
    if (!r) return;
    const dest = r.returnScreen || 'home';
    if (r.timerId) clearInterval(r.timerId);
    r = null;
    Mates.router.go(dest);
  }

  function active() { return r !== null; }

  /** Read-only view for the round screen renderer and tests. */
  function peek() {
    if (!r) return null;
    return {
      op: r.op, level: r.level, index: r.index, count: r.count,
      score: r.score, input: r.input, locked: r.locked,
      timed: r.timed, adaptive: r.adaptive, timeLeft: r.timeLeft,
      feedback: r.feedback, question: currentQuestion()
    };
  }

  function render() { Mates.router.refresh(); }

  /* ---------- Round screen ---------- */
  Mates.screens.round = function () {
    const s = peek();
    if (!s) { Mates.router.go('home'); return ''; }

    const center = s.timed
      ? '⏱ ' + s.timeLeft
      : (s.index + 1) + ' / ' + s.count;

    /* Subtle current-level indicator, adaptive rounds only. */
    const levelChip = s.adaptive
      ? '<div class="level-chip">' + Mates.t('round.level', { n: s.level }) + '</div>'
      : '';

    let keypad = '';
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (d) {
      keypad += '<button class="key" data-action="keypad" data-key="' + d + '">' + d + '</button>';
    });
    keypad += '<button class="key key-fn" data-action="keypad" data-key="back">⌫</button>' +
              '<button class="key" data-action="keypad" data-key="0">0</button>' +
              '<button class="key key-go" data-action="keypad" data-key="enter">✓</button>';

    const feedback = s.feedback
      ? '<div class="round-feedback ' + (s.feedback.type === 'ok' ? 'fb-ok' : 'fb-no') + '">' +
        Mates.esc(s.feedback.text) + '</div>'
      : '<div class="round-feedback"></div>';

    return '' +
      '<header class="header">' +
        '<button class="icon-btn" data-action="roundQuit" aria-label="' + Mates.t('common.cancel') + '">✕</button>' +
        '<h1 class="title round-center" id="roundTimer">' + center + '</h1>' +
        (s.timed ? '<span class="score-chip" id="roundScore">' + s.score + '</span>' : '<span></span>') +
      '</header>' +

      '<div class="card round-card">' +
        levelChip +
        '<div class="round-question">' + s.question.a + ' ' + s.question.op + ' ' +
          s.question.b + ' = ?</div>' +
        '<div class="round-answer">' + (s.input || '&nbsp;') + '</div>' +
        feedback +
      '</div>' +

      '<div class="keypad">' + keypad + '</div>';
  };

  /* ---------- Results screen (shared by all modes) ---------- */
  Mates.screens.results = function () {
    const res = Mates.state.lastResults;
    if (!res) { Mates.router.go('home'); return ''; }

    let extra = '';
    if (res.adaptive) {
      extra += '<p class="results-extra">' + Mates.t('results.levelReached', { n: res.level }) + '</p>';
    }
    if (res.timed) {
      extra += '<p class="results-extra">' + Mates.t('results.answered', { n: res.count }) + '</p>';
      if (res.highScore) {
        extra += res.highScore.isNew
          ? '<p class="results-record">🏆 ' + Mates.t('results.newRecord') + '</p>'
          : '<p class="results-extra">' + Mates.t('results.best', { n: res.highScore.best }) + '</p>';
      }
    }
    if (res.newBadges && res.newBadges.length) {
      extra += '<p class="results-record">🎖 ' + Mates.t('results.newBadges') + '</p>' +
        '<div class="badges-earned">' + res.newBadges.map(function (id) {
          const b = Mates.badges.byId(id);
          return '<span class="badge-earned" title="' + Mates.esc(Mates.t(b.descKey)) + '">' +
            b.icon + ' ' + Mates.t(b.nameKey) + '</span>';
        }).join('') + '</div>';
    }

    const scoreLine = res.timed ? String(res.score) : res.score + ' / ' + res.count;

    return '' +
      '<header class="header"><span></span>' +
        '<h1 class="title">' + Mates.t('results.title') + '</h1><span></span></header>' +
      '<div class="card empty-state">' +
        '<div class="results-score">' + scoreLine + '</div>' +
        '<p class="results-points">' + Mates.t('results.points', { n: res.score * 10 }) + '</p>' +
        extra +
      '</div>' +
      '<button class="btn btn-primary" data-action="resultsContinue">' +
        Mates.t('results.continue') + '</button>';
  };

  /* ---------- Actions + keyboard ---------- */
  Mates.actions.keypad = function (el) { keypad(el.dataset.key); };

  Mates.actions.roundQuit = function () {
    if (!active()) return;
    if (!window.confirm(Mates.t('round.quit.confirm'))) return;
    quit();
  };

  Mates.actions.resultsContinue = function () {
    Mates.state.lastResults = null;
    Mates.router.go('home');
  };

  /* Physical keyboard support while the round screen is up. */
  document.addEventListener('keydown', function (e) {
    if (!active() || Mates.state.screen !== 'round') return;
    if (e.key >= '0' && e.key <= '9') {
      keypad(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      keypad('back');
    } else if (e.key === 'Enter') {
      keypad('enter');
    }
  });

  return { start: start, keypad: keypad, tick: tick, quit: quit, active: active, peek: peek };
})();
