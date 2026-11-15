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
  adaptiveSel: null,      // adaptive-mode selection: { op }
  timedSel: null,         // timed-mode selection: { op, level } (op may be 'mixed')
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
  /** First-launch welcome, shown when the device has no profiles yet. */
  welcome: function () {
    return '' +
      '<div class="card welcome-card">' +
        '<svg viewBox="0 0 512 512" width="120" height="120" aria-hidden="true">' +
          '<rect width="512" height="512" rx="112" fill="#ef7d54"/>' +
          '<path d="M 138 366 L 138 196 L 256 300 L 374 196 L 374 366" fill="none" stroke="#fffdf9" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<circle cx="398" cy="140" r="30" fill="#3aa6a0"/>' +
        '</svg>' +
        '<h1 class="welcome-title">' + Mates.t('app.name') + '</h1>' +
        '<p class="welcome-tagline">' + Mates.t('welcome.tagline') + '</p>' +
        '<button class="btn btn-primary" data-action="welcomeStart">' +
          Mates.t('welcome.start') + '</button>' +
      '</div>';
  },

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
          '<button class="profile-gear" data-action="openProfileSettings" data-id="' + p.id + '" aria-label="' +
            Mates.t('common.settings') + '">⚙</button>' +
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

  /** Per-profile goal editor for the timed challenge (⚙ on a profile card). */
  profileSettings: function () {
    const p = Mates.profiles.get(Mates.state.profileId);
    if (!p) { Mates.router.go('profiles'); return ''; }
    const d = Mates.profileData.get(p.id);

    /** One +/− stepper row; buttons disable themselves at the limits. */
    function stepperRow(field, labelKey, value, step, clamp) {
      const atMin = clamp(value - step) === value;
      const atMax = clamp(value + step) === value;
      return '<div class="settings-row stepper-row">' +
        '<div class="setting-label">' + Mates.t(labelKey) + '</div>' +
        '<div class="stepper">' +
          '<button class="stepper-btn" data-action="goalStep" data-field="' + field + '"' +
            ' data-delta="-' + step + '"' + (atMin ? ' disabled' : '') + '>−</button>' +
          '<span class="stepper-value">' + value + '</span>' +
          '<button class="stepper-btn" data-action="goalStep" data-field="' + field + '"' +
            ' data-delta="' + step + '"' + (atMax ? ' disabled' : '') + '>+</button>' +
        '</div>' +
      '</div>';
    }

    return '' +
      '<header class="header">' +
        '<button class="icon-btn" data-action="profileSettingsBack" aria-label="' +
          Mates.t('common.back') + '">←</button>' +
        '<h1 class="title">' + Mates.t('profileSettings.title') + '</h1>' +
        '<span></span>' +
      '</header>' +
      '<div class="card settings-row">' +
        Mates.avatar.render(p.avatar, 56) +
        '<div class="setting-label">' + Mates.esc(p.name) + '</div>' +
      '</div>' +
      '<div class="card settings-group">' +
        stepperRow('target', 'goal.target', d.timedGoal.target, 1,
          function (v) { return Mates.timedGoal.clamp('target', v); }) +
        stepperRow('time', 'goal.time', d.timedGoal.time, 5,
          function (v) { return Mates.timedGoal.clamp('time', v); }) +
        stepperRow('bombTime', 'bomb.time', Mates.bombTime.get(p.id), 5,
          function (v) { return Mates.bombTime.clamp(v); })
      '</div>';
  },

  /** Home for the active profile: greeting, mode menu, stats, badges,
   * high scores and leaderboard entry. */
  home: function () {
    const p = Mates.profiles.get(Mates.state.profileId);
    if (!p) { Mates.router.go('profiles'); return ''; }
    const d = Mates.profileData.get(p.id);

    let modes = '';
    Object.keys(Mates.modes).forEach(function (key) {
      const m = Mates.modes[key];
      modes += '<button class="btn btn-primary mode-card" data-action="' + key + 'Enter">' +
        m.icon + '  ' + Mates.t(m.nameKey) + '</button>';
    });

    /* Stats: lifetime points, current streak, best streak. */
    const stats = '' +
      '<div class="stats-row">' +
        '<div class="stat"><div class="stat-value">' + d.points + '</div>' +
          '<div class="stat-label">' + Mates.t('home.points') + '</div></div>' +
        '<div class="stat"><div class="stat-value">🔥 ' + d.currentStreak + '</div>' +
          '<div class="stat-label">' + Mates.t('home.streak') + '</div></div>' +
        '<div class="stat"><div class="stat-value">⭐ ' + d.bestStreak + '</div>' +
          '<div class="stat-label">' + Mates.t('home.bestStreak') + '</div></div>' +
      '</div>';

    /* Badges: earned in full color, unearned dimmed. */
    let badges = '';
    Mates.badges.DEFS.forEach(function (b) {
      const earned = d.badges.indexOf(b.id) !== -1;
      badges += '<div class="badge-cell' + (earned ? ' earned' : ' locked') + '" aria-label="' +
        Mates.esc(Mates.t(b.nameKey)) + '" title="' +
        Mates.esc(Mates.t(b.nameKey)) + ' — ' + Mates.esc(Mates.t(b.descKey)) + '">' + b.icon + '</div>';
    });

    /* Best challenge times (only when there is something to show). */
    const bestKeys = Object.keys(d.timedBest);
    let highScores = '';
    if (bestKeys.length) {
      let rows = '';
      bestKeys.forEach(function (key) {
        const parts = key.split('.'); // '<op>.<level>' or 'mixed'
        const label = key === 'mixed'
          ? '🔀 ' + Mates.t('timed.mixed')
          : Mates.questions.SYMBOLS[parts[0]] + ' L' + parts[1];
        rows += '<div class="hs-row"><span>' + label + '</span><span>⏱ ' + d.timedBest[key] + ' s</span></div>';
      });
      highScores = '<div class="card settings-group">' +
        '<div class="setting-label">' + Mates.t('home.highScores') + '</div>' + rows + '</div>';
    }

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
      modes +
      '<div class="card">' + stats + '</div>' +
      '<div class="card settings-group"><div class="setting-label">' +
        Mates.t('home.badges') + '</div><div class="badges-grid">' + badges + '</div></div>' +
      highScores +
      '<button class="btn btn-ghost" data-action="openLeaderboard">🏆 ' +
        Mates.t('home.leaderboard') + '</button>';
  },

  /** Local leaderboard: profiles on this device ranked by lifetime points. */
  leaderboard: function () {
    const rows = Mates.profiles.list()
      .map(function (p) { return { p: p, d: Mates.profileData.get(p.id) }; })
      .sort(function (a, b) { return b.d.points - a.d.points; });

    let list = '';
    rows.forEach(function (row, i) {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
      list += '<div class="lb-row">' +
        '<span class="lb-rank">' + medal + '</span>' +
        Mates.avatar.render(row.p.avatar, 40) +
        '<span class="lb-name">' + Mates.esc(row.p.name) + '</span>' +
        '<span class="lb-meta">🔥 ' + row.d.bestStreak + ' · 🎖 ' + row.d.badges.length + '</span>' +
        '<span class="lb-points">' + row.d.points + '</span>' +
      '</div>';
    });

    return '' +
      '<header class="header">' +
        '<button class="icon-btn" data-action="backToHome" aria-label="' +
          Mates.t('common.back') + '">←</button>' +
        '<h1 class="title">' + Mates.t('leaderboard.title') + '</h1>' +
        '<span></span>' +
      '</header>' +
      '<div class="card lb-list">' + list + '</div>';
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

/** Open the goal editor from a profile card's ⚙ button. */
Mates.actions.openProfileSettings = function (el) {
  if (!Mates.profiles.get(el.dataset.id)) return;
  Mates.state.profileId = el.dataset.id;
  Mates.router.go('profileSettings');
};

Mates.actions.profileSettingsBack = function () {
  Mates.router.go('profiles');
};

/** Adjust a per-profile setting by a stepper delta (timed goal or bomb time). */
Mates.actions.goalStep = function (el) {
  const id = Mates.state.profileId;
  if (!Mates.profiles.get(id)) return;
  const field = el.dataset.field;
  const d = Mates.profileData.get(id);
  if (field === 'bombTime') {
    d.bombTime = Mates.bombTime.clamp(d.bombTime + Number(el.dataset.delta));
  } else {
    d.timedGoal[field] = Mates.timedGoal.clamp(field, d.timedGoal[field] + Number(el.dataset.delta));
  }
  Mates.profileData.save(id, d);
  Mates.router.refresh();
};

/** Welcome screen start: straight to the profile builder on a fresh device. */
Mates.actions.welcomeStart = function () {
  Mates.state.building = { name: '', config: Mates.avatar.random() };
  Mates.router.go('builder');
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

Mates.actions.openLeaderboard = function () {
  Mates.router.go('leaderboard');
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
  // First launch (no profiles yet): welcome screen, then profile builder.
  Mates.router.go(Mates.profiles.list().length === 0 ? 'welcome' : 'profiles');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* ---------- PWA: service worker registration ----------
 * Only in secure contexts (https / localhost) so plain local dev
 * never breaks; failures are swallowed silently. */
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}
