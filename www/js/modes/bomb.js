/* Mates — Multiplication Bomb Race ("Bomba de Multiplicaciones"): a winding
 * path of 20 quests, two per multiplication table (1–10). Quest 2t-1 runs
 * the ordered pairs t×1…t×10; quest 2t is the same ten pairs in shuffled
 * order. A quest is won by answering all 10 before its countdown (per-profile
 * bombTime, default 60 s) hits zero. Attempting a quest — pass or fail —
 * unlocks the next one; every unlocked quest stays tappable for retries and
 * replays. */
window.Mates = window.Mates || {};
Mates.screens = Mates.screens || {};
Mates.actions = Mates.actions || {};
Mates.modes = Mates.modes || {};

/** Bomb Race quest model: 20 quests in a fixed sequence. */
Mates.bombQuest = (function () {
  const TOTAL = 20;

  /** Quest metadata: its table and whether the order is shuffled. */
  function info(id) {
    return { table: Math.ceil(id / 2), shuffled: id % 2 === 0 };
  }

  /** The ten questions of a quest, ordered or shuffled (Fisher-Yates). */
  function questions(id) {
    const t = info(id).table;
    const qs = [];
    for (let i = 1; i <= 10; i++) {
      qs.push({ a: t, op: '×', b: i, answer: t * i });
    }
    if (info(id).shuffled) {
      for (let i = qs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = qs[i]; qs[i] = qs[j]; qs[j] = tmp;
      }
    }
    return qs;
  }

  return { TOTAL: TOTAL, info: info, questions: questions };
})();

/** The active profile's Bomb Race state. */
function race() {
  return Mates.profileData.get(Mates.state.profileId).bombRace;
}

/** Map node state: 'done' | 'next' | 'failed' | 'locked'. */
function nodeState(id) {
  const r = race();
  if (r.completed.indexOf(id) !== -1) return 'done';
  if (id > r.frontier + 1) return 'locked';
  if (id === r.frontier + 1) return 'next';
  return 'failed'; // ≤ frontier but not completed: attempted and failed
}

/* ---------- Mode card ---------- */
Mates.modes.bomb = {
  nameKey: 'home.mode.bomb',
  icon: '💣',
  enter: function () { Mates.router.go('bombMap'); }
};

/** Start a Bomb Race quest as a timed round of its ten questions. */
function startBombQuest(questId) {
  const q = Math.min(Mates.bombQuest.TOTAL, Math.max(1, Math.round(Number(questId))));
  Mates.round.start({
    op: 'mul', // corrects count toward the multiplication stats
    level: 1,
    count: 10,
    bomb: { quest: q, time: Mates.bombTime.get(Mates.state.profileId) },
    returnScreen: 'bombMap',
    onComplete: recordBombQuest
  });
}

/** Post-quest bookkeeping: shared progress, frontier unlock, first-clear bonus. */
function recordBombQuest(res) {
  Mates.progress.record(res); // stats, points (score×10), streak, badges
  // Re-read AFTER the shared save so the bonus lands on fresh data.
  const d = Mates.profileData.get(Mates.state.profileId);
  const quest = res.bomb.quest;
  // Attempting a quest always unlocks the next one, pass or fail.
  d.bombRace.frontier = Math.max(d.bombRace.frontier, quest);
  if (res.success && d.bombRace.completed.indexOf(quest) === -1) {
    d.bombRace.completed.push(quest);
    d.points += 50; // first-clear bonus; replays earn no bonus
    res.bonus = 50;
  }
  Mates.profileData.save(Mates.state.profileId, d);
  res.returnScreen = 'bombMap';
  if (!res.success) {
    res.retry = function () { startBombQuest(quest); };
  }
}

/* ---------- Map screen ---------- */
Mates.screens.bombMap = function () {
  const p = Mates.profiles.get(Mates.state.profileId);
  if (!p) { Mates.router.go('profiles'); return ''; }
  const d = Mates.profileData.get(p.id);

  /** One node button with its state class and corner icon. */
  function node(id) {
    const st = nodeState(id);
    const info = Mates.bombQuest.info(id);
    const icon = st === 'done' ? '✓' : st === 'failed' ? '💥' : st === 'locked' ? '🔒' : '';
    return '<button class="bomb-node bomb-node--' + st + '"' +
      (st === 'locked' ? ' disabled' : '') +
      ' data-action="bombNode" data-quest="' + id + '">' +
      '<span class="bomb-node-label">×' + info.table + '</span>' +
      (info.shuffled ? '<span class="bomb-node-sub">🔀</span>' : '') +
      (icon ? '<span class="bomb-node-icon">' + icon + '</span>' : '') +
      '</button>';
  }

  /** One boustrophedon row of four nodes with dashed links between them. */
  function row(ids) {
    let html = '<div class="bomb-row">';
    ids.forEach(function (id, i) {
      if (i > 0) html += '<div class="bomb-link"></div>';
      html += node(id);
    });
    return html + '</div>';
  }

  /** Vertical dashed link at the end where the path turns to the next row. */
  function turn(side) {
    return '<div class="bomb-turn bomb-turn--' + side + '"><span class="bomb-vlink"></span></div>';
  }

  const done = d.bombRace.completed.length;
  const allDone = done === Mates.bombQuest.TOTAL;

  return '' +
    '<header class="header">' +
      '<button class="icon-btn" data-action="bombBack" aria-label="' + Mates.t('common.back') + '">←</button>' +
      '<h1 class="title">' + Mates.t('bomb.title') + '</h1>' +
      '<span class="score-chip">' + done + ' / ' + Mates.bombQuest.TOTAL + '</span>' +
    '</header>' +
    '<p class="bomb-hint">' + Mates.t('bomb.hint') + '</p>' +
    '<div class="card bomb-map">' +
      row([1, 2, 3, 4]) + turn('right') +
      row([8, 7, 6, 5]) + turn('left') +
      row([9, 10, 11, 12]) + turn('right') +
      row([16, 15, 14, 13]) + turn('left') +
      row([17, 18, 19, 20]) +
    '</div>' +
    (allDone ? '<p class="bomb-alldone">🏁 ' + Mates.t('bomb.allDone') + '</p>' : '');
};

Mates.actions.bombBack = function () {
  Mates.router.go('home');
};

/** Tap a map node: start, retry or replay that quest (locked nodes ignore). */
Mates.actions.bombNode = function (el) {
  const id = Number(el.dataset.quest);
  if (!id || id > Mates.bombQuest.TOTAL) return;
  if (nodeState(id) === 'locked') return;
  startBombQuest(id);
};
