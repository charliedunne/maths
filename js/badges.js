/* Mates — gamification: badge definitions and shared post-round
 * bookkeeping (per-op stats, points, daily streaks, badges).
 * Every mode's record function funnels through Mates.progress.record(). */
window.Mates = window.Mates || {};

Mates.badges = (function () {
  /** Badge table from the plan. check(d, res) sees the profile data
   * AFTER this round's stats/streak were applied, plus the round result. */
  const DEFS = [
    { id: 'first-steps', icon: '👣', nameKey: 'badge.first-steps.name', descKey: 'badge.first-steps.desc',
      check: function (d, res) { return !!res; } },
    { id: 'sharp-shooter', icon: '🎯', nameKey: 'badge.sharp-shooter.name', descKey: 'badge.sharp-shooter.desc',
      check: function (d, res) { return !!res && !res.timed && !res.adaptive && res.count === 10 && res.score === 10; } },
    { id: 'speed-demon', icon: '⚡', nameKey: 'badge.speed-demon.name', descKey: 'badge.speed-demon.desc',
      check: function (d, res) { return !!res && res.timed && res.score >= 20; } },
    { id: 'table-master', icon: '✖️', nameKey: 'badge.table-master.name', descKey: 'badge.table-master.desc',
      check: function (d) { return d.stats.mul.correct >= 50; } },
    { id: 'divvy-up', icon: '➗', nameKey: 'badge.divvy-up.name', descKey: 'badge.divvy-up.desc',
      check: function (d) { return d.stats.div.correct >= 50; } },
    { id: 'on-fire', icon: '🔥', nameKey: 'badge.on-fire.name', descKey: 'badge.on-fire.desc',
      check: function (d) { return d.currentStreak >= 5; } },
    { id: 'unstoppable', icon: '💫', nameKey: 'badge.unstoppable.name', descKey: 'badge.unstoppable.desc',
      check: function (d) { return d.currentStreak >= 14; } }
  ];

  /** Find a badge definition by id. */
  function byId(id) {
    for (let i = 0; i < DEFS.length; i++) if (DEFS[i].id === id) return DEFS[i];
    return null;
  }

  /** Evaluate all badges against current data; newly earned ones are
   * appended to d.badges. Returns the list of newly earned ids. */
  function checkBadges(d, res) {
    const earned = [];
    DEFS.forEach(function (b) {
      if (d.badges.indexOf(b.id) === -1 && b.check(d, res)) {
        d.badges.push(b.id);
        earned.push(b.id);
      }
    });
    return earned;
  }

  return { DEFS: DEFS, byId: byId, checkBadges: checkBadges };
})();

/* ---------- Shared post-round bookkeeping ---------- */
Mates.progress = {
  /** Local calendar day as 'YYYY-MM-DD' (streaks are calendar-day based). */
  dayKey: function (date) {
    const d = date || new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  },

  /** Streak rules: one completed round per calendar day keeps the streak
   * alive; the next day after a gap restarts it at 1. Mutates data. */
  updateStreak: function (d) {
    const today = this.dayKey();
    if (d.lastPracticeDate === today) return; // already counted today
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    d.currentStreak = (d.lastPracticeDate === this.dayKey(yest)) ? d.currentStreak + 1 : 1;
    d.bestStreak = Math.max(d.bestStreak, d.currentStreak);
    d.lastPracticeDate = today;
  },

  /** Record a finished round for the active profile: per-op stats, points,
   * streak and badges. Returns newly earned badge ids (for celebration). */
  record: function (res) {
    const id = Mates.state.profileId;
    if (!id) return [];
    const d = Mates.profileData.get(id);

    if (res.op !== 'mixed') {
      d.stats[res.op].answered += res.count;
      d.stats[res.op].correct += res.score;
    }
    d.points += res.score * 10;

    this.updateStreak(d);
    const earned = Mates.badges.checkBadges(d, res);
    Mates.profileData.save(id, d);
    return earned;
  }
};
