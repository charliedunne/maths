# Mates — Build Plan

## How to resume after a context loss
1. Read this file top to bottom (it is the single source of truth).
2. Find **Current status** → the step in progress.
3. Work on the first unchecked box under that step, top to bottom.
4. When all boxes of a step are done: mark them `[x]`, update **Current status**, and `git commit` (user=charliedunne, email=charlie.dunne@gmail.com).

## Current status
- Step in progress: **Step 9 — Capacitor → Android APK** (only box 5 left: debug APK build, blocked on this machine)
- Last updated: 2026-11-15 — Steps 1–8 complete; Step 10 (goal-based timed challenge) complete: per-profile goal editor (⚙ steppers), early end on success/failure + Try again, fastest-time records (`timedBest`), +20 success bonus, speed-demon redefined to "complete a level-5 challenge". 162 smoke assertions pass. Remaining: build the debug APK on a machine with Java 17 + Android SDK (Step 9 box 5).

### Corrections made while working
- **Router design**: instead of static screen containers in `index.html`, the app uses a render-on-demand router (`Mates.screens` = map of render functions; `Mates.router.go(name)` swaps `#app` innerHTML). Simpler, and language/theme re-render is just `router.refresh()`. All clicks go through one delegated listener on `[data-action]` elements.
- **Shared round engine**: added `js/round.js` (not in the original layout) — one round engine + round/results screens shared by level, adaptive and timed modes. Modes register in `Mates.modes` (home renders them) and pass a cfg to `Mates.round.start()`. Load order: questions → round → modes → app; all files merge into `Mates.screens`/`Mates.actions` instead of overwriting.
- **Testing**: no browser available in the dev environment — verification uses `test/smoke.mjs` (Node vm + fake DOM + shared localStorage stub, controllable setTimeout/setInterval), run with `node test/smoke.mjs`. Visual/real-device checks are left to the user.
- **webDir = `www/`** (user-approved): Capacitor 8 rejects `webDir: "."` (`checkWebDir` in `@capacitor/cli` bans `''`, `'.'`, `'..'`, `'../'`, `'./'`), so all web assets moved into `www/` (index.html, js/, css/, icons/, manifest.json, sw.js) and `webDir: "www"`. Side benefit: server deployment is just "serve `www/`". Smoke harness reads app files from `WEB = ROOT/www`.
- **In-place round updates (flicker fix)**: the round screen is fully rendered only once on entry (`router.go('round')`). Every later update patches existing nodes in place — `patchTimer()` (clock), `patchAnswer()` (digit/backspace presses) and `patchRound()` (after submit/advance: counter/clock, score chip, level chip, question, answer, feedback) targeting IDs `#roundTimer`, `#roundScore`, `#roundLevelChip`, `#roundQuestion`, `#roundAnswer`, `#roundFeedback`. A full innerHTML swap per tick or keypress replaced all DOM nodes and made the screen visibly blink. Regression: smoke.mjs wraps a full 10-question level round and the timed tick/keypad loops in a `router.refresh` spy — exactly one re-render (results navigation) and zero respectively.

---

## 1. Spec summary
Web app for primary-school maths practice (ages 5–11). **Arithmetic only**: addition, subtraction, multiplication, division. Three practice modes: fixed levels, adaptive difficulty, timed challenges. Installable PWA, fully offline, no backend — named local profiles in `localStorage`. Bilingual **EN/ES**, user-selectable **light/dark** cozy themes, layered-SVG **avatar builder** (face, skin, hair, hair color, eyes, mouth). Gamification: points, daily streaks, badges, local leaderboard between profiles on the same device. Later: Android APK via Capacitor.

## 2. Key decisions & conventions (read before coding)
- **Stack**: vanilla JS + HTML/CSS only. No build step, no dependencies, no framework.
- **i18n rule (hard)**: every user-facing string goes through `t(key)` from the i18n catalogs. Never hardcode UI text in HTML/JS. Both `en` and `es` must be complete for every screen before a step is done.
- **Themes**: all colors as CSS custom properties — light defaults on `:root`, dark under `[data-theme="dark"]`. Cozy palettes: light = warm cream/soft peach; dark = deep warm navy/brown (never pure black, never harsh white). Default follows system preference; user override persisted.
- **Persistence**: `localStorage` only, JSON values, keys: `mates.settings`, `mates.profiles`, `mates.profile.<id>`.
- **Points**: 10 pts per correct answer (all modes), lifetime total per profile. Goal-based challenge success adds a +20 bonus.
- **Streaks**: at least one completed round per calendar day keeps the streak alive; track current + best.
- **Questions**: answers always non-negative and exact (no negatives, no remainders). No immediate duplicate questions within a round.
- **Touch-first UI**: big buttons (≥ 48 px targets), on-screen number keypad in practice, minimal text.

