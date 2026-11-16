/* Mates — smoke test harness.
 * Loads the app scripts in a vm context with a minimal fake DOM
 * and a shared localStorage stub, then simulates user clicks.
 * Run: node test/smoke.mjs */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
/* Web assets live in www/ (Capacitor webDir); the harness loads from there. */
const WEB = path.join(ROOT, 'www');
const SCRIPTS = [
  'js/i18n/en.js',
  'js/i18n/es.js',
  'js/i18n.js',
  'js/avatar.js',
  'js/storage.js',
  'js/badges.js',
  'js/sound.js',
  'js/questions.js',
  'js/round.js',
  'js/modes/level.js',
  'js/modes/adaptive.js',
  'js/modes/timed.js',
  'js/modes/bomb.js',
  'js/modes/bomb-round.js',
  'js/app.js'
];

/* Shared "device" storage across simulated page loads. */
const store = new Map();

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log('  ok  ' + name);
  } else {
    failures++;
    console.error('FAIL  ' + name);
  }
}

/** Simulate one page load with fresh DOM but persistent storage. */
function loadPage({ browserLang = 'en-US', systemDark = false } = {}) {
  const appEl = {
    innerHTML: '',
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    click(elStub) {
      (this.listeners.click || []).forEach(fn =>
        fn({ target: { closest: () => elStub } }));
    },
    input(value) {
      (this.listeners.input || []).forEach(fn =>
        fn({ target: { dataset: { bind: 'profileName' }, value } }));
    }
  };

  const documentElement = {
    lang: '',
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; }
  };

  const sandbox = {
    console,
    Object, String, Number, JSON, Math, Array, Map, Promise,
    navigator: { language: browserLang },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    document: {
      readyState: 'complete',
      documentElement,
      getElementById: id => (id === 'app' ? appEl : null),
      addEventListener() {}
    },
    matchMedia: () => ({ matches: systemDark, addEventListener() {} }),
    scrollTo() {},
    confirm: () => true // auto-accept confirmations
  };

  /* Controllable timers: setTimeout callbacks are captured and fired on demand. */
  const pendingTimeouts = [];
  sandbox.setTimeout = fn => { pendingTimeouts.push(fn); return pendingTimeouts.length; };
  sandbox.setInterval = () => 0; // ticks driven manually via Mates.round.tick()
  sandbox.clearInterval = () => {};

  sandbox.window = sandbox; // window === globalThis, like in a browser
  vm.createContext(sandbox);

  for (const rel of SCRIPTS) {
    const code = readFileSync(path.join(WEB, rel), 'utf8');
    vm.runInContext(code, sandbox, { filename: rel });
  }

  return {
    appEl, documentElement, ctx: sandbox,
    flushTimers() { const fns = pendingTimeouts.splice(0); fns.forEach(fn => fn()); }
  };
}

/* ---------- Load 1: first run, English browser, light system ---------- */
console.log('load 1 (first run, en-US, light system)');
let page = loadPage({ browserLang: 'en-US', systemDark: false });
check('theme defaults to light via system', page.documentElement.attrs['data-theme'] === 'light');
check('language auto-detected as en', page.documentElement.lang === 'en');

/* ---------- Step 8: onboarding — fresh device boots to welcome ---------- */
console.log('step 8 (onboarding)');
check('welcome screen on fresh device',
  page.appEl.innerHTML.includes('Cozy maths practice for growing brains.'));
check('welcome start button present', page.appEl.innerHTML.includes('data-action="welcomeStart"'));

/* Welcome -> builder -> first profile */
page.appEl.click({ dataset: { action: 'welcomeStart' } });
check('builder screen rendered (EN)', page.appEl.innerHTML.includes('New profile</h1>'));
check('builder shows accessory rows',
  page.appEl.innerHTML.includes('>Glasses<') && page.appEl.innerHTML.includes('>Hat<') &&
  page.appEl.innerHTML.includes('>Hair accessory<') && page.appEl.innerHTML.includes('>Earrings<') &&
  page.appEl.innerHTML.includes('>Freckles<'));
page.appEl.click({ dataset: { action: 'builderSurprise' } });
page.appEl.click({ dataset: { action: 'builderSetPart', part: 'hair', value: '3' } });
page.appEl.click({ dataset: { action: 'builderSetPart', part: 'hairColor', value: '6' } });
page.appEl.click({ dataset: { action: 'builderSetPart', part: 'glasses', value: '4' } });
page.appEl.click({ dataset: { action: 'builderSetPart', part: 'hat', value: '2' } });
page.appEl.click({ dataset: { action: 'builderSetPart', part: 'hairpin', value: '1' } });
page.appEl.click({ dataset: { action: 'builderSetPart', part: 'earrings', value: '2' } });
page.appEl.click({ dataset: { action: 'builderSetPart', part: 'freckles', value: '1' } });
page.appEl.input('Luna');
page.appEl.click({ dataset: { action: 'builderSave' } });
check('home screen greets Luna (EN)', page.appEl.innerHTML.includes('Hi, Luna!'));

let profiles = page.ctx.Mates.profiles.list();
check('one profile created', profiles.length === 1 && profiles[0].name === 'Luna');
check('avatar config persisted', profiles[0].avatar.hair === 3 && profiles[0].avatar.hairColor === 6);
check('accessory slots persisted',
  profiles[0].avatar.glasses === 4 && profiles[0].avatar.hat === 2 &&
  profiles[0].avatar.hairpin === 1 && profiles[0].avatar.earrings === 2 &&
  profiles[0].avatar.freckles === 1);
check('profile data initialized', page.ctx.Mates.profileData.get(profiles[0].id).points === 0);

/* Settings dance from the profiles screen */
page.appEl.click({ dataset: { action: 'switchUser' } });
check('profiles grid shows Luna card', page.appEl.innerHTML.includes('>Luna<'));
check('settings gear present', page.appEl.innerHTML.includes('data-action="openSettings"'));

/* Open settings */
page.appEl.click({ dataset: { action: 'openSettings' } });
check('settings screen rendered (EN)', page.appEl.innerHTML.includes('>Settings<') || page.appEl.innerHTML.includes('Settings</h1>'));
check('language seg has EN active', /data-value="en" class="active"/.test(page.appEl.innerHTML));

/* Switch language to Spanish */
page.appEl.click({ dataset: { action: 'setLanguage', value: 'es' } });
check('settings re-rendered in ES', page.appEl.innerHTML.includes('Ajustes</h1>') || page.appEl.innerHTML.includes('>Ajustes<'));
check('language seg has ES active', /data-value="es" class="active"/.test(page.appEl.innerHTML));

/* Back to profiles, still Spanish */
page.appEl.click({ dataset: { action: 'backToProfiles' } });
check('profiles screen in ES', page.appEl.innerHTML.includes('¿Quién juega?'));

/* Switch theme to dark */
page.appEl.click({ dataset: { action: 'openSettings' } });
page.appEl.click({ dataset: { action: 'setTheme', value: 'dark' } });
check('dark theme applied', page.documentElement.attrs['data-theme'] === 'dark');

/* Toggle sound off */
page.appEl.click({ dataset: { action: 'toggleSound' } });

let settings = JSON.parse(store.get('mates.settings'));
check('settings persisted (es/dark/sound off)',
  settings.language === 'es' && settings.theme === 'dark' && settings.sound === false);

/* ---------- Step 2: avatar + profiles flow (still load 1, ES) ---------- */
console.log('step 2 (avatar builder, profiles)');

/* Avatar renderer sanity */
const av = page.ctx.Mates.avatar;
check('renderAvatar returns svg', av.render(av.DEFAULT, 48).includes('<svg'));
check('renderAvatar sizes', av.render(av.DEFAULT, 160).includes('width="160"'));
check('random config in bounds', (() => {
  const r = av.random();
  return r.face < 3 && r.skin < 8 && r.hair < 10 && r.hairColor < 10 &&
    r.eyes < 3 && r.mouth < 3 && r.glasses < 5 && r.hat < 5 &&
    r.hairpin < 5 && r.earrings < 3 && r.freckles < 2;
})());

