# Mates — Build Plan

## How to resume after a context loss
1. Read this file top to bottom (it is the single source of truth).
2. Find **Current status** → the step in progress.
3. Work on the first unchecked box under that step, top to bottom.
4. When all boxes of a step are done: mark them `[x]`, update **Current status**, and `git commit` (user=charliedunne, email=charlie.dunne@gmail.com).

## Current status
- Step in progress: **Step 5 — Timed challenge**
- Last updated: 2026-11-15 — Steps 1–4 complete (scaffold, i18n, themes, profiles, avatar builder, question generators, level mode, adaptive mode; 72 smoke assertions pass)

### Corrections made while working
- **Router design**: instead of static screen containers in `index.html`, the app uses a render-on-demand router (`Mates.screens` = map of render functions; `Mates.router.go(name)` swaps `#app` innerHTML). Simpler, and language/theme re-render is just `router.refresh()`. All clicks go through one delegated listener on `[data-action]` elements.
- **Shared round engine**: added `js/round.js` (not in the original layout) — one round engine + round/results screens shared by level, adaptive and timed modes. Modes register in `Mates.modes` (home renders them) and pass a cfg to `Mates.round.start()`. Load order: questions → round → modes → app; all files merge into `Mates.screens`/`Mates.actions` instead of overwriting.
- **Testing**: no browser available in the dev environment — verification uses `test/smoke.mjs` (Node vm + fake DOM + shared localStorage stub, controllable setTimeout/setInterval), run with `node test/smoke.mjs`. Visual/real-device checks are left to the user.

---

## 1. Spec summary
Web app for primary-school maths practice (ages 5–11). **Arithmetic only**: addition, subtraction, multiplication, division. Three practice modes: fixed levels, adaptive difficulty, timed challenges. Installable PWA, fully offline, no backend — named local profiles in `localStorage`. Bilingual **EN/ES**, user-selectable **light/dark** cozy themes, layered-SVG **avatar builder** (face, skin, hair, hair color, eyes, mouth). Gamification: points, daily streaks, badges, local leaderboard between profiles on the same device. Later: Android APK via Capacitor.

## 2. Key decisions & conventions (read before coding)
- **Stack**: vanilla JS + HTML/CSS only. No build step, no dependencies, no framework.
- **i18n rule (hard)**: every user-facing string goes through `t(key)` from the i18n catalogs. Never hardcode UI text in HTML/JS. Both `en` and `es` must be complete for every screen before a step is done.
- **Themes**: all colors as CSS custom properties — light defaults on `:root`, dark under `[data-theme="dark"]`. Cozy palettes: light = warm cream/soft peach; dark = deep warm navy/brown (never pure black, never harsh white). Default follows system preference; user override persisted.
- **Persistence**: `localStorage` only, JSON values, keys: `mates.settings`, `mates.profiles`, `mates.profile.<id>`.
- **Points**: 10 pts per correct answer (all modes), lifetime total per profile.
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

### Timed challenge
60-second countdown. Pick operation + level, or "mixed" (all four operations). Instant confirm per answer, auto-advance. Score = correct count. High score saved per profile + mode key.

### Badges
| id | Condition |
|---|---|
| first-steps | complete first round |
| sharp-shooter | 10/10 in a level-mode round |
| speed-demon | ≥ 20 correct in one timed round |
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
  highScores: { 'timed.<op>.<level|mixed>': score },
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

### Step 5 — Timed challenge
- [ ] Timer engine: 60 s countdown display; instant confirm per answer, auto-advance; round ends at 0
- [ ] Mode screen: operation + level, or "mixed" (all operations)
- [ ] End screen: score, high-score comparison with "new record" celebration
- [ ] Persist high scores per profile + mode key
- [ ] i18n strings (EN + ES complete)
- [ ] Manual test: timer accuracy, mixed mode, high-score persistence across reloads
- [ ] `git commit`

### Step 6 — Gamification: points, streaks, badges, leaderboard
- [ ] Streak logic in storage/app: update currentStreak / bestStreak / lastPracticeDate after each round (handle day rollover and gaps)
- [ ] `js/badges.js`: badge definitions (id, name key, description key, condition fn); `checkBadges(profileData)` returns newly earned badges
- [ ] Implement all 7 badges from the table in section 2
- [ ] Home screen for a profile: points, streak (current + best), badges grid (earned = colored, unearned = dimmed), high scores summary
- [ ] Leaderboard screen: profiles on this device ranked by lifetime points, with best streak + badge count
- [ ] Badge-unlock celebration shown on the results screen when earned
- [ ] i18n for all badge names/descriptions (EN + ES complete)
- [ ] Manual test: earn each badge deliberately; verify leaderboard ordering and streak math across simulated days
- [ ] `git commit`

### Step 7 — PWA
- [ ] Cozy icon set in `icons/`: base SVG → PNG at 192, 512 + maskable variant (theme colors matching both palettes)
- [ ] `manifest.json`: name "Mates", short_name, icons, theme_color, display standalone, start_url
- [ ] `sw.js`: versioned cache; install = precache full asset list; fetch = cache-first with network fallback; activate = clean old caches
- [ ] Register SW in `app.js` (guard so it doesn't break non-secure local dev)
- [ ] Manual test: install prompt appears, app works fully offline after first load, new cache picked up after an asset change
- [ ] `git commit`

### Step 8 — Polish + QA pass
- [ ] First-launch onboarding (welcome → create profile)
- [ ] WebAudio sound feedback (correct/wrong beeps), respects `settings.sound`, no audio assets
- [ ] Full ES pass: every string translated, no EN leaks anywhere
- [ ] Full dark-theme pass: contrast + avatar legibility on every screen
- [ ] Edge cases: single-profile leaderboard, very long profile names, storage quota failure handled gracefully
- [ ] Final review against the spec summary in section 1
- [ ] `git commit`

### Step 9 — Capacitor → Android APK (after web app is done)
- [ ] `package.json` with `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` (tooling only — app code stays dependency-free)
- [ ] `capacitor.config.json`: appId `com.cavt.mates`, appName "Mates", webDir = app root
- [ ] `npx cap add android`; copy web assets
- [ ] Android name + adaptive icon from the PWA icon set
- [ ] Build debug APK (Gradle); verify install, offline behavior, and both themes on a device/emulator
- [ ] `git commit`

---

## 4. Out of scope (v1)
No backend/accounts/cloud sync · no fractions/geometry/money/shapes · no parent dashboard · no review-of-missed-questions feature (data model leaves room) · release to Play Store (debug APK only).
