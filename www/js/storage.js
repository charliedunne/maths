/* Mates — storage helpers and app settings.
 * All persistence is localStorage, JSON-encoded, under the
 * "mates." key namespace. */
window.Mates = window.Mates || {};

Mates.storage = {
  /** Read a JSON value from localStorage. Returns fallback on miss/corruption. */
  get: function (key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? (fallback === undefined ? null : fallback) : JSON.parse(raw);
    } catch (e) {
      console.warn('Mates: failed to read ' + key, e);
      return fallback === undefined ? null : fallback;
    }
  },

  /** Write a JSON value to localStorage. Fails soft on quota errors. */
  set: function (key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Mates: failed to write ' + key, e);
      return false;
    }
  },

  remove: function (key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      /* ignore */
    }
  }
};

/* ---------- Settings ---------- */
const SETTINGS_KEY = 'mates.settings';
const DEFAULT_SETTINGS = { language: null, theme: 'system', sound: true };

/** In-memory settings cache; populated by Mates.loadSettings(). */
Mates.settings = Object.assign({}, DEFAULT_SETTINGS);

/** Load settings from storage; auto-detects language on first run. */
Mates.loadSettings = function () {
  const saved = Mates.storage.get(SETTINGS_KEY, {});
  Mates.settings = Object.assign({}, DEFAULT_SETTINGS, saved);

  if (!Mates.settings.language) {
    const nav = (navigator.language || 'en').toLowerCase();
    Mates.settings.language = nav.indexOf('es') === 0 ? 'es' : 'en';
    Mates.storage.set(SETTINGS_KEY, Mates.settings);
  }
};

/** Merge a patch into settings, persist it and refresh the UI. */
Mates.saveSettings = function (patch) {
  Object.assign(Mates.settings, patch);
  Mates.storage.set(SETTINGS_KEY, Mates.settings);
  if (patch.theme !== undefined) {
    Mates.applyTheme();
  }
  // Language or any other change: re-render the current screen.
  if (window.Mates.router) {
    Mates.router.refresh();
  }
};

/** Apply the effective theme (user choice or system preference). */
Mates.applyTheme = function () {
  let mode = Mates.settings.theme;
  if (mode === 'system') {
    const dark = window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    mode = dark ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', mode);
};

/* ---------- Profiles ---------- */
const PROFILES_KEY = 'mates.profiles';

Mates.profiles = {
  /** All profiles on this device, oldest first. */
  list: function () {
    return Mates.storage.get(PROFILES_KEY, []);
  },

  get: function (id) {
    return this.list().find(function (p) { return p.id === id; }) || null;
  },

  /** Create a profile with a name and avatar config; returns it. */
  create: function (name, avatarConfig) {
    const profiles = this.list();
    const profile = {
      id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: String(name || '').trim(),
      avatar: Object.assign({}, Mates.avatar.DEFAULT, avatarConfig || {}),
      createdAt: new Date().toISOString()
    };
    profiles.push(profile);
    Mates.storage.set(PROFILES_KEY, profiles);
    Mates.profileData.save(profile.id, {}); // initialize data record
    return profile;
  },

  /** Remove a profile and its progress data. */
  remove: function (id) {
    Mates.storage.set(PROFILES_KEY, this.list().filter(function (p) { return p.id !== id; }));
    Mates.storage.remove('mates.profile.' + id);
  }
};

/* ---------- Per-profile progress data ---------- */
const OPS = ['add', 'sub', 'mul', 'div', 'round'];

function profileDataDefaults() {
  const stats = {};
  OPS.forEach(function (op) { stats[op] = { answered: 0, correct: 0 }; });
  return {
    points: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastPracticeDate: null, // 'YYYY-MM-DD' of the last practiced day
    badges: [],
    stats: stats,
    highScores: {},         // legacy count-based timed records (no longer written)
    adaptiveLevel: { add: 2, sub: 2, mul: 2, div: 2, round: 2 },
    timedGoal: { target: 8, time: 45 }, // goal-based challenge: N correct in T seconds
    timedBest: {},           // fastest times (seconds) to reach the goal, keyed like 'mul.3' or 'mixed'
    bombTime: 60,            // Bomb Race countdown per quest (seconds)
    bombRace: { frontier: 0, completed: [] } // attempted quests are always 1..frontier
  };
}

/* ---------- Timed-challenge goal (per profile) ---------- */
Mates.timedGoal = {
  DEFAULTS: { target: 8, time: 45 },
  /** Clamp a goal value into its allowed range (target 1-30, time 10-300 s). */
  clamp: function (field, value) {
    const v = Math.round(Number(value));
    if (!isFinite(v)) return this.DEFAULTS[field];
    if (field === 'target') return Math.min(30, Math.max(1, v));
    if (field === 'time') return Math.min(300, Math.max(10, v));
    return v;
  },
  /** A profile's goal, clamped to limits (safe defaults on missing/corrupt data). */
  get: function (profileId) {
    const g = Mates.profileData.get(profileId || Mates.state.profileId).timedGoal || {};
    return {
      target: this.clamp('target', g.target),
      time: this.clamp('time', g.time)
    };
  }
};

/* ---------- Bomb Race quest time (per profile) ---------- */
Mates.bombTime = {
  DEFAULT: 60, MIN: 20, MAX: 300, STEP: 5,
  /** Clamp a bomb-time value into its allowed range (20–300 s). */
  clamp: function (value) {
    const v = Math.round(Number(value));
    if (!isFinite(v)) return this.DEFAULT;
    return Math.min(this.MAX, Math.max(this.MIN, v));
  },
  /** A profile's bomb time in seconds (safe default on missing/corrupt data). */
  get: function (profileId) {
    const d = Mates.profileData.get(profileId || Mates.state.profileId);
    return this.clamp(d.bombTime);
  }
};

Mates.profileData = {
  /** Load a profile's data with defaults merged in (safe for new profiles). */
  get: function (id) {
    const d = profileDataDefaults();
    const saved = Mates.storage.get('mates.profile.' + id, {});
    Object.assign(d, saved);
    OPS.forEach(function (op) {
      d.stats[op] = Object.assign({ answered: 0, correct: 0 }, (saved.stats || {})[op]);
    });
    d.adaptiveLevel = Object.assign({ add: 2, sub: 2, mul: 2, div: 2, round: 2 }, saved.adaptiveLevel);
    d.timedGoal = Object.assign({ target: 8, time: 45 }, saved.timedGoal);
    d.timedBest = Object.assign({}, saved.timedBest);
    d.bombTime = Mates.bombTime.clamp(saved.bombTime);
    d.bombRace = Object.assign({ frontier: 0, completed: [] }, saved.bombRace);
    // Migration: drop obsolete count-based 'timed.*' high-score keys on read.
    Object.keys(d.highScores).forEach(function (k) {
      if (k.indexOf('timed.') === 0) delete d.highScores[k];
    });
    return d;
  },

  save: function (id, data) {
    Mates.storage.set('mates.profile.' + id, data);
  }
};

/* Follow system theme changes while in "system" mode. */
if (window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemThemeChange = function () {
    if (Mates.settings.theme === 'system') {
      Mates.applyTheme();
    }
  };
  if (mq.addEventListener) {
    mq.addEventListener('change', onSystemThemeChange);
  } else if (mq.addListener) {
    mq.addListener(onSystemThemeChange); // older Safari
  }
}