/* ---------- Step 15: avatar variability expansion ---------- */
console.log('step 15 (avatar parts, bounds, layering, legacy merge)');
{
  const A = page.ctx.Mates.avatar;
  /* Every geometric number in a size-100 render must lie within the
   * 100x100 viewBox (colors and URLs are stripped before scanning). */
  const inBounds = function (svg) {
    const stripped = svg.replace(/#[0-9a-f]{3,8}/gi, '').replace(/https?:\/\/[^"]*/g, '');
    for (const m of stripped.matchAll(/-?\d+(?:\.\d+)?/g)) {
      const n = Number(m[0]);
      if (n < 0 || n > 100) return false;
    }
    return true;
  };

  /* Every accessory combo (5x5x5x3x2 = 750 renders) stays in bounds. */
  const base = { face: 0, skin: 1, hair: 3, hairColor: 1, eyes: 0, mouth: 0 };
  let allParts = true;
  for (let g = 0; g < 5 && allParts; g++) for (let h = 0; h < 5 && allParts; h++)
    for (let p = 0; p < 5 && allParts; p++) for (let e = 0; e < 3 && allParts; e++)
      for (let f = 0; f < 2 && allParts; f++) {
        const cfg = Object.assign({}, base, { glasses: g, hat: h, hairpin: p, earrings: e, freckles: f });
        if (!inBounds(A.render(cfg, 100))) allParts = false;
      }
  check('all accessory combos within viewBox', allParts);

  /* Hat-over-hair layering: hat markup must come after the front hair. */
  let layered = true;
  for (let hair = 1; hair < 10 && layered; hair++) {
    const svg = A.render(Object.assign({}, base, { hair: hair, hat: 1 }), 100);
    const frontMarker = hair === 2 ? 'cx="26" cy="44"' : 'M 18 52 Q 18 20';
    const frontIdx = svg.indexOf(frontMarker);
    const hatIdx = svg.indexOf('y="35"'); /* beanie band */
    if (frontIdx === -1 || hatIdx === -1 || hatIdx < frontIdx) layered = false;
  }
  check('hat renders above front hair for all styles', layered);

  /* All ten hair styles and eight skin tones render in bounds. */
  let hairOk = true, skinOk = true;
  for (let h = 0; h < 10 && hairOk; h++) if (!inBounds(A.render(Object.assign({}, base, { hair: h }), 100))) hairOk = false;
  for (let s = 0; s < 8 && skinOk; s++) if (!inBounds(A.render(Object.assign({}, base, { skin: s }), 100))) skinOk = false;
  check('all 10 hair styles in bounds', hairOk);
  check('all 8 skin tones in bounds', skinOk);

  /* random() stays within the expanded ranges. */
  let rndOk = true;
  for (let i = 0; i < 200 && rndOk; i++) {
    const r = A.random();
    if (r.face > 2 || r.skin > 7 || r.hair > 9 || r.hairColor > 9 ||
        r.eyes > 2 || r.mouth > 2 || r.glasses > 4 || r.hat > 4 ||
        r.hairpin > 4 || r.earrings > 2 || r.freckles > 1) rndOk = false;
  }
  check('random() in expanded bounds (200 draws)', rndOk);

  /* Legacy profile (no accessory slots) merges to defaults on read. */
  const savedProfiles = store.get('mates.profiles');
  const legacy = { id: 'pLegacy', name: 'Oldie',
    avatar: { face: 1, skin: 2, hair: 4, hairColor: 3, eyes: 1, mouth: 2 },
    createdAt: '2026-01-01T00:00:00Z' };
  store.set('mates.profiles', JSON.stringify([legacy]));
  const merged = page.ctx.Mates.profiles.list()[0].avatar;
  check('legacy avatar merges new slots to 0',
    merged.glasses === 0 && merged.hat === 0 && merged.hairpin === 0 &&
    merged.earrings === 0 && merged.freckles === 0);
  check('legacy avatar keeps old values', merged.face === 1 && merged.hair === 4 && merged.mouth === 2);
  check('legacy avatar renders in bounds', inBounds(A.render(merged, 100)));
  if (savedProfiles !== undefined) store.set('mates.profiles', savedProfiles);
  else store.delete('mates.profiles');
}

/* Profiles screen: Luna card (created during onboarding) + add card */
page.appEl.click({ dataset: { action: 'backToProfiles' } });
check('profiles grid shows Luna card', page.appEl.innerHTML.includes('>Luna<'));
check('add-profile card present', page.appEl.innerHTML.includes('data-action="addProfile"'));

/* Second profile via the builder, then delete the first */
page.appEl.click({ dataset: { action: 'addProfile' } });
check('builder screen rendered (ES)', page.appEl.innerHTML.includes('Nuevo perfil</h1>'));
page.appEl.input('Max');
page.appEl.click({ dataset: { action: 'builderSave' } });
check('home greets Max', page.appEl.innerHTML.includes('¡Hola, Max!'));

page.appEl.click({ dataset: { action: 'switchUser' } });
profiles = page.ctx.Mates.profiles.list();
const lunaId = profiles.find(p => p.name === 'Luna').id;
page.appEl.click({ dataset: { action: 'deleteProfile', id: lunaId } });
check('Luna deleted from list', page.ctx.Mates.profiles.list().every(p => p.name !== 'Luna'));
check('Luna data record removed', !store.has('mates.profile.' + lunaId));
check('grid now shows only Max', page.appEl.innerHTML.includes('>Max<') && !page.appEl.innerHTML.includes('>Luna<'));

/* ---------- Step 3: question generators + level mode (still load 1, ES) ---------- */
console.log('step 3 (question generators + level mode)');

const Q = page.ctx.Mates.questions;
function sample(op, level, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(Q.generate(op, level));
  return out;
}
function assertAll(name, arr, pred) {
  const bad = arr.find(q => !pred(q));
  check(name + (bad ? ' — bad: ' + JSON.stringify(bad) : ''), !bad);
}
const inSet = arr => v => arr.includes(v);

/* Generator invariants per operation/level */
[[1, 10], [2, 20], [3, 100], [4, 999]].forEach(([lv, cap]) =>
  assertAll('add L' + lv + ' within ' + cap, sample('add', lv, 60),
    q => q.a >= 1 && q.b >= 1 && q.a + q.b === q.answer && q.a + q.b <= cap));
assertAll('add L5 two 3-digit numbers', sample('add', 5, 60),
  q => q.a >= 100 && q.a <= 899 && q.b >= 100 && q.b <= 899 && q.a + q.b === q.answer);

[[1, 10], [2, 20], [3, 99], [4, 999]].forEach(([lv, cap]) =>
  assertAll('sub L' + lv + ' non-negative within ' + cap, sample('sub', lv, 60),
    q => q.a <= cap && q.b >= 1 && q.a - q.b === q.answer && q.answer >= 1));
assertAll('sub L5 two 3-digit numbers', sample('sub', 5, 60),
  q => q.a >= 200 && q.b >= 100 && q.a - q.b === q.answer);

assertAll('mul L1 tables 2/5/10', sample('mul', 1, 60),
  q => inSet([2, 5, 10])(q.a) && q.b <= 10 && q.a * q.b === q.answer);
assertAll('mul L2 tables 3/4/6', sample('mul', 2, 60),
  q => inSet([3, 4, 6])(q.a) && q.b <= 12 && q.a * q.b === q.answer);
assertAll('mul L3 tables 7/8/9', sample('mul', 3, 60),
  q => inSet([7, 8, 9])(q.a) && q.b <= 12 && q.a * q.b === q.answer);
assertAll('mul L4 mixed tables 2-12', sample('mul', 4, 60),
  q => q.a >= 2 && q.a <= 12 && q.b >= 2 && q.b <= 12 && q.a * q.b === q.answer);
assertAll('mul L5 2-digit x 1-digit', sample('mul', 5, 60),
  q => q.a >= 12 && q.a <= 99 && q.b >= 2 && q.b <= 9 && q.a * q.b === q.answer);

assertAll('div L1 exact, tables 2/5/10', sample('div', 1, 60),
  q => inSet([2, 5, 10])(q.b) && q.a % q.b === 0 && q.a / q.b === q.answer);
assertAll('div L2 exact, divisor <= 9', sample('div', 2, 60),
  q => q.b >= 2 && q.b <= 9 && q.a % q.b === 0 && q.a / q.b === q.answer);
assertAll('div L3 2-digit dividend', sample('div', 3, 60),
  q => q.a >= 10 && q.b >= 2 && q.b <= 9 && q.a % q.b === 0 && q.a / q.b === q.answer);
assertAll('div L4 exact', sample('div', 4, 60),
  q => q.a % q.b === 0 && q.a / q.b === q.answer);
assertAll('div L5 3-digit dividend', sample('div', 5, 60),
  q => q.a >= 100 && q.b <= 9 && q.a % q.b === 0 && q.a / q.b === q.answer);

const round = Q.generateRound('add', 1, 10);
check('round has 10 unique questions',
  round.length === 10 && new Set(round.map(q => q.a + q.op + q.b)).size === 10);

/* Level-mode flow: select Max -> setup -> full correct round */
const max = page.ctx.Mates.profiles.list().find(p => p.name === 'Max');
page.appEl.click({ dataset: { action: 'selectProfile', id: max.id } });
check('home shows level mode button', page.appEl.innerHTML.includes('data-action="levelEnter"'));
page.appEl.click({ dataset: { action: 'levelEnter' } });
check('level setup screen (ES)', page.appEl.innerHTML.includes('Elige un nivel'));
page.appEl.click({ dataset: { action: 'levelSetOp', op: 'add' } });
page.appEl.click({ dataset: { action: 'levelSetLevel', value: '1' } });
page.appEl.click({ dataset: { action: 'levelStart' } });
check('round screen rendered', page.appEl.innerHTML.includes('= ?'));

/* Keypresses and advances must patch the DOM in place; only the final
 *  navigation to results is a full re-render (flicker regression). */
let levelRefreshes = 0;
const origLevelRefresh = page.ctx.Mates.router.refresh;
page.ctx.Mates.router.refresh = function () { levelRefreshes++; return origLevelRefresh.apply(this, arguments); };
for (let i = 0; i < 10; i++) {
  const s = page.ctx.Mates.round.peek();
  String(s.question.answer).split('').forEach(d =>
    page.appEl.click({ dataset: { action: 'keypad', key: d } }));
  page.appEl.click({ dataset: { action: 'keypad', key: 'enter' } });
  page.flushTimers(); // fire the feedback-delay advance
}
check('only the results navigation re-renders during a round', levelRefreshes === 1);
page.ctx.Mates.router.refresh = origLevelRefresh;
check('results screen shows 10 / 10', page.appEl.innerHTML.includes('10 / 10'));
check('points shown (+100, ES)', page.appEl.innerHTML.includes('+100 puntos'));
let d = page.ctx.Mates.profileData.get(max.id);
check('stats + points recorded', d.stats.add.answered === 10 && d.stats.add.correct === 10 && d.points === 100);
page.appEl.click({ dataset: { action: 'resultsContinue' } });

/* Wrong-answer path: feedback shows correct value, then advances */
page.appEl.click({ dataset: { action: 'levelEnter' } });
page.appEl.click({ dataset: { action: 'levelStart' } });
const s2 = page.ctx.Mates.round.peek();
String(s2.question.answer + 1).split('').forEach(dg =>
  page.appEl.click({ dataset: { action: 'keypad', key: dg } }));
page.appEl.click({ dataset: { action: 'keypad', key: 'enter' } });
const s3 = page.ctx.Mates.round.peek();
check('wrong answer locks with feedback + correct value',
  s3.locked && s3.feedback.type === 'no' && s3.feedback.text.includes(String(s2.question.answer)));
page.flushTimers();
const s4 = page.ctx.Mates.round.peek();
check('advanced to question 2, score still 0', s4.index === 1 && s4.score === 0);

/* Quit mid-round returns to setup */
page.appEl.click({ dataset: { action: 'roundQuit' } });
check('quit returns to level setup', page.appEl.innerHTML.includes('Elige un nivel'));

/* ---------- Approximation (rounding): generator invariants + mode flows ---------- */
console.log('approximation (rounding)');

/* OPS now include rounding; "mixed" iterates OPS, so it can draw round. */
check('OPS includes round with ≈ symbol', Q.OPS.includes('round') && Q.SYMBOLS.round === '≈');

/* Generator invariants per level: target, value range, never an exact
 *  multiple of the step, correct rounding (ties up), answer fits the
 *  4-digit keypad (never 10000). */
const ROUND_LEVELS = [
  { lv: 1, targets: ['ten'], ranges: { ten: [11, 99] } },
  { lv: 2, targets: ['ten'], ranges: { ten: [101, 999] } },
  { lv: 3, targets: ['hundred'], ranges: { hundred: [111, 999] } },
  { lv: 4, targets: ['hundred'], ranges: { hundred: [1001, 9899] } },
  { lv: 5, targets: ['ten', 'hundred', 'thousand'],
    ranges: { ten: [101, 999], hundred: [1001, 9899], thousand: [2001, 8999] } }
];
ROUND_LEVELS.forEach(({ lv, targets, ranges }) =>
  assertAll('round L' + lv, sample('round', lv, 60), q => {
    const step = q.target === 'ten' ? 10 : (q.target === 'hundred' ? 100 : 1000);
    const range = ranges[q.target];
    return targets.includes(q.target) && q.value >= range[0] && q.value <= range[1] &&
      q.value % step !== 0 && q.op === '≈' &&
      q.answer === Math.round(q.value / step) * step && q.answer <= 9999;
  }));

/* L5 must actually draw all three targets. */
check('round L5 mixes ten/hundred/thousand',
  new Set(sample('round', 5, 200).map(q => q.target)).size === 3);

/* A round of 10 unique rounding questions (non-binary dedup key). */
const roundQs = Q.generateRound('round', 3, 10);
check('rounding round has 10 unique questions',
  roundQs.length === 10 && new Set(roundQs.map(q => q.value + q.op + q.target)).size === 10);

/* Profile data defaults cover the new operation. */
{
  const d = page.ctx.Mates.profileData.get(max.id);
  check('profile data has stats.round and adaptiveLevel.round',
    d.stats.round.answered === 0 && d.adaptiveLevel.round === 2);
}

/* Instruction keys exist in both catalogs. They are built dynamically
 *  ('round.instruction.' + target), so the literal-call parity matcher
 *  above does not cover them — check explicitly. */
{
  const enSrc = readFileSync(path.join(WEB, 'js/i18n/en.js'), 'utf8');
  const esSrc = readFileSync(path.join(WEB, 'js/i18n/es.js'), 'utf8');
  ['ten', 'hundred', 'thousand'].forEach(t => {
    const re = new RegExp("'round\\.instruction\\." + t + "':\\s*'[^']+'");
    check('i18n round.instruction.' + t + ' in EN + ES', re.test(enSrc) && re.test(esSrc));
  });
}

/* Level-mode flow with op=round: hint line + "≈ ?" question render.
 *  Still on the level setup screen (the quit above landed there). */
check('level setup shows ≈ button for round', page.appEl.innerHTML.includes('data-op="round"'));
page.appEl.click({ dataset: { action: 'levelSetOp', op: 'round' } });
page.appEl.click({ dataset: { action: 'levelSetLevel', value: '1' } });
page.appEl.click({ dataset: { action: 'levelStart' } });
{
  const s = page.ctx.Mates.round.peek();
  check('round question renders with instruction hint (ES)',
    page.appEl.innerHTML.includes('Redondea a la decena más cercana') &&
    page.appEl.innerHTML.includes(s.question.value + ' ≈ ?'));
}
for (let i = 0; i < 10; i++) {
  const s = page.ctx.Mates.round.peek();
  String(s.question.answer).split('').forEach(dg =>
    page.appEl.click({ dataset: { action: 'keypad', key: dg } }));
  page.appEl.click({ dataset: { action: 'keypad', key: 'enter' } });
  page.flushTimers();
}
check('rounding results show 10 / 10', page.appEl.innerHTML.includes('10 / 10'));
{
  const d = page.ctx.Mates.profileData.get(max.id);
  check('stats.round + points recorded (200 total)',
    d.stats.round.answered === 10 && d.stats.round.correct === 10 && d.points === 200);
}
page.appEl.click({ dataset: { action: 'resultsContinue' } });

/* Adaptive and timed pickers also offer ≈ (they iterate OPS + SYMBOLS). */
page.appEl.click({ dataset: { action: 'adaptiveEnter' } });
check('adaptive setup shows ≈ button for round', page.appEl.innerHTML.includes('data-op="round"'));
page.appEl.click({ dataset: { action: 'backToHome' } });
page.appEl.click({ dataset: { action: 'timedEnter' } });
check('timed setup shows ≈ button for round', page.appEl.innerHTML.includes('data-op="round"'));
page.appEl.click({ dataset: { action: 'backToHome' } });

/* ---------- Step 4: adaptive mode (still load 1, ES) ---------- */
console.log('step 4 (adaptive mode)');

/** Answer the current question correctly or one-off; flushes the advance timer. */
function answer(correct) {
  const s = page.ctx.Mates.round.peek();
  const val = correct ? s.question.answer : s.question.answer + 1;
  String(val).split('').forEach(dg =>
    page.appEl.click({ dataset: { action: 'keypad', key: dg } }));
  page.appEl.click({ dataset: { action: 'keypad', key: 'enter' } });
  page.flushTimers();
}

page.appEl.click({ dataset: { action: 'backToHome' } });
check('home shows adaptive mode button', page.appEl.innerHTML.includes('data-action="adaptiveEnter"'));
page.appEl.click({ dataset: { action: 'adaptiveEnter' } });
check('adaptive setup screen (ES)', page.appEl.innerHTML.includes('Práctica adaptativa</h1>'));
page.appEl.click({ dataset: { action: 'adaptiveSetOp', op: 'add' } });
page.appEl.click({ dataset: { action: 'adaptiveStart' } });

let a = page.ctx.Mates.round.peek();
check('adaptive round starts at default level 2', a.adaptive && a.level === 2);
check('level indicator shown in round UI', page.appEl.innerHTML.includes('Nivel 2'));

answer(true); answer(true);
check('still level 2 after only 2 correct', page.ctx.Mates.round.peek().level === 2);
answer(true);
check('stepped up to level 3 after 3 consecutive correct', page.ctx.Mates.round.peek().level === 3);
answer(false); answer(false);
check('stepped down to level 2 after 2 wrong', page.ctx.Mates.round.peek().level === 2);

for (let i = 0; i < 5; i++) answer(true); // Q6–Q10 finish the round
check('results show level reached 3 (ES)', page.appEl.innerHTML.includes('Llegaste al nivel 3'));
let d4 = page.ctx.Mates.profileData.get(max.id);
check('reached level persisted per operation', d4.adaptiveLevel.add === 3);
page.appEl.click({ dataset: { action: 'resultsContinue' } });

/* ---------- Step 5: goal-based timed challenge (still load 1, ES) ---------- */
console.log('step 5 (goal-based timed challenge)');

/* Goal editor: the ⚙ on a profile card opens per-profile target/time steppers. */
page.appEl.click({ dataset: { action: 'switchUser' } });
check('profile cards show goal gear button', page.appEl.innerHTML.includes('data-action="openProfileSettings"'));
page.appEl.click({ dataset: { action: 'openProfileSettings', id: max.id } });
check('goal editor screen (ES)', page.appEl.innerHTML.includes('Objetivo del reto</h1>'));
check('default goal shown: 8 correct in 45 s', page.appEl.innerHTML.includes('>8<') && page.appEl.innerHTML.includes('>45<'));
page.appEl.click({ dataset: { action: 'goalStep', field: 'target', delta: '-1' } });
check('target stepper decrements to 7', page.appEl.innerHTML.includes('>7<'));
page.appEl.click({ dataset: { action: 'goalStep', field: 'target', delta: '1' } });
check('target stepper back to 8', page.appEl.innerHTML.includes('>8<'));
page.appEl.click({ dataset: { action: 'goalStep', field: 'time', delta: '5' } });
check('time stepper steps by 5 s (50)', page.appEl.innerHTML.includes('>50<'));
page.appEl.click({ dataset: { action: 'goalStep', field: 'time', delta: '-5' } });
check('time stepper back to 45', page.appEl.innerHTML.includes('>45<'));

/* Steppers clamp at the limits (target 1–30, time 10–300 s). */
{
  const d = page.ctx.Mates.profileData.get(max.id);
  d.timedGoal = { target: 1, time: 10 }; // push both fields to their minimums
  page.ctx.Mates.profileData.save(max.id, d);
}
page.appEl.click({ dataset: { action: 'profileSettingsBack' } });
page.appEl.click({ dataset: { action: 'openProfileSettings', id: max.id } });
check('minus disabled at target minimum (1)', /data-field="target" data-delta="-1" disabled/.test(page.appEl.innerHTML));
check('minus disabled at time minimum (10 s)', /data-field="time" data-delta="-5" disabled/.test(page.appEl.innerHTML));
page.appEl.click({ dataset: { action: 'goalStep', field: 'target', delta: '1' } });
check('plus still works at the minimum (target 2)', page.appEl.innerHTML.includes('>2<'));
page.appEl.click({ dataset: { action: 'goalStep', field: 'time', delta: '-5' } });
check('minus clamps at time minimum (still 10 s)', page.appEl.innerHTML.includes('>10<'));
{
  const d = page.ctx.Mates.profileData.get(max.id);
  d.timedGoal = { target: 8, time: 45 }; // restore defaults for the rounds below
  page.ctx.Mates.profileData.save(max.id, d);
}
page.appEl.click({ dataset: { action: 'profileSettingsBack' } });
page.appEl.click({ dataset: { action: 'selectProfile', id: max.id } });

/* Migration: obsolete count-based 'timed.*' high-score keys are dropped on read. */
{
  const d = page.ctx.Mates.profileData.get(max.id);
  d.highScores['timed.mul.3'] = 3; // simulate a pre-goal-based save
  d.highScores['level.add.2'] = 5; // unrelated key must survive
  page.ctx.Mates.storage.set('mates.profile.' + max.id, d);
}
{
  const d = page.ctx.Mates.profileData.get(max.id);
  check('migration drops timed.* high-score keys on read', !('timed.mul.3' in d.highScores));
  check('migration keeps other high-score keys', d.highScores['level.add.2'] === 5);
}

/* Success: reaching the goal ends the challenge early with a celebration. */
page.appEl.click({ dataset: { action: 'timedEnter' } });
check('timed setup screen (ES)', page.appEl.innerHTML.includes('Reto contrarreloj</h1>'));
check('setup shows the profile goal line', page.appEl.innerHTML.includes('Objetivo: 8 aciertos en 45 s'));
page.appEl.click({ dataset: { action: 'timedSetOp', op: 'mul' } });
page.appEl.click({ dataset: { action: 'timedSetLevel', value: '3' } });
check('level picker visible for single operation', page.appEl.innerHTML.includes('data-action="timedSetLevel"'));
page.appEl.click({ dataset: { action: 'timedStart' } });

let t = page.ctx.Mates.round.peek();
check('timed round starts at goal time (45 s)', t.timed && t.timeLeft === 45 && t.goal.target === 8);
check('countdown shown in round header', page.appEl.innerHTML.includes('⏱ 45'));
check('progress chip shows score / target', page.appEl.innerHTML.includes('>0 / 8<'));
check('answer flash element present in round UI', page.appEl.innerHTML.includes('id="roundFlash"'));

const ptsBefore = page.ctx.Mates.profileData.get(max.id).points;
answer(true); answer(true); answer(true);
t = page.ctx.Mates.round.peek();
check('instant confirm: score 3 without waiting', t.score === 3 && t.timeLeft === 45);
answer(false);
check('wrong answer keeps score at 3', page.ctx.Mates.round.peek().score === 3);

/* Ticks and key presses must update the screen in place, not re-render it:
 *  a full innerHTML swap per event makes the round visibly flicker. */
let refreshes = 0;
const origRefresh = page.ctx.Mates.router.refresh;
page.ctx.Mates.router.refresh = function () { refreshes++; return origRefresh.apply(this, arguments); };
for (let i = 0; i < 2; i++) page.ctx.Mates.round.tick(); // 45 -> 43 s left
check('timer ticks do not re-render the round screen', refreshes === 0);
['1', '2', '3'].forEach(d => page.appEl.click({ dataset: { action: 'keypad', key: d } }));
page.appEl.click({ dataset: { action: 'keypad', key: 'back' } });
page.appEl.click({ dataset: { action: 'keypad', key: 'back' } });
page.appEl.click({ dataset: { action: 'keypad', key: 'back' } });
check('keypad presses do not re-render the round screen', refreshes === 0);
page.ctx.Mates.router.refresh = origRefresh;
page.ctx.Mates.round.tick(); // 43 -> 42 s left

answer(true); answer(true); answer(true); answer(true); answer(true); // 8th correct hits the goal
check('goal reached: round ended early', page.ctx.Mates.round.peek() === null);
check('success banner (ES)', page.appEl.innerHTML.includes('🎉 ¡Lo lograste!'));
check('elapsed time shown (3 s, ES)', page.appEl.innerHTML.includes('en 3 s'));
check('score line shows goal progress', page.appEl.innerHTML.includes('>8 / 8<'));
check('points include +20 success bonus (+100, ES)', page.appEl.innerHTML.includes('+100 puntos'));
check('bonus line shown (ES)', page.appEl.innerHTML.includes('🎁 +20 puntos extra'));
check('new fastest-time record (ES)', page.appEl.innerHTML.includes('🏆 Más rápido: 3 s'));
let d6 = page.ctx.Mates.profileData.get(max.id);
check('points: score×10 + 20 bonus', d6.points === ptsBefore + 100);
check('fastest time persisted for mul.3', d6.timedBest['mul.3'] === 3);
check('no legacy count-based record written', !('timed.mul.3' in d6.highScores));
page.appEl.click({ dataset: { action: 'resultsContinue' } });

/* Second success, slower: no new record, stored best unchanged. */
page.appEl.click({ dataset: { action: 'timedEnter' } });
page.appEl.click({ dataset: { action: 'timedSetOp', op: 'mul' } });
page.appEl.click({ dataset: { action: 'timedSetLevel', value: '3' } });
page.appEl.click({ dataset: { action: 'timedStart' } });
for (let i = 0; i < 10; i++) page.ctx.Mates.round.tick(); // 45 -> 35 s left
for (let i = 0; i < 8; i++) answer(true);
check('slower success: no new-record trophy', !page.appEl.innerHTML.includes('🏆'));
check('this run time shown without record (ES)', page.appEl.innerHTML.includes('Más rápido: 10 s'));
d6 = page.ctx.Mates.profileData.get(max.id);
check('stored best unchanged after slower run', d6.timedBest['mul.3'] === 3);
page.appEl.click({ dataset: { action: 'resultsContinue' } });

/* Failure: clock hits 0 below the goal -> encouraging message + Try again. */
page.appEl.click({ dataset: { action: 'timedEnter' } });
page.appEl.click({ dataset: { action: 'timedSetOp', op: 'mul' } });
page.appEl.click({ dataset: { action: 'timedSetLevel', value: '3' } });
page.appEl.click({ dataset: { action: 'timedStart' } });
answer(true); answer(true); answer(true);
for (let i = 0; i < 45; i++) page.ctx.Mates.round.tick();
check('failure banner (ES)', page.appEl.innerHTML.includes('💪 ¡Casi! Conseguiste 3 de 8'));
check('failure score line', page.appEl.innerHTML.includes('>3 / 8<'));
check('no bonus on failure', !page.appEl.innerHTML.includes('🎁'));
check('try-again button offered (ES)', page.appEl.innerHTML.includes('data-action="resultsRetry"') && page.appEl.innerHTML.includes('Intentar otra vez'));
d6 = page.ctx.Mates.profileData.get(max.id);
check('no record written on failure', d6.timedBest['mul.3'] === 3 && !('timed.mul.3' in d6.highScores));

/* Try again restarts the same challenge with a fresh goal from profile data. */
page.appEl.click({ dataset: { action: 'resultsRetry' } });
t = page.ctx.Mates.round.peek();
check('retry starts a fresh round at full time', t.timed && t.timeLeft === 45 && t.goal.target === 8 && t.score === 0);
page.ctx.Mates.round.tick(); // 44 s left -> elapsed will be 1 s
for (let i = 0; i < 8; i++) answer(true);
check('retry success beats the old best (ES)', page.appEl.innerHTML.includes('🏆 Más rápido: 1 s'));
d6 = page.ctx.Mates.profileData.get(max.id);
check('faster time replaces the record', d6.timedBest['mul.3'] === 1);
page.appEl.click({ dataset: { action: 'resultsContinue' } });

/* Mixed mode: no level picker, questions span operations, goal still applies */
page.appEl.click({ dataset: { action: 'timedEnter' } });
page.appEl.click({ dataset: { action: 'timedSetOp', op: 'mixed' } });
check('level picker hidden for mixed', !page.appEl.innerHTML.includes('data-action="timedSetLevel"'));
check('goal line still shown for mixed', page.appEl.innerHTML.includes('Objetivo: 8 aciertos en 45 s'));
page.appEl.click({ dataset: { action: 'timedStart' } });

const seenOps = new Set();
page.ctx.Mates.round.tick(); // one second passes so elapsed is 1, not 0
for (let i = 0; i < 8; i++) {
  seenOps.add(page.ctx.Mates.round.peek().question.op);
  answer(true);
}
check('mixed round spans multiple operations', seenOps.size >= 2);
check('mixed success banner (ES)', page.appEl.innerHTML.includes('🎉 ¡Lo lograste!'));
d6 = page.ctx.Mates.profileData.get(max.id);
check('fastest time persisted for mixed', d6.timedBest['mixed'] === 1);

/* Home now lists best challenge times instead of old count-based scores. */
page.appEl.click({ dataset: { action: 'resultsContinue' } });
check('home shows best-times card (ES)', page.appEl.innerHTML.includes('>Récords<'));
check('home lists mul L3 with its best time', page.appEl.innerHTML.includes('× L3') && page.appEl.innerHTML.includes('⏱ 1 s'));

/* ---------- Step 6: gamification (still load 1, ES) ---------- */
console.log('step 6 (gamification)');

/** Play a full 10-question level round; first `correctOf` answers correct. Ends on results screen. */
function levelRound(op, level, correctOf) {
  page.appEl.click({ dataset: { action: 'levelEnter' } });
  page.appEl.click({ dataset: { action: 'levelSetOp', op } });
  page.appEl.click({ dataset: { action: 'levelSetLevel', value: String(level) } });
  page.appEl.click({ dataset: { action: 'levelStart' } });
  for (let i = 0; i < 10; i++) answer(i < correctOf);
}

const P = () => page.ctx.Mates.profileData.get(max.id);

/* Earlier same-day rounds (steps 3–5) already started today's streak at 1. */
check('streak is 1 from earlier same-day rounds', P().currentStreak === 1 && P().lastPracticeDate === page.ctx.Mates.progress.dayKey());

/* Simulate: practiced yesterday with a 4-day streak; perfect round today -> streak 5 + badges */
{
  const d = P();
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  d.lastPracticeDate = page.ctx.Mates.progress.dayKey(yest);
  d.currentStreak = 4; d.bestStreak = 4;
  page.ctx.Mates.profileData.save(max.id, d);
}
levelRound('add', 1, 10);
let d7 = P();
check('streak extended across day rollover (5)', d7.currentStreak === 5 && d7.bestStreak === 5);
check('first-steps earned', d7.badges.includes('first-steps'));
check('sharp-shooter earned on 10/10', d7.badges.includes('sharp-shooter'));
check('on-fire earned at 5-day streak', d7.badges.includes('on-fire'));
check('first-steps + sharp-shooter already earned in step 3 round', d7.badges.includes('first-steps') && d7.badges.includes('sharp-shooter'));
check('results celebrate only the new badge (ES)', page.appEl.innerHTML.includes('¡Nuevas insignias!') && page.appEl.innerHTML.includes('En llamas') && !page.appEl.innerHTML.includes('Puntería fina'));
page.appEl.click({ dataset: { action: 'resultsContinue' } });

/* A 3-day gap resets the streak to 1; best streak is preserved */
{
  const d = P();
  const old = new Date(); old.setDate(old.getDate() - 3);
  d.lastPracticeDate = page.ctx.Mates.progress.dayKey(old);
  d.currentStreak = 7;
  page.ctx.Mates.profileData.save(max.id, d);
}
levelRound('sub', 1, 5);
d7 = P();
check('gap resets streak to 1', d7.currentStreak === 1);
check('best streak preserved (5)', d7.bestStreak === 5);

/* Same-day round does not extend the streak again */
levelRound('add', 1, 0);
d7 = P();
check('same-day round does not extend streak', d7.currentStreak === 1);

/* Lifetime badges: mul at 50+ correct, div just below, then crossed */
{
  const d = P();
  d.stats.mul.correct = 50;
  d.stats.div.correct = 49;
  page.ctx.Mates.profileData.save(max.id, d);
}
levelRound('mul', 1, 3);
d7 = P();
check('table-master earned at 50+ mul correct', d7.badges.includes('table-master'));
check('divvy-up not yet (49 div)', !d7.badges.includes('divvy-up'));
levelRound('div', 1, 1);
d7 = P();
check('divvy-up earned at 50 div correct', d7.badges.includes('divvy-up'));

/* speed-demon: complete a level-5 challenge */
page.appEl.click({ dataset: { action: 'timedEnter' } });
page.appEl.click({ dataset: { action: 'timedSetOp', op: 'add' } });
page.appEl.click({ dataset: { action: 'timedSetLevel', value: '5' } });
page.appEl.click({ dataset: { action: 'timedStart' } });
for (let i = 0; i < 8; i++) answer(true); // goal reached -> level-5 success
d7 = P();
check('speed-demon earned on a level-5 challenge', d7.badges.includes('speed-demon'));
page.appEl.click({ dataset: { action: 'resultsContinue' } });

/* unstoppable: 14-day streak */
{
  const d = P();
  d.currentStreak = 13;
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  d.lastPracticeDate = page.ctx.Mates.progress.dayKey(yest);
  page.ctx.Mates.profileData.save(max.id, d);
}
levelRound('add', 1, 2);
d7 = P();
check('unstoppable earned at 14-day streak', d7.badges.includes('unstoppable') && d7.currentStreak === 14);

/* Home shows stats, badges grid (earned + locked) and high scores */
page.appEl.click({ dataset: { action: 'resultsContinue' } });
check('home shows points label (ES)', page.appEl.innerHTML.includes('>Puntos<'));
check('home badge grid: all 7 earned for Max', (page.appEl.innerHTML.match(/badge-cell earned/g) || []).length === 7 && !page.appEl.innerHTML.includes('badge-cell locked'));
check('home shows high scores summary (ES)', page.appEl.innerHTML.includes('>Récords<'));

/* Leaderboard: second profile, ranked by lifetime points */
page.appEl.click({ dataset: { action: 'switchUser' } });
page.appEl.click({ dataset: { action: 'addProfile' } });
page.appEl.input('Ana');
page.appEl.click({ dataset: { action: 'builderSave' } });
check('home greets Ana', page.appEl.innerHTML.includes('¡Hola, Ana!'));
check('fresh profile: all 7 badges locked', (page.appEl.innerHTML.match(/badge-cell locked/g) || []).length === 7 && !page.appEl.innerHTML.includes('badge-cell earned'));
const maxPts = P().points;
page.appEl.click({ dataset: { action: 'openLeaderboard' } });
const lb = page.appEl.innerHTML;
check('leaderboard ranks Max above Ana (ES title)', lb.includes('Clasificación</h1>') && lb.indexOf('>Max<') < lb.indexOf('>Ana<'));
check('leaderboard shows Max points', lb.includes(String(maxPts)));

/* ---------- Load 2: simulated reload, different browser lang ---------- */
console.log('load 2 (reload, fr-FR browser — saved settings must win)');
page = loadPage({ browserLang: 'fr-FR', systemDark: true });
check('saved language es wins over browser', page.documentElement.lang === 'es');
check('saved dark theme wins over system light pref path', page.documentElement.attrs['data-theme'] === 'dark');
check('profiles screen in ES after reload', page.appEl.innerHTML.includes('¿Quién juega?'));

/* Adaptive level must survive the reload and be used as start level. */
const max2 = page.ctx.Mates.profiles.list().find(p => p.name === 'Max');
page.appEl.click({ dataset: { action: 'selectProfile', id: max2.id } });
page.appEl.click({ dataset: { action: 'adaptiveEnter' } });
page.appEl.click({ dataset: { action: 'adaptiveStart' } }); // default op = add
check('adaptive start level persists across sessions (3)', page.ctx.Mates.round.peek().level === 3);

/* All-correct round from level 3: steps to 4, then 5, then clamps at 5. */
for (let i = 0; i < 10; i++) answer(true);
check('results show clamped level 5 (ES)', page.appEl.innerHTML.includes('Llegaste al nivel 5'));
const d5 = page.ctx.Mates.profileData.get(max2.id);
check('clamped level persisted', d5.adaptiveLevel.add === 5);

/* ---------- Load 3: factory reset — Spanish browser, dark system ---------- */
console.log('load 3 (fresh device, es-ES browser, dark system)');
store.clear();
page = loadPage({ browserLang: 'es-ES', systemDark: true });
check('language auto-detected as es', page.documentElement.lang === 'es');
check('theme follows dark system pref', page.documentElement.attrs['data-theme'] === 'dark');
check('welcome screen in ES on fresh device',
  page.appEl.innerHTML.includes('Práctica de mates acogedora para mentes en crecimiento.'));

/* ---------- Step 7: PWA files (static checks, no browser needed) ---------- */
console.log('step 7 (pwa)');
{
  const manifest = JSON.parse(readFileSync(path.join(WEB, 'manifest.json'), 'utf8'));
  check('manifest: name Mates + standalone', manifest.name === 'Mates' && manifest.display === 'standalone');
  const iconPurposes = manifest.icons.map(i => i.sizes + ':' + i.purpose);
  check('manifest: 192+512 any and maskable icons',
    ['192x192:any', '512x512:any', '192x192:maskable', '512x512:maskable'].every(p => iconPurposes.includes(p)));

  const swSrc = readFileSync(path.join(WEB, 'sw.js'), 'utf8');
  const arrBlock = swSrc.match(/const ASSETS = \[([\s\S]*?)\]/)[1];
  const assets = [...arrBlock.matchAll(/'([^']+)'/g)].map(m => m[1].replace(/^\.\//, ''));
  check('sw precaches a non-empty asset list', assets.length >= 20);
  const missing = assets.filter(a => !existsSync(path.join(WEB, a)));
  check('sw precache list matches files on disk' + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''), missing.length === 0);

  const html = readFileSync(path.join(WEB, 'index.html'), 'utf8');
  check('index.html links manifest + theme-color', html.includes('rel="manifest"') && html.includes('name="theme-color"'));
}

