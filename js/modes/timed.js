/* Mates — Timed challenge: answer as many questions as you can
 * in 60 seconds. Pick one operation at a fixed level, or "mixed"
 * (all four operations at level 2). High scores are kept per
 * profile and mode key, e.g. 'timed.mul.3' or 'timed.mixed'. */
window.Mates = window.Mates || {};
Mates.screens = Mates.screens || {};
Mates.actions = Mates.actions || {};
Mates.modes = Mates.modes || {};

Mates.modes.timed = {
  nameKey: 'home.mode.timed',
  icon: '⏱',
  enter: function () { Mates.router.go('timedSetup'); }
};

/** High-score key for a timed round result. */
function highScoreKey(res) {
  return res.op === 'mixed' ? 'timed.mixed' : 'timed.' + res.op + '.' + res.level;
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

Mates.actions.timedStart = function () {
  const s = Mates.state.timedSel || { op: 'add', level: 1 };
  const mixed = s.op === 'mixed';
  Mates.round.start({
    op: s.op,
    level: mixed ? 2 : s.level, // mixed uses a fixed mid difficulty
    timed: true,
    returnScreen: 'timedSetup',
    onComplete: recordTimedRound
  });
};

/* Record points (+ per-op stats for single-operation rounds) and update
 * the high score. Attaches res.highScore = { best, isNew } for the
 * results screen. */
function recordTimedRound(res) {
  const id = Mates.state.profileId;
  if (!id) return;
  const d = Mates.profileData.get(id);

  if (res.op !== 'mixed') {
    d.stats[res.op].answered += res.count;
    d.stats[res.op].correct += res.score;
  }
  d.points += res.score * 10;

  const key = highScoreKey(res);
  const prev = d.highScores[key] || 0;
  res.highScore = { best: Math.max(prev, res.score), isNew: res.score > prev };
  if (res.score > prev) d.highScores[key] = res.score;

  Mates.profileData.save(id, d);
}
