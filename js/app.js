/* Mates — app shell: boot, screen router, actions.
 * Screens are render functions returning HTML strings; the
 * router swaps #app content. All clicks go through one
 * delegated listener on [data-action] elements. */
window.Mates = window.Mates || {};

Mates.state = {
  screen: 'profiles',
  profileId: null // active profile (set in Step 2)
};

/** Action handlers, keyed by the data-action attribute. */
Mates.actions = {};

const appEl = document.getElementById('app');

Mates.router = {
  /** Navigate to a named screen and render it. */
  go: function (name) {
    Mates.state.screen = name;
    this.refresh();
  },

  /** Re-render the current screen (used after language/theme changes). */
  refresh: function () {
    const render = Mates.screens[Mates.state.screen];
    appEl.innerHTML = '<div class="screen">' + (render ? render() : '') + '</div>';
    document.documentElement.lang = Mates.settings.language;
    window.scrollTo(0, 0);
  }
};

/* ---------- Screens ---------- */
Mates.screens = {

  /** Profile selection. The profile grid and avatar builder land in Step 2. */
  profiles: function () {
    return '' +
      '<header class="header">' +
        '<span></span>' +
        '<h1 class="title">' + Mates.t('app.name') + '</h1>' +
        '<button class="icon-btn" data-action="openSettings" aria-label="' +
          Mates.t('common.settings') + '">⚙️</button>' +
      '</header>' +
      '<h2 class="subtitle">' + Mates.t('profiles.title') + '</h2>' +
      '<div class="card empty-state">' +
        '<p>' + Mates.t('profiles.empty') + '</p>' +
      '</div>';
  },

  /** Settings: language, theme and sound. */
  settings: function () {
    const lang = Mates.settings.language;
    const theme = Mates.settings.theme;
    const segBtn = function (action, value, label, active) {
      return '<button data-action="' + action + '" data-value="' + value + '"' +
        (active ? ' class="active" aria-pressed="true"' : ' aria-pressed="false"') + '>' +
        label + '</button>';
    };

    return '' +
      '<header class="header">' +
        '<button class="icon-btn" data-action="backToProfiles" aria-label="' +
          Mates.t('common.back') + '">←</button>' +
        '<h1 class="title">' + Mates.t('settings.title') + '</h1>' +
        '<span></span>' +
      '</header>' +

      '<div class="card settings-group">' +
        '<div class="setting-label">' + Mates.t('settings.language') + '</div>' +
        '<div class="seg" role="group">' +
          segBtn('setLanguage', 'en', 'English', lang === 'en') +
          segBtn('setLanguage', 'es', 'Español', lang === 'es') +
        '</div>' +
      '</div>' +

      '<div class="card settings-group">' +
        '<div class="setting-label">' + Mates.t('settings.theme') + '</div>' +
        '<div class="seg" role="group">' +
          segBtn('setTheme', 'light', Mates.t('settings.theme.light'), theme === 'light') +
          segBtn('setTheme', 'dark', Mates.t('settings.theme.dark'), theme === 'dark') +
          segBtn('setTheme', 'system', Mates.t('settings.theme.system'), theme === 'system') +
        '</div>' +
      '</div>' +

      '<div class="card settings-row">' +
        '<div class="setting-label">' + Mates.t('settings.sound') + '</div>' +
        '<button class="toggle" data-action="toggleSound" aria-pressed="' +
          (Mates.settings.sound ? 'true' : 'false') + '" aria-label="' +
          Mates.t('settings.sound') + '"><span class="knob"></span></button>' +
      '</div>';
  }
};

/* ---------- Actions ---------- */
Mates.actions.openSettings = function () {
  Mates.router.go('settings');
};

Mates.actions.backToProfiles = function () {
  Mates.router.go('profiles');
};

Mates.actions.setLanguage = function (el) {
  Mates.saveSettings({ language: el.dataset.value });
};

Mates.actions.setTheme = function (el) {
  Mates.saveSettings({ theme: el.dataset.value });
};

Mates.actions.toggleSound = function () {
  Mates.saveSettings({ sound: !Mates.settings.sound });
};

/* ---------- Click delegation ---------- */
appEl.addEventListener('click', function (e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const handler = Mates.actions[el.dataset.action];
  if (handler) handler(el, e);
});

/* ---------- Boot ---------- */
function boot() {
  Mates.loadSettings();
  Mates.applyTheme();
  Mates.router.go('profiles');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
