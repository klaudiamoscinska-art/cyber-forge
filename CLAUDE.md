# Cyber Forge: Merge Tycoon

Cyberpunk/neon merge-tycoon idle RPG. Static site (no build step, no
dependencies) — open `index.html` directly or serve the folder statically
(e.g. GitHub Pages).

## Files

- `index.html` — page structure: `<canvas id="rpgCanvas">` (combat arena),
  `<div id="mergeGrid">` (4x4 forge grid), stats bar, upgrade buttons.
- `style.css` — neon cyberpunk look (black background, `box-shadow`/
  `filter: drop-shadow` glow), responsive vertical 50/50 split between
  arena and forge, drag-and-drop and merge-flash animations.
- `game.js` — all game logic, plain ES6 classes, no framework:
  - `Game` — owns state, the `requestAnimationFrame` loop, DOM/canvas
    rendering, save/load.
  - `Knight` — player character (auto-attacks, draws itself on canvas).
  - `Enemy` — cyber-cube/virus mobs and bosses (every 10th kill).
  - `WeaponSlot` — one forge grid cell (level 1–10, exponential damage).
  - `Particle` — death-explosion particles.
  - `CONFIG` at the top of the file holds all balance numbers (costs,
    growth multipliers, HP/damage scaling, timers) — tune gameplay there.

## Core mechanics

- Knight's damage/DPS is derived from the **highest-level weapon currently
  on the merge grid** (`Game.equippedWeaponLevel`), not from a separate
  stat — merging is the only way to increase combat power.
- Weapon damage scales exponentially with level
  (`baseDamage * damageMultiplier^(level-1)`), capped at level 10.
- Weapon color tier (green → cyan → hot pink) communicates rarity as
  levels increase — see `CONFIG.weapon.tiers`.
- Merging works two ways: HTML5 drag-and-drop, and tap/click-to-select
  (needed for mobile, where DnD is unreliable).
- "Automatyczne Łączenie" (auto-merge) is a timed power-up
  (`CONFIG.autoMerge`) with a cooldown — it's structured as a placeholder
  for a future Rewarded Ad gate, not wired to any ad SDK yet.
- Game state autosaves to `localStorage` (`CONFIG.save.key`) every
  `CONFIG.save.intervalMs` and on tab hide/unload. The save is versioned
  (`version: 1`); bump it and add a migration in `Game.loadState()` if the
  state shape changes.

## Conventions for changes

- Keep balance tweaks in `CONFIG`, not scattered magic numbers.
- No build tooling — this must stay plain HTML/CSS/JS runnable straight
  from GitHub Pages.
- UI text is in Polish; keep new UI strings consistent with that.
- When touching gameplay, sanity-check in an actual browser (Playwright
  with the pre-installed Chromium works well in this environment) —
  headless screenshots plus reading `Game` state via
  `window.cyberForgeGame` catches rendering and balance issues that unit
  tests would miss (there are no automated tests in this repo).