/* ---------- Step 8: i18n completeness (every key used in code exists in both catalogs) ---------- */
console.log('step 8 (i18n parity)');
{
  const jsDirs = ['js', 'js/modes'];
  const used = new Set();
  for (const dir of jsDirs) {
    for (const f of readdirSync(path.join(WEB, dir))) {
      if (!f.endsWith('.js')) continue;
      const src = readFileSync(path.join(WEB, dir, f), 'utf8');
      // Only fully-literal calls: key immediately followed by ")".
      // Concatenated keys (e.g. 'feedback.praise' + n) are built at runtime.
      for (const m of src.matchAll(/Mates\.t\('([^']+)'\)/g)) used.add(m[1]);
    }
  }
  // Dynamic keys: badge/mode nameKey + descKey, and builder partRow labelKey.
  for (const f of ['js/badges.js', 'js/modes/level.js', 'js/modes/adaptive.js', 'js/modes/timed.js', 'js/modes/bomb.js', 'js/modes/bomb-round.js']) {
    const src = readFileSync(path.join(WEB, f), 'utf8');
    for (const m of src.matchAll(/(?:nameKey|descKey):\s*'([^']+)'/g)) used.add(m[1]);
  }
  for (const m of readFileSync(path.join(WEB, 'js/app.js'), 'utf8').matchAll(/partRow\('[^']+',\s*'([^']+)'/g)) {
    used.add(m[1]);
  }

  const catalog = f => {
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(readFileSync(path.join(WEB, f), 'utf8'), sandbox);
    const i18n = sandbox.window.I18N;
    return new Set(Object.keys(i18n.en || i18n.es || {}));
  };
  const en = catalog('js/i18n/en.js');
  const es = catalog('js/i18n/es.js');

  const missingEn = [...used].filter(k => !en.has(k));
  const missingEs = [...used].filter(k => !es.has(k));
  check('i18n: all used keys present in EN' + (missingEn.length ? ' (missing: ' + missingEn.join(', ') + ')' : ''), missingEn.length === 0);
  check('i18n: all used keys present in ES' + (missingEs.length ? ' (missing: ' + missingEs.join(', ') + ')' : ''), missingEs.length === 0);
}

/* ---------- Step 8: edge cases (load 3 page: ES, fresh device) ---------- */
console.log('step 8 (edge cases)');

/* Sound: no AudioContext in this harness — play() must be a silent no-op.
 * Fresh-device defaults have sound ON, so the AudioContext guard is exercised. */
check('sound.play no-ops without AudioContext', (() => {
  try {
    page.ctx.Mates.sound.play('correct');
    page.ctx.Mates.sound.play('wrong');
    page.ctx.Mates.sound.play('badge');
    return true;
  } catch (e) { return false; }
})());

/* Single profile with a very long name: home greeting + leaderboard row. */
const LONG_NAME = 'Abraham'.repeat(8); // 64 chars
page.appEl.click({ dataset: { action: 'welcomeStart' } });
page.appEl.input(LONG_NAME);
page.appEl.click({ dataset: { action: 'builderSave' } });
check('home renders very long name', page.appEl.innerHTML.includes(LONG_NAME));

page.appEl.click({ dataset: { action: 'openLeaderboard' } });
check('single-profile leaderboard has 🥇 row',
  page.appEl.innerHTML.includes('🥇') && page.appEl.innerHTML.includes(LONG_NAME));

/* Storage quota failure: setItem throws — saves must fail soft, not throw. */
check('profileData.save survives quota error', (() => {
  const M = page.ctx.Mates;
  const id = M.profiles.list()[0].id;
  const origSet = page.ctx.localStorage.setItem;
  page.ctx.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  try {
    M.profileData.save(id, { points: 5 });
    return true; // no exception
  } catch (e) {
    return false;
  } finally {
    page.ctx.localStorage.setItem = origSet;
  }
})());

/* ---------- Step 11: Bomb Race (load 3 page: ES, fresh device) ---------- */
console.log('step 11 (bomb race)');

/** Profile data of the long-name profile created in the edge-cases block. */
const PB = () => {
  const M = page.ctx.Mates;
  const p = M.profiles.list().find(p => p.name === LONG_NAME);
  return M.profileData.get(p.id);
};
const longId = page.ctx.Mates.profiles.list().find(p => p.name === LONG_NAME).id;

/* Home shows the Bomb Race mode card. */
page.appEl.click({ dataset: { action: 'backToProfiles' } });
page.appEl.click({ dataset: { action: 'selectProfile', id: longId } });
check('home shows bomb race card (ES)', page.appEl.innerHTML.includes('data-action="bombEnter"') && page.appEl.innerHTML.includes('Bomba de Multiplicaciones'));

/* Map: 20 nodes, quest 1 is the next mission, the rest locked, progress 0/20. */
page.appEl.click({ dataset: { action: 'bombEnter' } });
let map = page.appEl.innerHTML;
check('map renders 20 nodes', (map.match(/bomb-node bomb-node--/g) || []).length === 20);
check('progress chip 0 / 20', map.includes('>0 / 20<'));
check('quest 1 is the next mission', map.includes('bomb-node--next" data-action="bombNode" data-quest="1"'));
check('quest 3 locked and disabled', map.includes('bomb-node--locked" disabled data-action="bombNode" data-quest="3"'));

/* Quest 1: ordered 1×1…1×10 with one countdown for the whole quest. */
const ptsBeforeQ1 = PB().points;
page.appEl.click({ dataset: { action: 'bombNode', quest: '1' } });
let rt = page.ctx.Mates.round.peek();
check('quest starts as a timed round of its ten questions', rt.timed && rt.count === 10 && rt.timeLeft === 60 && rt.bomb.quest === 1);
page.ctx.Mates.round.tick(); // one second passes so elapsed is 1, not 0
let orderedOk = true;
for (let i = 1; i <= 10; i++) {
  const q = page.ctx.Mates.round.peek().question; // peek BEFORE answering
  if (q.a !== 1 || q.op !== '×' || q.b !== i) orderedOk = false;
  answer(true);
}
check('quest 1 runs the ordered pairs 1×1…1×10', orderedOk);
check('bomb success banner (ES)', page.appEl.innerHTML.includes('🎉 ¡Lo lograste!'));
check('elapsed time shown (en 1 s)', page.appEl.innerHTML.includes('en 1 s'));
check('score line 10 / 10', page.appEl.innerHTML.includes('>10 / 10<'));
check('first-clear bonus +50 shown (ES)', page.appEl.innerHTML.includes('🎁 +50 puntos extra'));
check('points line includes the bonus (+150)', page.appEl.innerHTML.includes('+150 puntos'));
let dB = PB();
check('points: score×10 + 50 first-clear bonus', dB.points === ptsBeforeQ1 + 150);
check('quest 1 completed, frontier advanced to 1', dB.bombRace.completed.join(',') === '1' && dB.bombRace.frontier === 1);
page.appEl.click({ dataset: { action: 'resultsContinue' } });
map = page.appEl.innerHTML;
check('continue returns to the map', map.includes('Bomba de Multiplicaciones'));
check('node 1 done, node 2 next, progress 1 / 20',
  map.includes('bomb-node--done" data-action="bombNode" data-quest="1"') &&
  map.includes('bomb-node--next" data-action="bombNode" data-quest="2"') &&
  map.includes('>1 / 20<'));

/* Quest 2: the same ten pairs of table 1 (quests 1-2 = table 1), shuffled. */
page.appEl.click({ dataset: { action: 'bombNode', quest: '2' } });
rt = page.ctx.Mates.round.peek();
check('quest 2 is a shuffled repeat of table 1 with full time', rt.bomb.quest === 2 && rt.timeLeft === 60);
const bSeen = new Set();
let shuffleOk = true;
for (let i = 0; i < 10; i++) {
  const q = page.ctx.Mates.round.peek().question; // peek BEFORE answering
  if (q.a !== 1 || q.op !== '×') shuffleOk = false;
  bSeen.add(q.b);
  answer(true);
}
check('quest 2 holds all ten pairs of table 1', shuffleOk && bSeen.size === 10);
check('second first-clear also earns +50 (ES)', page.appEl.innerHTML.includes('🎁 +50 puntos extra'));
dB = PB();
check('completed [1,2], frontier 2', dB.bombRace.completed.join(',') === '1,2' && dB.bombRace.frontier === 2);
page.appEl.click({ dataset: { action: 'resultsContinue' } });

/* Quest 3: timeout -> explosion; the next quest is still unlocked. */
page.appEl.click({ dataset: { action: 'bombNode', quest: '3' } });
for (let i = 0; i < 4; i++) answer(true);
for (let i = 0; i < 60; i++) page.ctx.Mates.round.tick();
check('bomb fail banner (ES)', page.appEl.innerHTML.includes('💥 ¡La bomba explotó! Conseguiste 4 de 10'));
check('fail score line 4 / 10', page.appEl.innerHTML.includes('>4 / 10<'));
check('no bonus on failure', !page.appEl.innerHTML.includes('🎁'));
check('retry offered (ES)', page.appEl.innerHTML.includes('data-action="resultsRetry"') && page.appEl.innerHTML.includes('Intentar otra vez'));
dB = PB();
check('failure still unlocks the next quest (frontier 3)', dB.bombRace.frontier === 3);
check('completed unchanged after failure', dB.bombRace.completed.join(',') === '1,2');

/* Retry restarts the same quest with a fresh full countdown. */
page.appEl.click({ dataset: { action: 'resultsRetry' } });
rt = page.ctx.Mates.round.peek();
check('retry: fresh round, same quest, full time', rt.bomb.quest === 3 && rt.timeLeft === 60 && rt.score === 0);
for (let i = 0; i < 10; i++) answer(true);
dB = PB();
check('retried quest completed with its first-clear bonus', dB.bombRace.completed.join(',') === '1,2,3' && page.appEl.innerHTML.includes('🎁 +50 puntos extra'));
page.appEl.click({ dataset: { action: 'resultsContinue' } });
map = page.appEl.innerHTML;
check('node 3 done, node 4 next, progress 3 / 20',
  map.includes('bomb-node--done" data-action="bombNode" data-quest="3"') &&
  map.includes('bomb-node--next" data-action="bombNode" data-quest="4"') &&
  map.includes('>3 / 20<'));

/* Replay a completed quest: points, but no second bonus. */
const ptsBeforeReplay = PB().points;
page.appEl.click({ dataset: { action: 'bombNode', quest: '1' } });
for (let i = 0; i < 10; i++) answer(true);
check('replay success has no bonus line', !page.appEl.innerHTML.includes('🎁'));
check('replay earns score points only (+100)', page.appEl.innerHTML.includes('+100 puntos') && PB().points === ptsBeforeReplay + 100);
dB = PB();
check('no duplicate in the completed list', dB.bombRace.completed.filter(q => q === 1).length === 1);
page.appEl.click({ dataset: { action: 'resultsContinue' } });
check('continue from a replay returns to the map', page.appEl.innerHTML.includes('Bomba de Multiplicaciones'));

/* Per-profile bomb time: default 60 s, step ±5 s, clamped to 20–300 s. */
page.appEl.click({ dataset: { action: 'bombBack' } }); // map -> home
page.appEl.click({ dataset: { action: 'switchUser' } }); // home -> profiles
page.appEl.click({ dataset: { action: 'openProfileSettings', id: longId } });
let s = page.appEl.innerHTML;
check('bomb time row defaults to 60 s', s.includes('>60<'));
page.appEl.click({ dataset: { action: 'goalStep', field: 'bombTime', delta: '5' } });
check('stepper +5 -> 65 s', page.appEl.innerHTML.includes('>65<'));
page.appEl.click({ dataset: { action: 'goalStep', field: 'bombTime', delta: '-5' } });
check('stepper -5 back to 60 s', page.appEl.innerHTML.includes('>60<'));
{
  const d = PB(); d.bombTime = 15;
  page.ctx.Mates.profileData.save(longId, d);
  page.ctx.Mates.router.refresh();
}
s = page.appEl.innerHTML;
check('bomb time clamped to the 20 s minimum', s.includes('>20<') && s.includes('data-field="bombTime" data-delta="-5" disabled'));
{
  const d = PB(); d.bombTime = 400;
  page.ctx.Mates.profileData.save(longId, d);
  page.ctx.Mates.router.refresh();
}
s = page.appEl.innerHTML;
check('bomb time clamped to the 300 s maximum', s.includes('>300<') && s.includes('data-field="bombTime" data-delta="5" disabled'));

/* A new quest uses the configured bomb time. */
{
  const d = PB(); d.bombTime = 45;
  page.ctx.Mates.profileData.save(longId, d);
}
page.appEl.click({ dataset: { action: 'profileSettingsBack' } }); // -> profiles
page.appEl.click({ dataset: { action: 'selectProfile', id: longId } });
page.appEl.click({ dataset: { action: 'bombEnter' } });
page.appEl.click({ dataset: { action: 'bombNode', quest: '4' } });
rt = page.ctx.Mates.round.peek();
check('new quest uses the configured bomb time (45 s)', rt.bomb.quest === 4 && rt.timeLeft === 45);

/* ---------- Step 13: Approximation Bomb Race ---------- */
console.log('step 13 (approximation bomb race)');

/* Finish the multiplication quest 4 left open by step 11 — also a regression
 * check that mul quests still use the table-pairs path after the engine was
 * generalized to accept caller-supplied question lists. */
for (let i = 0; i < 10; i++) answer(true);
check('mul quest 4 completes after engine generalization', page.appEl.innerHTML.includes('>10 / 10<'));
page.appEl.click({ dataset: { action: 'resultsContinue' } });

/* Quest-level generator invariants for all 10 levels. */
const RQ_LEVELS = [
  { lv: 1, targets: ['ten'], ranges: { ten: [1, 9] } },
  { lv: 2, targets: ['ten'], ranges: { ten: [11, 99] } },
  { lv: 3, targets: ['ten'], ranges: { ten: [101, 999] } },
  { lv: 4, targets: ['hundred'], ranges: { hundred: [111, 999] } },
  { lv: 5, targets: ['hundred'], ranges: { hundred: [1001, 9899] } },
  { lv: 6, targets: ['thousand'], ranges: { thousand: [2001, 8999] } },
  { lv: 7, targets: ['ten', 'hundred'], ranges: { ten: [101, 999], hundred: [111, 999] } },
  { lv: 8, targets: ['hundred', 'thousand'], ranges: { hundred: [1001, 9899], thousand: [2001, 8999] } },
  { lv: 9, targets: ['ten', 'hundred', 'thousand'], ranges: { ten: [11, 999], hundred: [111, 9899], thousand: [2001, 8999] } },
  { lv: 10, targets: ['ten', 'hundred', 'thousand'], ranges: { ten: [101, 999], hundred: [111, 9899], thousand: [2001, 8999] } }
];
RQ_LEVELS.forEach(({ lv, targets, ranges }) =>
  assertAll('round quest L' + lv, Array.from({ length: 60 }, () => Q.genRoundQuest(lv)), q => {
    const step = q.target === 'ten' ? 10 : (q.target === 'hundred' ? 100 : 1000);
    const range = ranges[q.target];
    return targets.includes(q.target) && q.value >= range[0] && q.value <= range[1] &&
      q.value % step !== 0 && q.op === '≈' &&
      q.answer === Math.round(q.value / step) * step && q.answer <= 9999;
  }));

/* Mixed levels actually draw more than one target. */
check('quest L7 mixes ten/hundred', new Set(Array.from({ length: 200 }, () => Q.genRoundQuest(7)).map(q => q.target)).size === 2);
check('quest L9 draws all three targets', new Set(Array.from({ length: 300 }, () => Q.genRoundQuest(9)).map(q => q.target)).size === 3);

/* Ten unique questions per quest (random per attempt, unlike the mul tables). */
{
  const qs = Q.roundQuestQuestions(5);
  check('quest questions: 10 unique', qs.length === 10 && new Set(qs.map(q => q.value + q.op + q.target)).size === 10);
}

/* Profile data defaults cover the new race. */
check('profile data has bombRound defaults', (() => { const d = PB(); return d.bombRound.frontier === 0 && d.bombRound.completed.length === 0; })());

/* Home shows the new mode card (ES). */
page.appEl.click({ dataset: { action: 'bombBack' } }); // map -> home
let rhome = page.appEl.innerHTML;
check('home shows approximation bomb race card (ES)', rhome.includes('data-action="bombRoundEnter"') && rhome.includes('Bomba de Redondeo'));

/* Map: 10 nodes, quest 1 is the next mission, the rest locked, progress 0/10. */
page.appEl.click({ dataset: { action: 'bombRoundEnter' } });
let rmap = page.appEl.innerHTML;
check('round map renders 10 nodes', (rmap.match(/bomb-node bomb-node--/g) || []).length === 10);
check('round map progress chip 0 / 10', rmap.includes('>0 / 10<'));
check('quest 1 is the next mission', rmap.includes('bomb-node--next" data-action="bombRoundNode" data-quest="1"'));
check('quest 3 locked and disabled', rmap.includes('bomb-node--locked" disabled data-action="bombRoundNode" data-quest="3"'));

/* Quest 1: single digits to the ten, one countdown for the whole quest.
 * The race reuses the shared per-profile bomb time (set back to 60 first). */
{ const d = PB(); d.bombTime = 60; page.ctx.Mates.profileData.save(longId, d); }
const ptsBeforeR1 = PB().points;
page.appEl.click({ dataset: { action: 'bombRoundNode', quest: '1' } });
let rrt = page.ctx.Mates.round.peek();
check('quest 1 starts as a timed round of ten rounding questions',
  rrt.timed && rrt.count === 10 && rrt.timeLeft === 60 && rrt.bomb.quest === 1 && rrt.op === 'round');
page.ctx.Mates.round.tick(); // one second passes so elapsed is 1, not 0
let l1ok = true;
for (let i = 0; i < 10; i++) {
  const q = page.ctx.Mates.round.peek().question; // peek BEFORE answering
  if (!(q.target === 'ten' && q.value >= 1 && q.value <= 9)) l1ok = false;
  answer(true);
}
check('quest 1 runs single digits to the ten', l1ok);
check('bomb success banner (ES)', page.appEl.innerHTML.includes('🎉 ¡Lo lograste!'));
check('elapsed time shown (en 1 s)', page.appEl.innerHTML.includes('en 1 s'));
check('score line 10 / 10', page.appEl.innerHTML.includes('>10 / 10<'));
check('first-clear bonus +50 shown (ES)', page.appEl.innerHTML.includes('🎁 +50 puntos extra'));
{
  const d = PB();
  check('points: score×10 + 50 first-clear bonus', d.points === ptsBeforeR1 + 150);
  check('quest 1 completed, frontier advanced to 1', d.bombRound.completed.join(',') === '1' && d.bombRound.frontier === 1);
}
page.appEl.click({ dataset: { action: 'resultsContinue' } });
rmap = page.appEl.innerHTML;
check('continue returns to the round map', rmap.includes('Bomba de Redondeo'));
check('node 1 done, node 2 next, progress 1 / 10',
  rmap.includes('bomb-node--done" data-action="bombRoundNode" data-quest="1"') &&
  rmap.includes('bomb-node--next" data-action="bombRoundNode" data-quest="2"') &&
  rmap.includes('>1 / 10<'));

/* Quest 2 uses the configured shared bomb time; two digits to the ten. */
{ const d = PB(); d.bombTime = 45; page.ctx.Mates.profileData.save(longId, d); }
page.appEl.click({ dataset: { action: 'bombRoundNode', quest: '2' } });
rrt = page.ctx.Mates.round.peek();
check('quest 2 uses the configured bomb time (45 s)', rrt.bomb.quest === 2 && rrt.timeLeft === 45);
let l2ok = true;
for (let i = 0; i < 10; i++) {
  const q = page.ctx.Mates.round.peek().question;
  if (!(q.target === 'ten' && q.value >= 11 && q.value <= 99)) l2ok = false;
  answer(true);
}
check('quest 2 runs two digits to the ten', l2ok);
{
  const d = PB();
  check('completed [1,2], frontier 2', d.bombRound.completed.join(',') === '1,2' && d.bombRound.frontier === 2);
}
page.appEl.click({ dataset: { action: 'resultsContinue' } });

/* Quest 3: timeout -> explosion; the next quest is still unlocked. */
page.appEl.click({ dataset: { action: 'bombRoundNode', quest: '3' } });
for (let i = 0; i < 3; i++) answer(true);
answer(false); // one wrong, so correct < answered in the stats check below
for (let i = 0; i < 45; i++) page.ctx.Mates.round.tick();
check('round bomb fail banner (ES)', page.appEl.innerHTML.includes('💥 ¡La bomba explotó! Conseguiste 3 de 10'));
check('fail score line 3 / 10', page.appEl.innerHTML.includes('>3 / 10<'));
check('no bonus on failure', !page.appEl.innerHTML.includes('🎁'));
check('retry offered (ES)', page.appEl.innerHTML.includes('data-action="resultsRetry"') && page.appEl.innerHTML.includes('Intentar otra vez'));
{
  const d = PB();
  check('failure still unlocks the next quest (frontier 3)', d.bombRound.frontier === 3);
  check('completed unchanged after failure', d.bombRound.completed.join(',') === '1,2');
}

/* Retry restarts the same quest with a fresh full countdown. */
page.appEl.click({ dataset: { action: 'resultsRetry' } });
rrt = page.ctx.Mates.round.peek();
check('retry: fresh round, same quest, full time', rrt.bomb.quest === 3 && rrt.timeLeft === 45 && rrt.score === 0);
for (let i = 0; i < 10; i++) answer(true);
{
  const d = PB();
  check('retried quest completed with its first-clear bonus', d.bombRound.completed.join(',') === '1,2,3' && page.appEl.innerHTML.includes('🎁 +50 puntos extra'));
}
page.appEl.click({ dataset: { action: 'resultsContinue' } });

/* Replay a completed quest: points, but no second bonus. */
const ptsBeforeRReplay = PB().points;
page.appEl.click({ dataset: { action: 'bombRoundNode', quest: '1' } });
for (let i = 0; i < 10; i++) answer(true);
check('replay success has no bonus line', !page.appEl.innerHTML.includes('🎁'));
check('replay earns score points only (+100)', page.appEl.innerHTML.includes('+100 puntos') && PB().points === ptsBeforeRReplay + 100);
{
  const d = PB();
  check('no duplicate in the completed list', d.bombRound.completed.filter(q => q === 1).length === 1);
  // stats.round fed by the race: 10+10+(3+1)+10+10 answered, one wrong on the failed attempt.
  check('rounding stats fed by the race (44 answered / 43 correct)', d.stats.round.answered === 44 && d.stats.round.correct === 43);
}
page.appEl.click({ dataset: { action: 'resultsContinue' } });
check('continue from a replay returns to the round map', page.appEl.innerHTML.includes('Bomba de Redondeo'));

console.log(failures === 0 ? '\nAll smoke tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
