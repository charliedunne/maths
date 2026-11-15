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
