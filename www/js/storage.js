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
const OPS = ['add', 'sub', 'mul', 'div'];

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
    highScores: {},         // keyed like 'timed.mul.3' or 'timed.mixed'
    adaptiveLevel: { add: 2, sub: 2, mul: 2, div: 2 }
  };
}

Mates.profileData = {
  /** Load a profile's data with defaults merged in (safe for new profiles). */
  get: function (id) {
    const d = profileDataDefaults();
    const saved = Mates.storage.get('mates.profile.' + id, {});
    Object.assign(d, saved);
    OPS.forEach(function (op) {
      d.stats[op] = Object.assign({ answered: 0, correct: 0 }, (saved.stats || {})[op]);
    });
    d.adaptiveLevel = Object.assign({ add: 2, sub: 2, mul: 2, div: 2 }, saved.adaptiveLevel);
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
