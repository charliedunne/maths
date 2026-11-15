/* Mates — Adaptive mode: the difficulty follows the child.
 * Starts from the last reached level (default 2); the shared
 * round engine steps up after 3 consecutive correct answers
 * and down after 2 wrong, clamped to levels 1–5. The reached
 * level is persisted per operation for the next session. */
window.Mates = window.Mates || {};
Mates.screens = Mates.screens || {};
Mates.actions = Mates.actions || {};
Mates.modes = Mates.modes || {};

Mates.modes.adaptive = {
  nameKey: 'home.mode.adaptive',
  icon: '🚀',
  enter: function () { Mates.router.go('adaptiveSetup'); }
};

/* ---------- Setup screen ---------- */
Mates.screens.adaptiveSetup = function () {
  const sel = Mates.state.adaptiveSel || { op: 'add' };

  let ops = '';
  Mates.questions.OPS.forEach(function (op) {
    ops += '<button class="opt-btn op-btn' + (sel.op === op ? ' active' : '') + '"' +
      ' data-action="adaptiveSetOp" data-op="' + op + '" aria-label="' + op + '">' +
      Mates.questions.SYMBOLS[op] + '</button>';
  });

  return '' +
    '<header class="header">' +
      '<button class="icon-btn" data-action="backToHome" aria-label="' +
        Mates.t('common.back') + '">←</button>' +
      '<h1 class="title">' + Mates.t('adaptive.title') + '</h1>' +
      '<span></span>' +
    '</header>' +

    '<div class="option-row">' +
      '<div class="setting-label">' + Mates.t('level.operation') + '</div>' +
      '<div class="option-options">' + ops + '</div>' +
    '</div>' +

    '<button class="btn btn-primary" data-action="adaptiveStart">' +
      Mates.t('common.start') + '</button>';
};

/* ---------- Actions ---------- */
Mates.actions.adaptiveSetOp = function (el) {
  Mates.state.adaptiveSel = Object.assign({}, Mates.state.adaptiveSel || {}, { op: el.dataset.op });
  Mates.router.refresh();
};

Mates.actions.adaptiveStart = function () {
  const s = Mates.state.adaptiveSel || { op: 'add' };
  const d = Mates.profileData.get(Mates.state.profileId);
  const startLevel = (d.adaptiveLevel && d.adaptiveLevel[s.op]) || 2;
  Mates.round.start({
    op: s.op,
    level: startLevel,
    count: 10,
    adaptive: true,
    returnScreen: 'adaptiveSetup',
    onComplete: recordAdaptiveRound
  });
};

/* Record stats + points and persist the reached level for next time. */
function recordAdaptiveRound(res) {
  const id = Mates.state.profileId;
  if (!id) return;
  const d = Mates.profileData.get(id);
  d.stats[res.op].answered += res.count;
  d.stats[res.op].correct += res.score;
  d.points += res.score * 10;
  d.adaptiveLevel[res.op] = res.level;
  Mates.profileData.save(id, d);
}