### Level table (per operation)
| Level | Addition / Subtraction | Multiplication | Division |
|---|---|---|---|
| 1 | within 10 | tables of 2, 5, 10 | exact, within those tables |
| 2 | within 20 (carry/borrow) | tables of 3, 4, 6 | exact, divisors up to 9 |
| 3 | within 100 | tables of 7, 8, 9 | 2-digit ÷ 1-digit, exact |
| 4 | within 1,000 | mixed tables 2–12 | larger exact division |
| 5 | 3-digit + 3-digit | 2-digit × 1-digit | challenging exact division |

### Adaptive rules
Start at the profile's saved level for that operation (default 2). Step **up** after 3 consecutive correct, step **down** after 2 wrong. Clamp to 1–5. Round = 10 questions. Save the reached level back to the profile.

### Timed challenge (goal-based, Step 10)
Reach **N correct within T seconds**. N and T are a per-profile goal (`timedGoal: { target, time }`, default 8 / 45 s), editable on the `profileSettings` screen via +/− steppers (⚙ button on each profile card; steps ±1 target / ±5 s time; limits target 1–30, time 10–300 s). Pick operation + level, or "mixed" (all four operations at fixed level 2) — the goal applies to all. Instant confirm per answer, auto-advance — no delay, so a quick ✓/✗ pop (`#roundFlash`, 500 ms CSS animation on the round card) is the visual right/wrong indication alongside the sound. Wrong answers have no penalty. The round ends early when the target is reached (success → 🎉 banner + elapsed time + fastest-time record; failure at 0 s below target → encouraging message + Try again). Points = score × 10, plus a +20 success bonus. Best time per key (`timedBest`, seconds, lower is better, success only) replaces the old count-based high scores — obsolete `timed.*` keys are stripped by a read-time migration in `profileData.get()`.

### Badges
| id | Condition |
|---|---|
| first-steps | complete first round |
| sharp-shooter | 10/10 in a level-mode round |
| speed-demon | complete a level-5 challenge (goal-based success) |
| table-master | 50 lifetime correct multiplications |
| divvy-up | 50 lifetime correct divisions |
| on-fire | 5-day streak |
| unstoppable | 14-day streak |

### Data model
```
mates.settings = { language: 'en'|'es', theme: 'light'|'dark'|'system', sound: true|false }
mates.profiles = [{ id, name, avatar, createdAt }]
mates.profile.<id> = {
  points: number,
  currentStreak: number, bestStreak: number, lastPracticeDate: 'YYYY-MM-DD'|null,
  badges: [badgeId],
  stats: { add:{answered,correct}, sub:{...}, mul:{...}, div:{...} },
  highScores: { 'level.<op>.<level>': score },
  timedGoal: { target: 1-30, time: 10-300 },        // challenge goal (default 8 / 45 s)
  timedBest: { '<op>.<level>'|'mixed': seconds },   // fastest time to reach the goal (lower is better)
  adaptiveLevel: { add:1-5, sub:1-5, mul:1-5, div:1-5 }
}
avatar = { face:0-2, skin:0-5, hair:0-5 (0=bald), hairColor:0-6, eyes:0-2, mouth:0-2 }
```

### Avatar parts (cozy style: rounded shapes, soft warm colors, rosy cheeks)
- face: round · soft square · oval (3)
- skin: 6 warm tones, light → deep
- hair: bald · short · curly · long · pigtails · bob (6)
- hairColor: blonde · brown · black · auburn · grey · blue · pink (7)
- eyes: dot · happy arcs · wide (3)
- mouth: smile · big grin · open smile (3)

### File layout
```
index.html            # app shell, screen containers
manifest.json         # PWA manifest ("Mates")
sw.js                 # service worker, cache-first
css/styles.css        # design tokens + all styles
js/app.js             # boot, screen router
js/storage.js         # localStorage helpers, settings, profiles, profile data
js/i18n.js            # t(key) helper
js/i18n/en.js         # EN catalog (window.I18N.en)
js/i18n/es.js         # ES catalog (window.I18N.es)
js/avatar.js          # SVG part library + renderAvatar(config, size)
js/questions.js       # generators per operation × level
js/badges.js          # badge definitions + checkBadges()
js/modes/level.js     # fixed-level mode
js/modes/adaptive.js  # adaptive mode
js/modes/timed.js     # timed challenge
icons/                # PNG icons (PWA 192/512/maskable, Android adaptive)
```

