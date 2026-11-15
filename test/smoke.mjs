/* Mates — smoke test harness.
 * Loads the app scripts in a vm context with a minimal fake DOM
 * and a shared localStorage stub, then simulates user clicks.
 * Run: node test/smoke.mjs */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCRIPTS = [
  'js/i18n/en.js',
  'js/i18n/es.js',
  'js/i18n.js',
  'js/avatar.js',
  'js/storage.js',
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
    confirm: () => true // auto-accept delete confirmations
  };
  sandbox.window = sandbox; // window === globalThis, like in a browser
  vm.createContext(sandbox);

  for (const rel of SCRIPTS) {
    const code = readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, sandbox, { filename: rel });
  }

  return { appEl, documentElement, ctx: sandbox };
}

/* ---------- Load 1: first run, English browser, light system ---------- */
console.log('load 1 (first run, en-US, light system)');
let page = loadPage({ browserLang: 'en-US', systemDark: false });
check('theme defaults to light via system', page.documentElement.attrs['data-theme'] === 'light');
check('language auto-detected as en', page.documentElement.lang === 'en');
check('profiles screen rendered', page.appEl.innerHTML.includes("Who's playing?"));
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

/* Profiles screen: empty state + add card */
page.appEl.click({ dataset: { action: 'backToProfiles' } });
check('empty state shown', page.appEl.innerHTML.includes('Todavía no hay perfiles'));
check('add-profile card present', page.appEl.innerHTML.includes('data-action="addProfile"'));

/* Builder flow: surprise -> pick parts -> name -> save */
page.appEl.click({ dataset: { action: 'addProfile' } });
check('builder screen rendered', page.appEl.innerHTML.includes('Nuevo perfil</h1>'));
page.appEl.click({ dataset: { action: 'builderSurprise' } });
page.appEl.click({ dataset: { action: 'builderSetPart', part: 'hair', value: '3' } });
page.appEl.click({ dataset: { action: 'builderSetPart', part: 'hairColor', value: '6' } });
page.appEl.input('Luna');
page.appEl.click({ dataset: { action: 'builderSave' } });
check('home screen greets Luna (ES)', page.appEl.innerHTML.includes('¡Hola, Luna!'));

let profiles = page.ctx.Mates.profiles.list();
check('one profile created', profiles.length === 1 && profiles[0].name === 'Luna');
check('avatar config persisted', profiles[0].avatar.hair === 3 && profiles[0].avatar.hairColor === 6);
check('profile data initialized', page.ctx.Mates.profileData.get(profiles[0].id).points === 0);

/* Second profile, then delete the first */
page.appEl.click({ dataset: { action: 'switchUser' } });
check('profiles grid shows Luna card', page.appEl.innerHTML.includes('>Luna<'));
page.appEl.click({ dataset: { action: 'addProfile' } });
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

/* ---------- Load 2: simulated reload, different browser lang ---------- */
console.log('load 2 (reload, fr-FR browser — saved settings must win)');
page = loadPage({ browserLang: 'fr-FR', systemDark: true });
check('saved language es wins over browser', page.documentElement.lang === 'es');
check('saved dark theme wins over system light pref path', page.documentElement.attrs['data-theme'] === 'dark');
check('profiles screen in ES after reload', page.appEl.innerHTML.includes('¿Quién juega?'));

/* ---------- Load 3: factory reset — Spanish browser, dark system ---------- */
console.log('load 3 (fresh device, es-ES browser, dark system)');
store.clear();
page = loadPage({ browserLang: 'es-ES', systemDark: true });
check('language auto-detected as es', page.documentElement.lang === 'es');
check('theme follows dark system pref', page.documentElement.attrs['data-theme'] === 'dark');
check('profiles screen in ES', page.appEl.innerHTML.includes('¿Quién juega?'));

console.log(failures === 0 ? '\nAll smoke tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
