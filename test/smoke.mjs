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
page.appEl.click({ dataset: { action: 'builderSurprise' } });
page.appEl.click({ dataset: { action: 'builderSetPart', part: 'hair', value: '3' } });
page.appEl.click({ dataset: { action: 'builderSetPart', part: 'hairColor', value: '6' } });
page.appEl.input('Luna');
page.appEl.click({ dataset: { action: 'builderSave' } });
check('home screen greets Luna (EN)', page.appEl.innerHTML.includes('Hi, Luna!'));

let profiles = page.ctx.Mates.profiles.list();
check('one profile created', profiles.length === 1 && profiles[0].name === 'Luna');
check('avatar config persisted', profiles[0].avatar.hair === 3 && profiles[0].avatar.hairColor === 6);
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
  return r.face < 3 && r.skin < 6 && r.hair < 6 && r.hairColor < 7 && r.eyes < 3 && r.mouth < 3;
})());

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

/* ---------- Step 5: timed challenge (still load 1, ES) ---------- */
console.log('step 5 (timed challenge)');

page.appEl.click({ dataset: { action: 'timedEnter' } });
check('timed setup screen (ES)', page.appEl.innerHTML.includes('Reto contrarreloj</h1>'));
page.appEl.click({ dataset: { action: 'timedSetOp', op: 'mul' } });
page.appEl.click({ dataset: { action: 'timedSetLevel', value: '3' } });
check('level picker visible for single operation', page.appEl.innerHTML.includes('data-action="timedSetLevel"'));
page.appEl.click({ dataset: { action: 'timedStart' } });

let t = page.ctx.Mates.round.peek();
check('timed round starts at 60 s', t.timed && t.timeLeft === 60);
check('countdown shown in round header', page.appEl.innerHTML.includes('⏱ 60'));
check('score chip present in timed round', page.appEl.innerHTML.includes('score-chip'));

answer(true); answer(true); answer(true);
t = page.ctx.Mates.round.peek();
check('instant confirm: score 3 without waiting', t.score === 3 && t.timeLeft === 60);
answer(false);
check('wrong answer keeps score at 3', page.ctx.Mates.round.peek().score === 3);

/* Ticks and key presses must update the screen in place, not re-render it:
 *  a full innerHTML swap per event makes the round visibly flicker. */
let refreshes = 0;
const origRefresh = page.ctx.Mates.router.refresh;
page.ctx.Mates.router.refresh = function () { refreshes++; return origRefresh.apply(this, arguments); };
for (let i = 0; i < 59; i++) page.ctx.Mates.round.tick();
check('timer ticks do not re-render the round screen', refreshes === 0);
['1', '2', '3'].forEach(d => page.appEl.click({ dataset: { action: 'keypad', key: d } }));
page.appEl.click({ dataset: { action: 'keypad', key: 'back' } });
page.appEl.click({ dataset: { action: 'keypad', key: 'back' } });
page.appEl.click({ dataset: { action: 'keypad', key: 'back' } });
check('keypad presses do not re-render the round screen', refreshes === 0);
page.ctx.Mates.router.refresh = origRefresh;
check('one second left before end', page.ctx.Mates.round.peek().timeLeft === 1);
page.ctx.Mates.round.tick();
check('timer end renders results with bare score', page.appEl.innerHTML.includes('results-score">3<'));
check('new record celebration (ES)', page.appEl.innerHTML.includes('¡Nuevo récord!'));
check('answered count shown (ES)', page.appEl.innerHTML.includes('4 preguntas respondidas'));
check('timed points shown (+30, ES)', page.appEl.innerHTML.includes('+30 puntos'));
let d6 = page.ctx.Mates.profileData.get(max.id);
check('high score persisted for timed.mul.3', d6.highScores['timed.mul.3'] === 3);
page.appEl.click({ dataset: { action: 'resultsContinue' } });

/* Second timed round, lower score: shows best, no new record */
page.appEl.click({ dataset: { action: 'timedEnter' } });
page.appEl.click({ dataset: { action: 'timedSetOp', op: 'mul' } });
page.appEl.click({ dataset: { action: 'timedSetLevel', value: '3' } });
page.appEl.click({ dataset: { action: 'timedStart' } });
answer(true);
for (let i = 0; i < 60; i++) page.ctx.Mates.round.tick();
check('best shown instead of new record (ES)', page.appEl.innerHTML.includes('Mejor: 3') && !page.appEl.innerHTML.includes('¡Nuevo récord!'));
d6 = page.ctx.Mates.profileData.get(max.id);
check('high score unchanged after lower run', d6.highScores['timed.mul.3'] === 3);
page.appEl.click({ dataset: { action: 'resultsContinue' } });

/* Mixed mode: no level picker, questions span operations */
page.appEl.click({ dataset: { action: 'timedEnter' } });
page.appEl.click({ dataset: { action: 'timedSetOp', op: 'mixed' } });
check('level picker hidden for mixed', !page.appEl.innerHTML.includes('data-action="timedSetLevel"'));
page.appEl.click({ dataset: { action: 'timedStart' } });

const seenOps = new Set();
for (let i = 0; i < 8; i++) {
  seenOps.add(page.ctx.Mates.round.peek().question.op);
  answer(true);
}
check('mixed round spans multiple operations', seenOps.size >= 2);
for (let i = 0; i < 60; i++) page.ctx.Mates.round.tick();
d6 = page.ctx.Mates.profileData.get(max.id);
check('high score persisted for timed.mixed', d6.highScores['timed.mixed'] === 8);

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

/* speed-demon: 20 correct in one timed round */
page.appEl.click({ dataset: { action: 'timedEnter' } });
page.appEl.click({ dataset: { action: 'timedSetOp', op: 'mixed' } });
page.appEl.click({ dataset: { action: 'timedStart' } });
for (let i = 0; i < 20; i++) answer(true);
for (let i = 0; i < 60; i++) page.ctx.Mates.round.tick();
d7 = P();
check('speed-demon earned at 20 timed correct', d7.badges.includes('speed-demon'));
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
  for (const f of ['js/badges.js', 'js/modes/level.js', 'js/modes/adaptive.js', 'js/modes/timed.js']) {
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

console.log(failures === 0 ? '\nAll smoke tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