### Screen flow
boot → profile select → (avatar builder / create profile) → home menu [Level · Adaptive · Timed · Leaderboard · Settings] → practice round → results → home.

---

## 3. Steps

### Step 1 — Scaffold: shell, i18n, themes ✅
- [x] `git init` + `.gitignore` (node_modules, dist)
- [x] Create file layout from section 2 (remaining files created in their own steps)
- [x] `index.html`: app shell (`#app` container; screens rendered on demand — see corrections); scripts loaded in dependency order
- [x] `css/styles.css`: design tokens for light + dark cozy palettes; base styles (rounded corners, soft shadows, big touch targets)
- [x] `js/i18n/en.js` + `js/i18n/es.js`: catalogs for scaffold screens; `js/i18n.js` with `t(key)` (fallback to EN on missing key)
- [x] `js/storage.js`: JSON get/set helpers, settings get/set
- [x] `js/app.js` boot: detect browser language (`es-*` → es), apply saved or system theme, route to profile-select
- [x] Settings screen: language (EN/ES), theme (light/dark/system), sound on/off — persisted, re-render immediately on change
- [x] Test: `test/smoke.mjs` — 15 assertions covering boot, EN↔ES switch, theme switch, persistence across simulated reloads (all pass)
- [x] `git commit`

### Step 2 — Profiles + avatar builder ✅
- [x] `js/avatar.js`: SVG part library for all parts/variants; `renderAvatar(config, size)` returns SVG string; cozy styling (rounded, rosy cheeks)
- [x] `storage.js`: createProfile / listProfiles / deleteProfile (+ per-profile data records with defaults)
- [x] Profile-select screen: grid of avatar + name cards, tap to enter app, "add profile" card (always present, even when empty), delete × with confirm
- [x] Avatar builder UI: large live preview, option rows as live mini-avatar thumbnails (hair color = swatches), "Surprise me" randomize, name input (live-bound, no re-render while typing), save → straight into home
- [x] i18n strings for all profile/avatar UI (EN + ES complete)
- [x] Test: smoke harness extended — avatar render/bounds, full builder flow ×2 profiles, switch, delete incl. data-record removal (all pass)
- [x] `git commit`

### Step 3 — Question generators + Level mode ✅
- [x] `js/questions.js`: generators for all 4 operations × levels 1–5 per the level table; non-negative answers, exact division only, unique questions per round
- [x] Level-mode screen (`js/modes/level.js`): operation picker (4 big buttons with symbols), level picker 1–5, start
- [x] Round UI (`js/round.js`, shared engine): large question display, on-screen number keypad + backspace + confirm, physical keyboard support (digits/Backspace/Enter)
- [x] Per-question feedback: correct = random praise; wrong = "Almost! The answer was N" in muted rose; 1 s lock then auto-advance
- [x] 10 questions per round → results screen: score x/10, points earned (+10 × correct), continue button
- [x] Record to profile storage: stats per operation, points += 10 × correct
- [x] i18n strings for all mode UI (EN + ES complete)
- [x] Test: 20 op×level generator invariants (60 samples each), round uniqueness, full 10/10 round with stats+points verification, wrong-answer feedback path, mid-round quit (all pass)
- [x] `git commit`

### Step 4 — Adaptive mode ✅
- [x] Adaptive engine (`js/modes/adaptive.js` + adaptive path in `js/round.js`): start from saved level (default 2), up after 3 consecutive correct, down after 2 wrong, clamp 1–5. Bug fixed while testing: adaptive questions are now cached per index (they were re-rolled on every render, so answers were graded against a different question)
- [x] Mode screen: operation picker + start; subtle "Level N" chip in the round card during adaptive rounds
- [x] Same round/results flow as level mode; results show "level reached"
- [x] Persist reached level per operation in `adaptiveLevel`
- [x] i18n strings (EN + ES complete)
- [x] Test: default start at 2, step-up after exactly 3 correct, step-down after 2 wrong, clamp at 5, persistence across a simulated reload (all pass)
- [x] `git commit`

