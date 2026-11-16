/* Mates — shared practice-round engine.
 * Used by all modes: level (fixed), adaptive, timed and Bomb Race.
 * cfg = { op, level, count, timed?, adaptive?, bomb?, returnScreen, onComplete(results) }
 * bomb = { quest, time }: a fixed list of ten questions with one countdown
 * for the whole quest (see js/modes/bomb.js).
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

  /** Dedup key; rounding questions use their non-binary shape. */
  function keyOf(q) {
    return q.value !== undefined ? q.value + q.op + q.target : q.a + q.op + q.b;
  }

  /** Display text for a question; rounding uses "347 ≈ ?". */
  function questionText(q) {
    return q.value !== undefined ? q.value + ' ' + q.op + ' ?' : q.a + ' ' + q.op + ' ' + q.b + ' = ?';
  }

  /** Instruction line above a rounding question, per target. */
  const ROUND_HINTS = {
    ten: 'round.instruction.ten',
    hundred: 'round.instruction.hundred',
    thousand: 'round.instruction.thousand'
  };
  function questionHint(q) {
    return q.value !== undefined ? Mates.t(ROUND_HINTS[q.target]) : '';
  }

  /** Start a round and show the round screen. */
  function start(cfg) {
    const bomb = cfg.bomb || null; // { quest, time } — Bomb Race quest
    r = {
      op: cfg.op,
      level: Math.min(5, Math.max(1, cfg.level || 1)),
      count: cfg.count || 10,
      timed: !!cfg.timed || !!bomb,
      adaptive: !!cfg.adaptive,
      bomb: bomb,
      returnScreen: cfg.returnScreen || 'home',
      onComplete: cfg.onComplete || null,
      index: 0,
      score: 0,
      input: '',
      locked: false,
      feedback: null, // { type: 'ok'|'no', text }
      streakCorrect: 0,
      streakWrong: 0,
      goal: cfg.goal || null, // { target, time } for the goal-based challenge
      success: false,
      elapsed: 0,             // seconds used to reach the goal (on success)
      timeLeft: bomb ? bomb.time : (cfg.timed ? (cfg.goal ? cfg.goal.time : 60) : 0),
      timerId: null,
      // Timed rounds run until the clock hits 0: no fixed count, questions
      // are generated on demand (also required for "mixed" operation).
      // Bomb Race runs a fixed list of ten questions with one countdown.
      count: bomb ? 10 : (cfg.timed ? Infinity : (cfg.count || 10)),
      questions: bomb ? Mates.bombQuest.questions(bomb.quest)
        : ((cfg.adaptive || cfg.timed) ? null
          : Mates.questions.generateRound(cfg.op, cfg.level, cfg.count)),
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
    else patchTimer();
  }

  /* The round screen is rendered once on entry; every later update patches
   *  the existing nodes in place. A full innerHTML swap per tick or keypress
   *  replaces all DOM nodes and makes the screen visibly flicker. */

  /** Clock icon: a bomb for Bomb Race quests, a stopwatch otherwise. */
  function clockIcon() { return r.bomb ? '💣' : '⏱'; }

  /** Update the countdown text in place. */
  function patchTimer() {
    const el = document.getElementById('roundTimer');
    if (el) el.textContent = clockIcon() + ' ' + r.timeLeft;
  }

  /** Update only the answer display in place (digit / backspace presses). */
  function patchAnswer() {
    const el = document.getElementById('roundAnswer');
    if (el) el.innerHTML = r.input || '&nbsp;';
  }

  /** Brief ✓/✗ pop over the round card (timed mode only). The class is
   *  reset and re-added with a forced reflow so rapid consecutive answers
   *  re-trigger the animation. */
  function flash(ok) {
    const el = document.getElementById('roundFlash');
    if (!el) return;
    el.textContent = ok ? '✓' : '✗';
    el.className = 'round-flash';
    void el.offsetWidth; // force reflow so the animation restarts
    el.className = 'round-flash ' + (ok ? 'flash-ok' : 'flash-no');
  }

  /** Update every dynamic part of the round screen in place after an
   *  answer or advance. */
  function patchRound() {
    const timer = document.getElementById('roundTimer');
    if (timer) timer.textContent = r.timed ? clockIcon() + ' ' + r.timeLeft : (r.index + 1) + ' / ' + r.count;
    const score = document.getElementById('roundScore');
    // Goal-based challenges show progress toward the target, e.g. "3 / 8".
    if (score) score.textContent = r.goal ? r.score + ' / ' + r.goal.target : String(r.score);
    const chip = document.getElementById('roundLevelChip');
    if (chip) chip.textContent = Mates.t('round.level', { n: r.level });
    const q = currentQuestion();
    const question = document.getElementById('roundQuestion');
    if (question && q) question.textContent = questionText(q);
    // Rounding questions carry an instruction line; other ops have none.
    const hint = document.getElementById('roundHint');
    if (hint && q) hint.textContent = questionHint(q);
    patchAnswer();
    const fb = document.getElementById('roundFeedback');
    if (fb) {
      if (r.feedback) {
        fb.className = 'round-feedback ' + (r.feedback.type === 'ok' ? 'fb-ok' : 'fb-no');
        fb.textContent = r.feedback.text;
      } else {
        fb.className = 'round-feedback';
        fb.textContent = '';
      }
    }
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
    patchAnswer();
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
      if (r.goal && correct && r.score >= r.goal.target) {
        // Goal reached: end the challenge early with the elapsed time.
        r.success = true;
        r.elapsed = r.goal.time - r.timeLeft;
        finish();
        return;
      }
      // Straight to the next question (no delay); a quick ✓/✗ pop over the
      // card shows whether the answer was right without slowing the pace.
      flash(correct);
      advance();
      return;
    }

    r.locked = true;
    r.feedback = correct ? { type: 'ok', text: praiseText() }
      : { type: 'no', text: Mates.t('feedback.wrong', { n: q.answer }) };
    patchRound();
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
      // Bomb Race: success means all ten questions were answered in time.
      if (r.bomb) r.success = r.index >= r.count;
      finish();
      return;
    }
    patchRound();
  }

  function finish() {
    if (!r) return;
    const onComplete = r.onComplete;
    const results = {
      op: r.op, count: r.index, total: r.count, score: r.score,
      level: r.level, timed: r.timed, adaptive: r.adaptive,
      bomb: r.bomb || null,
      goal: r.goal || null,
      success: !!r.success,
      // Seconds used: the finish time on success, the full limit otherwise.
      elapsed: r.bomb ? (r.success ? r.bomb.time - r.timeLeft : r.bomb.time)
        : (r.goal ? (r.success ? r.elapsed : r.goal.time) : null)
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
      bomb: r.bomb || null,
      goal: r.goal,
      feedback: r.feedback, question: currentQuestion()
    };
  }

  function render() { Mates.router.refresh(); }

  /* ---------- Round screen ---------- */
  Mates.screens.round = function () {
    const s = peek();
    if (!s) { Mates.router.go('home'); return ''; }

    const center = s.timed
      ? (s.bomb ? '💣' : '⏱ ') + s.timeLeft
      : (s.index + 1) + ' / ' + s.count;

    /* Subtle current-level indicator, adaptive rounds only. */
    const levelChip = s.adaptive
      ? '<div class="level-chip" id="roundLevelChip">' + Mates.t('round.level', { n: s.level }) + '</div>'
      : '';

    let keypad = '';
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (d) {
      keypad += '<button class="key" data-action="keypad" data-key="' + d + '">' + d + '</button>';
    });
    keypad += '<button class="key key-fn" data-action="keypad" data-key="back">⌫</button>' +
              '<button class="key" data-action="keypad" data-key="0">0</button>' +
              '<button class="key key-go" data-action="keypad" data-key="enter">✓</button>';

    const feedback = s.feedback
      ? '<div class="round-feedback ' + (s.feedback.type === 'ok' ? 'fb-ok' : 'fb-no') + '" id="roundFeedback">' +
        Mates.esc(s.feedback.text) + '</div>'
      : '<div class="round-feedback" id="roundFeedback"></div>';

    return '' +
      '<header class="header">' +
        '<button class="icon-btn" data-action="roundQuit" aria-label="' + Mates.t('common.cancel') + '">✕</button>' +
        '<h1 class="title round-center" id="roundTimer">' + center + '</h1>' +
        (s.timed ? '<span class="score-chip" id="roundScore">' +
          (s.goal ? s.score + ' / ' + s.goal.target : s.score) + '</span>' : '<span></span>') +
      '</header>' +

      '<div class="card round-card">' +
        levelChip +
        (s.question.value !== undefined
          ? '<div class="round-hint" id="roundHint">' + Mates.esc(questionHint(s.question)) + '</div>'
          : '') +
        '<div class="round-question" id="roundQuestion">' + questionText(s.question) + '</div>' +
        '<div class="round-answer" id="roundAnswer">' + (s.input || '&nbsp;') + '</div>' +
        feedback +
        '<div class="round-flash" id="roundFlash"></div>' +
      '</div>' +

      '<div class="keypad">' + keypad + '</div>';
  };

  /* ---------- Results screen (shared by all modes) ---------- */
  Mates.screens.results = function () {
    const res = Mates.state.lastResults;
    if (!res) { Mates.router.go('home'); return ''; }

    let banner = '';
    let extra = '';
    if (res.adaptive) {
      extra += '<p class="results-extra">' + Mates.t('results.levelReached', { n: res.level }) + '</p>';
    }
    if (res.bomb) {
      // Bomb Race quest: celebrate the escape or mourn the explosion.
      if (res.success) {
        banner = '<div class="results-banner results-banner-win">' +
          '<div class="results-banner-title">🎉 ' + Mates.t('results.success') + '</div>' +
          '<p class="results-extra">' + Mates.t('results.successTime', { n: res.elapsed }) + '</p></div>';
      } else {
        banner = '<div class="results-banner results-banner-lose">' +
          '<div class="results-banner-title">' +
          Mates.t('bomb.fail', { got: res.score }) + '</div></div>';
      }
    } else if (res.timed && res.goal) {
      // Goal-based challenge: celebrate a success or encourage a retry.
      if (res.success) {
        banner = '<div class="results-banner results-banner-win">' +
          '<div class="results-banner-title">🎉 ' + Mates.t('results.success') + '</div>' +
          '<p class="results-extra">' + Mates.t('results.successTime', { n: res.elapsed }) + '</p></div>';
        if (res.highScore) {
          extra += '<p class="' + (res.highScore.isNew ? 'results-record' : 'results-extra') + '">' +
            (res.highScore.isNew ? '🏆 ' : '') +
            Mates.t('results.bestTime', { n: res.highScore.best }) + '</p>';
        }
      } else {
        banner = '<div class="results-banner results-banner-lose">' +
          '<div class="results-banner-title">💪 ' +
          Mates.t('results.fail', { got: res.score, target: res.goal.target }) + '</div></div>';
      }
    } else if (res.timed) {
      // Legacy timed rounds without a goal: answered count + old record line.
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

    /* Bomb quests show "got X of the ten"; other modes count answered. */
    const scoreLine = res.timed && !res.bomb
      ? (res.goal ? res.score + ' / ' + res.goal.target : String(res.score))
      : res.score + ' / ' + (res.bomb ? res.total : res.count);
    const points = res.score * 10 + (res.bonus || 0);
    // "Try again" restarts the same challenge or quest; only offered after a failure.
    const retryBtn = (((res.timed && res.goal) || res.bomb) && !res.success && res.retry)
      ? '<button class="btn btn-primary" data-action="resultsRetry">' +
          Mates.t('results.retry') + '</button>' +
        '<button class="btn btn-ghost" data-action="resultsContinue">' +
          Mates.t('results.continue') + '</button>'
      : '';

    return '' +
      '<header class="header"><span></span>' +
        '<h1 class="title">' + Mates.t('results.title') + '</h1><span></span></header>' +
      '<div class="card empty-state">' +
        banner +
        '<div class="results-score">' + scoreLine + '</div>' +
        '<p class="results-points">' + Mates.t('results.points', { n: points }) + '</p>' +
        (res.bonus ? '<p class="results-extra">🎁 ' +
          Mates.t('results.bonus', { n: res.bonus }) + '</p>' : '') +
        extra +
      '</div>' +
      (retryBtn || '<button class="btn btn-primary" data-action="resultsContinue">' +
        Mates.t('results.continue') + '</button>');
  };

  /* ---------- Actions + keyboard ---------- */
  Mates.actions.keypad = function (el) { keypad(el.dataset.key); };

  Mates.actions.roundQuit = function () {
    if (!active()) return;
    if (!window.confirm(Mates.t('round.quit.confirm'))) return;
    quit();
  };

  Mates.actions.resultsContinue = function () {
    // Modes can send the player back somewhere other than home (e.g. the
    // Bomb Race map) by setting returnScreen on the results record.
    const dest = Mates.state.lastResults ? Mates.state.lastResults.returnScreen : null;
    Mates.state.lastResults = null;
    Mates.router.go(dest || 'home');
  };

  /** "Try again": restart the same goal-based challenge after a failure. */
  Mates.actions.resultsRetry = function () {
    const res = Mates.state.lastResults;
    if (!res || !res.retry) return;
    Mates.state.lastResults = null;
    res.retry();
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
