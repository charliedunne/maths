/* Mates — Level mode: pick an operation and a fixed level (1–5),
 * then answer a round of 10 questions at that difficulty. */
window.Mates = window.Mates || {};
Mates.screens = Mates.screens || {};
Mates.actions = Mates.actions || {};
Mates.modes = Mates.modes || {};

Mates.modes.level = {
  nameKey: 'home.mode.level',
  icon: '🎯',
  enter: function () { Mates.router.go('levelSetup'); }
};

/* ---------- Setup screen ---------- */
Mates.screens.levelSetup = function () {
  const sel = Mates.state.levelSel || { op: 'add', level: 1 };

  let ops = '';
  Mates.questions.OPS.forEach(function (op) {
    ops += '<button class="opt-btn op-btn' + (sel.op === op ? ' active' : '') + '"' +
      ' data-action="levelSetOp" data-op="' + op + '" aria-label="' + op + '">' +
      Mates.questions.SYMBOLS[op] + '</button>';
  });

  let levels = '';
  for (let i = 1; i <= 5; i++) {
    levels += '<button class="opt-btn level-btn' + (sel.level === i ? ' active' : '') + '"' +
      ' data-action="levelSetLevel" data-value="' + i + '">' + i + '</button>';
  }

  return '' +
    '<header class="header">' +
      '<button class="icon-btn" data-action="backToHome" aria-label="' +
        Mates.t('common.back') + '">←</button>' +
      '<h1 class="title">' + Mates.t('level.title') + '</h1>' +
      '<span></span>' +
    '</header>' +

    '<div class="option-row">' +
      '<div class="setting-label">' + Mates.t('level.operation') + '</div>' +
      '<div class="option-options">' + ops + '</div>' +
    '</div>' +

    '<div class="option-row">' +
      '<div class="setting-label">' + Mates.t('level.level') + '</div>' +
      '<div class="option-options">' + levels + '</div>' +
    '</div>' +

    '<button class="btn btn-primary" data-action="levelStart">' +
      Mates.t('common.start') + '</button>';
};

/* ---------- Actions ---------- */
Mates.actions.levelSetOp = function (el) {
  Mates.state.levelSel = Object.assign({}, Mates.state.levelSel || {}, { op: el.dataset.op });
  Mates.router.refresh();
};

Mates.actions.levelSetLevel = function (el) {
  Mates.state.levelSel = Object.assign({}, Mates.state.levelSel || {}, { level: Number(el.dataset.value) });
  Mates.router.refresh();
};

Mates.actions.backToHome = function () {
  Mates.router.go('home');
};

Mates.actions.levelStart = function () {
  const s = Mates.state.levelSel || { op: 'add', level: 1 };
  Mates.round.start({
    op: s.op,
    level: s.level,
    count: 10,
    returnScreen: 'levelSetup',
    onComplete: recordRound
  });
};

/* Record stats + points for a finished round. Streaks/badges land in Step 6. */
function recordRound(res) {
  const id = Mates.state.profileId;
  if (!id) return;
  const d = Mates.profileData.get(id);
  d.stats[res.op].answered += res.count;
  d.stats[res.op].correct += res.score;
  d.points += res.score * 10;
  Mates.profileData.save(id, d);
}