### Step 5 — Timed challenge ✅
- [x] Timer engine (`js/round.js` timed path + `js/modes/timed.js`): 60 s countdown in header; instant confirm per answer, auto-advance (no lock); round ends at 0. Timed rounds generate questions on demand (no pre-generated list) so the count is effectively unlimited
- [x] Mode screen: operation picker + level 1–5, or "mixed" (🔀, all four operations at fixed level 2; level row hidden). High-score keys: `timed.<op>.<level>` / `timed.mixed`
- [x] End screen: bare score (no x/count), points, questions answered, "new record" 🏆 celebration or "Best: N" line
- [x] Persist high scores per profile + mode key; mixed rounds award points but don't touch per-op stats (round engine only tracks a total score)
- [x] `finish()` now calls `onComplete` before rendering results so record functions can attach display info (high scores) to the results object
- [x] i18n strings (EN + ES complete)
- [x] Test: 60 s start, instant confirm, tick-by-tick countdown to end, new-record vs best-line paths, high-score persistence, mixed mode spans ops + `timed.mixed` record (all pass)
- [x] `git commit`

### Step 6 — Gamification: points, streaks, badges, leaderboard ✅
- [x] Streak logic in `js/badges.js` (`Mates.progress.updateStreak`): one round per calendar day keeps the streak alive; same-day rounds don't re-extend; next day after a gap restarts at 1; `bestStreak = max`. Uses local-calendar `dayKey('YYYY-MM-DD')`
- [x] `js/badges.js`: badge DEFS (id, icon, name/desc i18n keys, condition fn) + `checkBadges(d, res)` returns newly earned ids; shared `Mates.progress.record(res)` funnels per-op stats, points (+score×10), streak and badges — all three mode record functions rewired through it
- [x] All 7 badges implemented: first-steps, sharp-shooter (10/10 level round), speed-demon (≥20 timed), table-master (50 lifetime mul), divvy-up (50 lifetime div), on-fire (streak ≥5), unstoppable (streak ≥14)
- [x] Home screen: stats row (points / current streak / best streak), badges grid (earned colored, locked dimmed + grayscale), high-scores summary card (hidden when empty), leaderboard button
- [x] Leaderboard screen: device profiles ranked by lifetime points, medals for top 3, best streak + badge count per row
- [x] Badge-unlock celebration on results screen ("New badges!" + earned badge chips); record fns attach `res.newBadges` (finish() calls onComplete before rendering)
- [x] i18n for all badge names/descriptions + home/leaderboard strings (EN + ES complete)
- [x] Test: streak rollover / gap-reset / same-day, all 7 badges earned deliberately across simulated days, celebration shows only newly earned, home stats + full/locked badge grids, fresh profile all locked, leaderboard ordering with new profile "Ana" (all pass; 114 assertions)
- [x] `git commit`

### Step 7 — PWA ✅
- [x] Cozy icon set in `icons/`: base SVG (terracotta rounded square + cream "M" + teal dot, from theme tokens) → PNG at 192/512 for both `any` and `maskable` (content inside the 80% safe zone) + 180px apple-touch-icon; rendered with rsvg-convert
- [x] `manifest.json`: name "Mates", short_name, id, start_url `./index.html`, scope, display standalone, portrait, background_color (light cream), theme_color (terracotta), all 4 icons
- [x] `sw.js`: versioned cache (`mates-v1`); install = precache full asset list + skipWaiting; fetch = cache-first with network fallback (same-origin only cached; offline navigation falls back to cached index.html); activate = delete old `mates-*` caches + clients.claim. Bump VERSION on each release
- [x] SW registered in `app.js` after load, guarded by `'serviceWorker' in navigator && window.isSecureContext`, failures swallowed — plain local dev unaffected
- [x] Test: manifest parses with all 4 icon purposes; sw precache list matches files on disk (catches stale lists); index.html links manifest + theme-color. Browser-side install prompt / offline-after-first-load left for user verification on a device
- [x] `git commit`

### Step 8 — Polish + QA pass
- [x] First-launch onboarding (welcome → create profile)
- [x] WebAudio sound feedback (correct/wrong beeps), respects `settings.sound`, no audio assets
- [x] Full ES pass: every string translated, no EN leaks anywhere
- [x] Full dark-theme pass: contrast + avatar legibility on every screen
- [x] Edge cases: single-profile leaderboard, very long profile names, storage quota failure handled gracefully
- [x] Final review against the spec summary in section 1
- [x] `git commit`

