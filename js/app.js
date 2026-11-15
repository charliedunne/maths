/* Mates — app shell: boot, screen router, actions.
 * Screens are render functions returning HTML strings; the
 * router swaps #app content. All clicks go through one
 * delegated listener on [data-action] elements. */
window.Mates = window.Mates || {};

Mates.state = {
  screen: 'profiles',
  profileId: null,        // active profile id (null until one is selected)
  building: null,         // in-progress profile: { name, config }
  levelSel: null,         // level-mode selection: { op, level }
  lastResults: null       // finished round results (shown on results screen)
};

/** Practice modes, registered by js/modes/*.js; home renders them. */
Mates.modes = Mates.modes || {};

/** Escape a string for safe interpolation into HTML. */
Mates.esc = function (s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

/** Action handlers, keyed by the data-action attribute (shared with mode files). */
Mates.actions = Mates.actions || {};

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

/* ---------- Screens (merged with screens registered by mode files) ---------- */
Mates.screens = Object.assign(Mates.screens || {}, {

  /** Profile selection grid. */
  profiles: function () {
    const profiles = Mates.profiles.list();

    let cards = '<div class="profile-grid">';
    profiles.forEach(function (p) {
      cards +=
        '<div class="profile-cell">' +
          '<div class="profile-card" data-action="selectProfile" data-id="' + p.id + '" role="button">' +
            Mates.avatar.render(p.avatar, 96) +
            '<div class="profile-name">' + Mates.esc(p.name) + '</div>' +
          '</div>' +
          '<button class="profile-delete" data-action="deleteProfile" data-id="' + p.id + '" aria-label="' +
            Mates.t('profiles.delete') + '">×</button>' +
        '</div>';
    });
    cards +=
      '<div class="profile-cell">' +
        '<div class="profile-card profile-add" data-action="addProfile" role="button">' +
          '<span class="plus">+</span>' +
          '<div class="profile-name">' + Mates.t('profiles.add') + '</div>' +
        '</div>' +
      '</div></div>';

    const empty = profiles.length === 0
      ? '<div class="card empty-state"><p>' + Mates.t('profiles.empty') + '</p></div>'
      : '';

    return '' +
      '<header class="header">' +
        '<span></span>' +
        '<h1 class="title">' + Mates.t('app.name') + '</h1>' +
        '<button class="icon-btn" data-action="openSettings" aria-label="' +
          Mates.t('common.settings') + '">⚙️</button>' +
      '</header>' +
      '<h2 class="subtitle">' + Mates.t('profiles.title') + '</h2>' +
      empty + cards;
  },

  /** Home for the active profile: greeting + practice-mode menu. */
  home: function () {
    const p = Mates.profiles.get(Mates.state.profileId);
    if (!p) { Mates.router.go('profiles'); return ''; }

    let modes = '';
    Object.keys(Mates.modes).forEach(function (key) {
      const m = Mates.modes[key];
      modes += '<button class="btn btn-primary mode-card" data-action="' + key + 'Enter">' +
        m.icon + '  ' + Mates.t(m.nameKey) + '</button>';
    });

    return '' +
      '<header class="header">' +
        '<button class="icon-btn" data-action="switchUser" aria-label="' +
          Mates.t('home.switchUser') + '">' + Mates.avatar.render(p.avatar, 34) + '</button>' +
        '<h1 class="title">' + Mates.esc(p.name) + '</h1>' +
        '<button class="icon-btn" data-action="openSettings" aria-label="' +
          Mates.t('common.settings') + '">⚙️</button>' +
      '</header>' +
      '<div class="card"><p class="home-hello">' +
        Mates.t('home.hello', { name: Mates.esc(p.name) }) + '</p></div>' +
      modes;
  },

  /** Avatar builder for a new profile. */
  builder: function () {
    const b = Mates.state.building;
    if (!b) { Mates.router.go('profiles'); return ''; }

    /* One row per part; options are mini-avatar thumbnails that live-update. */
    const partRow = function (part, labelKey, max) {
      let opts = '';
      for (let i = 0; i < max; i++) {
        const cfg = Object.assign({}, b.config);
        cfg[part] = i;
        opts += '<button class="opt-btn' + (b.config[part] === i ? ' active' : '') + '"' +
          ' data-action="builderSetPart" data-part="' + part + '" data-value="' + i + '" aria-label="' +
          Mates.esc(labelKey) + ' ' + (i + 1) + '">' +
          Mates.avatar.render(cfg, 44) + '</button>';
      }
      return '<div class="option-row">' +
        '<div class="setting-label">' + Mates.t(labelKey) + '</div>' +
        '<div class="option-options">' + opts + '</div></div>';
    };

    /* Hair color: plain swatches. */
    let swatches = '';
    Mates.avatar.HAIR_COLORS.forEach(function (color, i) {
      swatches += '<button class="swatch' + (b.config.hairColor === i ? ' active' : '') + '"' +
        ' data-action="builderSetPart" data-part="hairColor" data-value="' + i + '"' +
        ' style="background:' + color + '" aria-label="' + Mates.t('builder.hairColor') + ' ' + (i + 1) + '"></button>';
    });

    return '' +
      '<header class="header">' +
        '<button class="icon-btn" data-action="builderBack" aria-label="' +
          Mates.t('common.back') + '">←</button>' +
        '<h1 class="title">' + Mates.t('builder.title') + '</h1>' +
        '<span></span>' +
      '</header>' +

      '<div class="card builder-preview">' + Mates.avatar.render(b.config, 160) + '</div>' +

      '<div class="card settings-group">' +
        '<div class="setting-label">' + Mates.t('builder.name') + '</div>' +
        '<input class="name-input" data-bind="profileName" type="text" maxlength="20"' +
          ' placeholder="' + Mates.t('builder.name.placeholder') + '"' +
          ' value="' + Mates.esc(b.name) + '">' +
      '</div>' +

      partRow('face', 'builder.face', 3) +
      partRow('hair', 'builder.hair', 6) +
      '<div class="option-row">' +
        '<div class="setting-label">' + Mates.t('builder.hairColor') + '</div>' +
        '<div class="option-options">' + swatches + '</div>' +
      '</div>' +
      partRow('eyes', 'builder.eyes', 3) +
      partRow('mouth', 'builder.mouth', 3) +

      '<button class="btn btn-ghost" data-action="builderSurprise">🎲 ' + Mates.t('builder.surprise') + '</button>' +
      '<button class="btn btn-primary" data-action="builderSave">' + Mates.t('builder.save') + '</button>';
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
});

/* ---------- Actions ---------- */
Mates.actions.openSettings = function () {
  Mates.router.go('settings');
};

Mates.actions.backToProfiles = function () {
  Mates.router.go('profiles');
};

Mates.actions.selectProfile = function (el) {
  if (!Mates.profiles.get(el.dataset.id)) return;
  Mates.state.profileId = el.dataset.id;
  Mates.router.go('home');
};

Mates.actions.deleteProfile = function (el) {
  const p = Mates.profiles.get(el.dataset.id);
  if (!p) return;
  if (!window.confirm(Mates.t('profiles.delete.confirm', { name: p.name }))) return;
  Mates.profiles.remove(p.id);
  if (Mates.state.profileId === p.id) Mates.state.profileId = null;
  Mates.router.refresh();
};

Mates.actions.addProfile = function () {
  Mates.state.building = { name: '', config: Mates.avatar.random() };
  Mates.router.go('builder');
};

Mates.actions.builderBack = function () {
  Mates.state.building = null;
  Mates.router.go('profiles');
};

Mates.actions.builderSetPart = function (el) {
  if (!Mates.state.building) return;
  Mates.state.building.config[el.dataset.part] = Number(el.dataset.value);
  Mates.router.refresh();
};

Mates.actions.builderSurprise = function () {
  if (!Mates.state.building) return;
  Mates.state.building.config = Mates.avatar.random();
  Mates.router.refresh();
};

Mates.actions.builderSave = function () {
  const b = Mates.state.building;
  if (!b || !b.name.trim()) return; // name required; input stays visible
  const profile = Mates.profiles.create(b.name, b.config);
  Mates.state.building = null;
  Mates.state.profileId = profile.id;
  Mates.router.go('home');
};

Mates.actions.switchUser = function () {
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

/* ---------- Event delegation ---------- */
appEl.addEventListener('click', function (e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const handler = Mates.actions[el.dataset.action];
  if (handler) handler(el, e);
});

/* Live-bind text inputs (no re-render while typing). */
appEl.addEventListener('input', function (e) {
  const el = e.target;
  if (!el || !el.dataset || el.dataset.bind !== 'profileName') return;
  if (Mates.state.building) Mates.state.building.name = el.value;
});

/* ---------- Boot ---------- */
function boot() {
  Mates.loadSettings();
  Mates.applyTheme();
  // Register one action per practice mode (home menu buttons).
  Object.keys(Mates.modes).forEach(function (key) {
    Mates.actions[key + 'Enter'] = Mates.modes[key].enter;
  });
  Mates.router.go('profiles');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
