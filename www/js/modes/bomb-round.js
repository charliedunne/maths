/* Mates — Approximation Bomb Race ("Bomba de Redondeo"): a winding path of
 * 10 quests of progressive difficulty, from single digits rounded to the ten
 * up to a full mix of 3- and 4-digit numbers (see ROUND_QUEST_LEVELS in
 * js/questions.js). Each quest is won by answering its ten rounding questions
 * before the countdown (per-profile bombTime, default 60 s) hits zero.
 * Attempting a quest — pass or fail — unlocks the next one; every unlocked
 * quest stays tappable for retries and replays. */
window.Mates = window.Mates || {};
Mates.screens = Mates.screens || {};
Mates.actions = Mates.actions || {};
Mates.modes = Mates.modes || {};

/** Approximation Bomb Race quest model: 10 quests in a fixed sequence. */
Mates.bombRoundQuest = (function () {
  const TOTAL = 10;

  /** Short map-node labels: digit width and rounding target per quest. */
  const LABELS = [
    { d: '1', t: '→ 10' },    // single digits -> ten
    { d: '2', t: '→ 10' },    // two digits -> ten
    { d: '3', t: '→ 10' },    // three digits -> ten
    { d: '3', t: '→ 100' },   // three digits -> hundred
    { d: '4', t: '→ 100' },   // four digits -> hundred
    { d: '4', t: '→ 1000' },  // four digits -> thousand
    { d: '3', t: 'mix' },     // mixed three digits
    { d: '4', t: 'mix' },     // mixed four digits
    { d: '2-4', t: 'mix' },   // full mix
    { d: '3-4', t: 'mix' }    // expert mix (3- and 4-digit only)
  ];

  /** Quest metadata: its map-node labels. */
  function info(id) {
    return LABELS[id - 1];
  }

  /** The ten (random, unique) rounding questions of a quest. */
  function questions(id) {
    return Mates.questions.roundQuestQuestions(id);
  }

  return { TOTAL: TOTAL, info: info, questions: questions };
})();

/* Note: helper names must stay unique across mode scripts — top-level
 * function declarations are global bindings in classic scripts, so a
 * same-named helper in another file (e.g. bomb.js) would shadow this one. */

/** The active profile's Approximation Bomb Race state. */
function roundRace() {
  return Mates.profileData.get(Mates.state.profileId).bombRound;
}

/** Map node state: 'done' | 'next' | 'failed' | 'locked'. */
function roundNodeState(id) {
  const r = roundRace();
  if (r.completed.indexOf(id) !== -1) return 'done';
  if (id > r.frontier + 1) return 'locked';
  if (id === r.frontier + 1) return 'next';
  return 'failed'; // ≤ frontier but not completed: attempted and failed
}

/* ---------- Mode card ---------- */
Mates.modes.bombRound = {
  nameKey: 'home.mode.bombRound',
  icon: '🧨',
  enter: function () { Mates.router.go('bombRoundMap'); }
};

/** Start a quest as a timed round of its ten rounding questions. */
function startBombRoundQuest(questId) {
  const q = Math.min(Mates.bombRoundQuest.TOTAL, Math.max(1, Math.round(Number(questId))));
  Mates.round.start({
    op: 'round', // corrects count toward the rounding stats
    level: 1,    // fixed quest difficulty; also keeps speed-demon out of reach
    count: 10,
    bomb: { quest: q, time: Mates.bombTime.get(Mates.state.profileId), questions: Mates.bombRoundQuest.questions(q) },
    returnScreen: 'bombRoundMap',
    onComplete: recordBombRoundQuest
  });
}

/** Post-quest bookkeeping: shared progress, frontier unlock, first-clear bonus. */
function recordBombRoundQuest(res) {
  Mates.progress.record(res); // stats, points (score×10), streak, badges
  // Re-read AFTER the shared save so the bonus lands on fresh data.
  const d = Mates.profileData.get(Mates.state.profileId);
  const quest = res.bomb.quest;
  // Attempting a quest always unlocks the next one, pass or fail.
  d.bombRound.frontier = Math.max(d.bombRound.frontier, quest);
  if (res.success && d.bombRound.completed.indexOf(quest) === -1) {
    d.bombRound.completed.push(quest);
    d.points += 50; // first-clear bonus; replays earn no bonus
    res.bonus = 50;
  }
  Mates.profileData.save(Mates.state.profileId, d);
  res.returnScreen = 'bombRoundMap';
  if (!res.success) {
    res.retry = function () { startBombRoundQuest(quest); };
  }
}

/* ---------- Map screen ---------- */
Mates.screens.bombRoundMap = function () {
  const p = Mates.profiles.get(Mates.state.profileId);
  if (!p) { Mates.router.go('profiles'); return ''; }
  const d = Mates.profileData.get(p.id);

  /** One node button with its state class and corner icon. */
  function node(id) {
    const st = roundNodeState(id);
    const info = Mates.bombRoundQuest.info(id);
    const icon = st === 'done' ? '✓' : st === 'failed' ? '💥' : st === 'locked' ? '🔒' : '';
    return '<button class="bomb-node bomb-node--' + st + '"' +
      (st === 'locked' ? ' disabled' : '') +
      ' data-action="bombRoundNode" data-quest="' + id + '">' +
      '<span class="bomb-node-label">' + info.d + '</span>' +
      '<span class="bomb-node-sub">' + info.t + '</span>' +
      (icon ? '<span class="bomb-node-icon">' + icon + '</span>' : '') +
      '</button>';
  }

  /** One boustrophedon row of five nodes with dashed links between them. */
  function row(ids) {
    let html = '<div class="bomb-row">';
    ids.forEach(function (id, i) {
      if (i > 0) html += '<div class="bomb-link"></div>';
      html += node(id);
    });
    return html + '</div>';
  }

  const done = d.bombRound.completed.length;
  const allDone = done === Mates.bombRoundQuest.TOTAL;

  return '' +
    '<header class="header">' +
      '<button class="icon-btn" data-action="bombRoundBack" aria-label="' + Mates.t('common.back') + '">←</button>' +
      '<h1 class="title">' + Mates.t('bombRound.title') + '</h1>' +
      '<span class="score-chip">' + done + ' / ' + Mates.bombRoundQuest.TOTAL + '</span>' +
    '</header>' +
    '<p class="bomb-hint">' + Mates.t('bombRound.hint') + '</p>' +
    '<div class="card bomb-map">' +
      row([1, 2, 3, 4, 5]) +
      '<div class="bomb-turn bomb-turn--right"><span class="bomb-vlink"></span></div>' +
      row([10, 9, 8, 7, 6]) +
    '</div>' +
    (allDone ? '<p class="bomb-alldone">🏁 ' + Mates.t('bombRound.allDone') + '</p>' : '');
};

Mates.actions.bombRoundBack = function () {
  Mates.router.go('home');
};

/** Tap a map node: start, retry or replay that quest (locked nodes ignore). */
Mates.actions.bombRoundNode = function (el) {
  const id = Number(el.dataset.quest);
  if (!id || id > Mates.bombRoundQuest.TOTAL) return;
  if (roundNodeState(id) === 'locked') return;
  startBombRoundQuest(id);
};