Notes (Step 8):
- Onboarding: fresh device (no profiles) boots to a `welcome` screen; `welcomeStart` → profile builder → home. Returning devices go straight to profiles.
- Sound: `js/sound.js` exposes `Mates.sound.play('correct'|'wrong'|'badge')` via WebAudio oscillators — no audio files. Hooks in `round.js` (`submit()` after scoring, `finish()` when new badges). Guarded: respects `settings.sound`, no-op without AudioContext (safe in the smoke harness).
- i18n: static parity check added to `test/smoke.mjs` — extracts every literal `Mates.t('...')` key plus dynamic nameKey/descKey/partRow keys from js/ and asserts presence in both EN and ES catalogs.
- Dark-theme pass: only hardcoded colors are two theme-independent contrast pairs (`.badge-earned`, `.key-go`) and the welcome-screen brand SVG (matches PWA icon).
- Edge cases tested: sound no-op without AudioContext, 64-char profile name on home + leaderboard, single-profile leaderboard shows 🥇 row, `profileData.save` fails soft when setItem throws quota error.
- SW cache bumped to `mates-v2` (sound.js added to precache).

### Step 9 — Capacitor → Android APK (after web app is done)
- [x] `package.json` with `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` (tooling only — app code stays dependency-free)
- [x] `capacitor.config.json`: appId `com.cavt.mates`, appName "Mates", webDir = app root
- [x] `npx cap add android`; copy web assets
- [x] Android name + adaptive icon from the PWA icon set
- [ ] Build debug APK (Gradle); verify install, offline behavior, and both themes on a device/emulator
- [ ] `git commit`

Notes (Step 9):
- Capacitor 8.6.2 (`@capacitor/cli`, `core`, `android`). Scripts: `npm run cap:sync`, `npm run cap:open`.
- webDir is `"www"` — see Corrections above (Capacitor rejects `"."`; user approved the www/ restructure).
- `android/` source is committed; build artifacts ignored via `.gitignore` (`android/.gradle/`, `android/build/`, `android/app/build/`, `android/local.properties`).
- Launcher icons: sources in `www/icons/android/` — `foreground.svg` (transparent, M+dot scaled 0.70× about centre so all ink fits the 66dp safe zone), `square.svg` + `round.svg` (full-bleed terracotta, pre-API-26 fallbacks). Rendered with rsvg-convert into `mipmap-{mdpi…xxxhdpi}`: foreground 108/162/216/324/432 px, square+round 48/72/96/144/192 px. Adaptive background color = #ef7d54 (`values/ic_launcher_background.xml`).
- Box 5 blocked on this machine: no Java, no Android SDK (ANDROID_HOME unset). Build later with `npm run cap:sync && cd android && ./gradlew assembleDebug` on a machine with JDK 17 + Android SDK; then install and verify offline behavior + both themes.

### Step 10 — Goal-based timed challenge ✅
- [x] Storage (`storage.js`): profile defaults gain `timedGoal: { target: 8, time: 45 }` + `timedBest: {}`; `Mates.timedGoal` helper (clamp/get); read-time migration in `profileData.get()` strips obsolete count-based `timed.*` high-score keys
- [x] Profile settings screen (`app.js`): ⚙ button on each profile card opens `profileSettings` — target ±1 / time ±5 stepper rows, self-disabling at limits (target 1–30, time 10–300 s)
- [x] Round engine (`round.js`): goal passed via cfg; countdown starts at `goal.time`; early end when the target is reached (`success`, `elapsed = goal.time − timeLeft`); progress chip `score / target`; results screen with success banner (🎉 + "in X s" + fastest-time record line) and failure banner (💪 + Try again, restarts same op/level with a fresh goal read from profile data); legacy branch kept for timed rounds without a goal
- [x] Timed mode (`timed.js`): setup screen shows the goal line + best time for the selected key; `startTimedChallenge()` shared by start and retry; `recordTimedRound`: on success points += 20 bonus (`res.bonus`) and fastest elapsed into `timedBest[key]` (`'mixed'` or `'op.level'`, lower is better, success only)
- [x] Home high-scores card now lists best challenge times ("⏱ N s" per key) instead of count-based scores
- [x] speed-demon badge redefined: `res.timed && res.success && res.level === 5` (complete a level-5 challenge); i18n desc updated in both languages
- [x] CSS: `.profile-gear`, stepper styles, results banners (`.results-banner-win/-lose`)
- [x] i18n EN + ES complete for all new strings
- [x] Test: smoke.mjs step 5 rewritten — goal editor flow + clamps, migration, early success end + bonus + record line, slower-success path, failure + retry path, mixed mode with goal, home best-times card; speed-demon now tested via an L5 success. 162 assertions pass
- [x] SW cache bumped to `mates-v3`
- [x] `git commit`

---

## 4. Out of scope (v1)
No backend/accounts/cloud sync · no fractions/geometry/money/shapes · no parent dashboard · no review-of-missed-questions feature (data model leaves room) · release to Play Store (debug APK only).
