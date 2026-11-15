/* Mates — Goal-based timed challenge: reach N correct answers within T
 * seconds. The goal is per-profile and editable in profile settings
 * (⚙ on a profile card). Pick one operation at a fixed level, or "mixed"
 * (all four operations at level 2). The fastest time to reach the goal is
 * kept per profile and mode key, e.g. 'mul.3' or 'mixed'. */
window.Mates = window.Mates || {};
Mates.screens = Mates.screens || {};
Mates.actions = Mates.actions || {};
Mates.modes = Mates.modes || {};

Mates.modes.timed = {
  nameKey: 'home.mode.timed',
  icon: '⏱',
  enter: function () { Mates.router.go('timedSetup'); }
};

/** Best-time record key for a timed round: 'mixed' or '<op>.<level>'. */
function bestKey(op, level) {
  return op === 'mixed' ? 'mixed' : op + '.' + level;
}

/* ---------- Setup screen ---------- */
Mates.screens.timedSetup = function () {
  const sel = Mates.state.timedSel || { op: 'add', level: 1 };
  const mixed = sel.op === 'mixed';

  let ops = '';
  Mates.questions.OPS.forEach(function (op) {
    ops += '<button class="opt-btn op-btn' + (sel.op === op ? ' active' : '') + '"' +
      ' data-action="timedSetOp" data-op="' + op + '" aria-label="' + op + '">' +
      Mates.questions.SYMBOLS[op] + '</button>';
  });
  ops += '<button class="opt-btn op-btn' + (mixed ? ' active' : '') + '"' +
    ' data-action="timedSetOp" data-op="mixed" aria-label="' + Mates.t('timed.mixed') + '">🔀</button>';

  let levels = '';
  for (let i = 1; i <= 5; i++) {
    levels += '<button class="opt-btn level-btn' + (sel.level === i ? ' active' : '') + '"' +
      ' data-action="timedSetLevel" data-value="' + i + '">' + i + '</button>';
  }

  // The profile's goal plus the best time already reached for this key.
  const pid = Mates.state.profileId;
  const goal = Mates.timedGoal.get(pid);
  let bestLine = '';
  if (pid) {
    const best = Mates.profileData.get(pid).timedBest[bestKey(sel.op, mixed ? 2 : sel.level)];
    if (best !== undefined) {
      bestLine = '<p class="results-extra">🏆 ' +
        Mates.t('timed.bestTime', { n: best }) + '</p>';
    }
  }

  return '' +
    '<header class="header">' +
      '<button class="icon-btn" data-action="backToHome" aria-label="' +
        Mates.t('common.back') + '">←</button>' +
      '<h1 class="title">' + Mates.t('timed.title') + '</h1>' +
      '<span></span>' +
    '</header>' +

    '<div class="option-row">' +
      '<div class="setting-label">' + Mates.t('level.operation') + '</div>' +
      '<div class="option-options">' + ops + '</div>' +
    '</div>' +

    (mixed ? '' :
      '<div class="option-row">' +
        '<div class="setting-label">' + Mates.t('level.level') + '</div>' +
        '<div class="option-options">' + levels + '</div>' +
      '</div>') +

    '<div class="card settings-group" style="margin-top:16px">' +
      '<p class="results-extra">🎯 ' +
        Mates.t('timed.goalLine', { n: goal.target, t: goal.time }) + '</p>' +
      bestLine +
    '</div>' +

    '<button class="btn btn-primary" data-action="timedStart">' +
      Mates.t('common.start') + '</button>';
};

/* ---------- Actions ---------- */
Mates.actions.timedSetOp = function (el) {
  Mates.state.timedSel = Object.assign({}, Mates.state.timedSel || {}, { op: el.dataset.op });
  Mates.router.refresh();
};

Mates.actions.timedSetLevel = function (el) {
  if ((Mates.state.timedSel || {}).op === 'mixed') return; // level picker hidden for mixed
  Mates.state.timedSel = Object.assign({}, Mates.state.timedSel || {}, { level: Number(el.dataset.value) });
  Mates.router.refresh();
};

/** Start a goal-based challenge for the current selection. Shared by the
 *  setup screen's Start button and the results "Try again" button. */
function startTimedChallenge() {
  const s = Mates.state.timedSel || { op: 'add', level: 1 };
  const mixed = s.op === 'mixed';
  Mates.round.start({
    op: s.op,
    level: mixed ? 2 : s.level, // mixed uses a fixed mid difficulty
    timed: true,
    goal: Mates.timedGoal.get(Mates.state.profileId),
    returnScreen: 'timedSetup',
    onComplete: recordTimedRound
  });
}

Mates.actions.timedStart = startTimedChallenge;

/* Record the round (stats, points, streak, badges) via shared progress,
 * then update the fastest-time record on success. Attaches res.bonus,
 * res.highScore = { best, isNew } and res.retry for the results screen. */
function recordTimedRound(res) {
  const earned = Mates.progress.record(res);
  const id = Mates.state.profileId;
  if (id && res.goal) {
    const d = Mates.profileData.get(id);
    if (res.success) {
      // Bonus points for reaching the goal.
      d.points += 20;
      res.bonus = 20;
      // Fastest-time record (lower is better), keyed by op + level.
      const key = bestKey(res.op, res.level);
      const prev = d.timedBest[key];
      res.highScore = {
        best: res.elapsed,
        isNew: prev === undefined || res.elapsed < prev
      };
      if (res.highScore.isNew) d.timedBest[key] = res.elapsed;
    }
    Mates.profileData.save(id, d);
  }
  res.newBadges = earned;
  res.retry = startTimedChallenge; // "Try again" restarts the same challenge
}
