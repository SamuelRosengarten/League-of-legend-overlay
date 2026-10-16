# Rift Advisor

A small desktop overlay for League of Legends with pre-game matchup notes for **Gwen (top)**, **Fiddlesticks (support)** and **Amumu (jungle)**:

- **Champ select:** threat ranking of the enemy team with the reason for every point, lane matchup card (tips, danger abilities, power spikes, item/rune adjustments), team-comp warnings and, for Amumu, a pre-game jungle path plan.
- **In game:** a compact panel docked to a screen edge with the same reference info, item counters the enemy has bought, and the lane opponent's level spikes.

- **Your rank, your theme:** the whole overlay takes on the look of your current ranked tier, from Iron to Challenger, with the official crest in the header.
- **Gwen, Fiddlesticks and Amumu companions** sit on, peek over or hang from the panel's borders. Optional and configurable.

Built with Tauri 2 (Rust) and TypeScript.

## What it does not do

Rift Advisor reads data **only** from Riot's official local APIs:

| API | Used for |
| --- | --- |
| LCU API (League client, `https://127.0.0.1:<port>`; auth from the client's `lockfile`) | `/lol-gameflow/v1/gameflow-phase`, `/lol-champ-select/v1/session` and `/lol-ranked/v1/current-ranked-stats` (rank theme), via the LCU WebSocket (`OnJsonApiEvent`) with HTTP polling as a fallback |
| Live Client Data API (`https://127.0.0.1:2999/liveclientdata/allgamedata`) | Champions, levels and items while in game |
| Data Dragon (`ddragon.leagueoflegends.com`) | Champion list, champion/item/ability icons and splash art, cached locally |

It does **not** use keyboard/mouse hooks, memory reading, screen capture, minimap reading or injection. Global hotkeys are registered with the standard Windows `RegisterHotKey` API. To keep the header buttons clickable in click-through mode, the overlay reads the cursor position (`GetCursorPos`, 20 times a second); it never reads keys or clicks meant for the game. The self-signed Riot certificates are accepted **only for `127.0.0.1`** (see `src-tauri/src/tls.rs`). Every other host gets normal certificate verification.

It also never makes decisions for you or gives real-time "go here now" instructions in game. Everything shown is pre-game planning or static reference info. The jungle plan is visible for the first 90 s of the game (loading screen and the first clear), then collapses to a single line.

> Rift Advisor isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, League of Legends and all associated properties are trademarks or registered trademarks of Riot Games, Inc. The ranked emblems (`src/assets/ranks/`) come from Riot's developer portal and the champion art from Data Dragon. The Gwen, Fiddlesticks and Amumu companions are original fan art, not Riot artwork.
>
> Rift Advisor is designed to stay within Riot's third-party application rules (official APIs only, no automation, no information the game does not already give you), but you use it at your own risk. Check Riot's current developer policies before you distribute it.

## Requirements

- Windows 10/11.
- **League must run in Borderless (windowed fullscreen) or Windowed mode.** Exclusive **Fullscreen is not supported**: Windows does not draw other windows over an exclusive-fullscreen game, so the overlay stays hidden behind it. Change it under *Settings → Video → Window Mode → Borderless*.
- To build from source:
  - [Node.js](https://nodejs.org/) 20+ (developed on 24)
  - [Rust](https://rustup.rs/) (stable, MSVC toolchain)
  - Visual Studio 2022 Build Tools with the *Desktop development with C++* workload (MSVC + Windows SDK)
  - WebView2 runtime (preinstalled on Windows 11)

  ```powershell
  winget install Rustlang.Rustup
  winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  ```

## Getting started

```powershell
npm install
npm run dev        # run against the real League client
npm run build      # installer in src-tauri/target/release/bundle/
```

Start Rift Advisor before or after the League client; it connects automatically. The tray icon menu has *Show / hide*, *Interactive mode*, *Reset position* and *Quit*. Only one copy runs at a time: launching it again just brings the running overlay back on screen. A second copy would otherwise lose the global hotkeys to the first.

The header shows the connection state:

| State | Meaning |
| --- | --- |
| Client not running | No League client `lockfile` was found. Start the client, or set `leagueInstallDir` (see below) if League is installed somewhere unusual. |
| API unreachable | The lockfile exists but the client did not answer (it is starting up or shutting down). It retries every 3 s. |
| Connected · websocket / polling | Live events, or the 1 s polling fallback. |
| Unsupported champion | You picked something other than Gwen, Fiddlesticks or Amumu. The overlay shows a short note and stays out of the way. |
| Missing data | No curated data file for your champion, or the file failed validation. Run `npm run validate:data` to see why. |

### Display modes

The overlay switches mode automatically from the gameflow phase:

| Phase | Mode |
| --- | --- |
| Client open (lobby, post-game, …) | docked to the client: your stats (see below) |
| No client | idle (small status card) |
| ChampSelect | full panel (460 px wide) |
| GameStart / InProgress | compact panel (starts on the right edge) |
| WaitingForStats / PreEndOfGame | hidden (the game window is closing) |

### Docked to the client: your stats

Between games the panel sticks to the side of the League client window: right next to it, exactly as tall, following it when you move or resize it. It uses the right side, or the left if there is no room on the right (shrinking to fit before it would ever cover the client), and it only shows while the client is the active window, so it never floats over other apps. Gwen and Amumu cling to the panel's outer border: they lean over its frame, tied on by Gwen's ribbon and Amumu's bandage, and sway from the knot. If the client is minimized the panel hides with it.

- **Last game:** result, queue, length, K/D/A, KDA, CS/min and damage/min, with arrows comparing each number to your other games on that champion.
- **Gwen, Fiddlesticks and Amumu:** wins/losses, win rate, a win/loss strip, average K/D/A, KDA, CS/min, damage/min and mastery level.

The numbers come from the client's match history (`/lol-match-history/…/current-summoner/matches`) and mastery (`/lol-champion-mastery/v1/local-player/champion-mastery`). The client only shares your **last 20 games**. Champion stats count Summoner's Rift only (Classic and Swiftplay); Practice Tool, custom games and remakes under 5 minutes are left out. History reloads 5 and 30 seconds after each game, since the client adds the game a little after the post-game screen opens. Turn docking off under Appearance → Layout → *Dock to the League client*.

The window is transparent, frameless, always on top and **click-through**, so the game receives every click. Turn on *interactive mode* to scroll, collapse sections or drag the panel by its header. The panel stays where you drop it (turn on *Snap to screen edge in game* under Appearance → Layout for the old docking behaviour). Positions are remembered per mode, kept inside the monitor's work area, and are DPI-aware.

When new game data makes the panel taller or shorter, it resizes where it is and never jumps back to a saved spot. It grows away from the corner it sits in: a panel in the bottom half grows upwards, one in the right half grows to the left. *Reset position* (tray menu or Appearance → Layout) puts the panel back at its default spot.

### Hotkeys

| Default | Action |
| --- | --- |
| `Ctrl+Shift+A` | Show / hide the overlay |
| `Ctrl+Shift+Z` | Toggle interactive mode (click-through off / on) |

**Passive vs interactive.** In passive mode (default) every click goes through the overlay to the game. In interactive mode the overlay receives clicks, scrolling and text selection: an *INTERACTIVE* tag appears on its top border, the frame lights up and the pointer button is highlighted. The overlay never takes keyboard focus in either mode (`WS_EX_NOACTIVATE`), so the game keeps your keyboard. As a consequence, Tab navigation inside the overlay is not available; use the mouse in interactive mode. In interactive mode the transparent strip where the companions sit also catches clicks.

**In game, use the mouse.** While the game has focus, League keeps registered hotkeys from reaching other apps (tested in Practice Tool: no press arrived). So the header buttons always work by mouse, even in click-through mode: point at them and click. Click the pointer button to make the whole panel interactive (drag, scroll, collapse). In game, interactive mode switches itself off 1.5 s after the cursor leaves the panel, so the game never loses clicks for long. The hotkeys still work in the client and in champ select.

**Glance view.** In game the panel shows one line per threat (its most telling reason, such as an anti-heal item they bought) and the two most important tips, each clamped to two lines. The **+** button in the header switches to the detailed view with every reason and tip; the choice is remembered. Every registered hotkey and every press that reaches the app is logged in the `npm run dev` console.

### Appearance: rank theme, companions, motion

Click the gear in the header (in interactive mode) to open **Appearance**. Changes apply immediately and are saved to the settings file.

- **Rank theme.** *My rank* (default) follows your current Solo/Duo tier as the League client reports it, or Flex if you have no Solo/Duo tier. An account without a tier this season gets the neutral hextech theme and shows "Unranked · N placements left". The app never guesses a rank. While the client is closed, the last reported rank is used and labelled "last known". You can also pin any of the ten tiers manually.
  Each tier sets the panel frame, background glow, buttons, selections, headings, score meters, LP bar, particles and the gems on the companions. Apex tiers (Master and up) get brighter frame corners, and Challenger adds a light sweep along the top edge. On a rank change the colors cross-fade over about 0.8 s.
- **Companions.** Gwen and Amumu (art in `src/assets/companions/`) live on the panel frame. Gwen stands and Amumu sits on the top border, both can peek over it, or they dangle below the bottom border (Gwen from a ribbon, Amumu from his bandage). Placements: *Opposite corners* (default), *Top border*, *Hanging below*, *Left corner*, *Right corner*, *Peeking* or *Minimal*. You can also set their size (70–140 %) and whether they stay on the in-game panel. They breathe, blink and sway. With motion set to *Full* they also pull an occasional expression: Gwen goes happy, sleepy, curious, excited or winks; Amumu goes sleepy, curious, happy, surprised or sheds a tear. They also react when you change screens. They never cover advice or controls and never receive mouse clicks.
- **Motion.** *Full* (idle animations, sparkles, ambient particles), *Calm* (slow breathing and blinking) or *Off*. In game, motion is capped at Calm and particles are off. If Windows *Animation effects* is off (`prefers-reduced-motion`), everything stays still. While the overlay is hidden, all animations pause.
- **Layout.** *Scale* (80–150 %) zooms text, icons and the panel together; try 115–130 % on 1440p or 4K screens. *Snap to screen edge in game* docks the in-game panel to the nearest left/right edge after a drag (off by default). *Reset position* forgets the saved spot for the current mode.

How the companion art was prepared, and how to replace it, is described in `src/assets/companions/README.md`.

### Settings file

`%APPDATA%\dev.rosengarten.riftadvisor\settings.json` is created on first start. Any field you leave out falls back to its default. Restart the app after editing it.

```json
{
  "hotkeys": { "toggleVisibility": "Ctrl+Shift+A", "toggleInteractive": "Ctrl+Shift+Z" },
  "leagueInstallDir": "D:/Games/League of Legends",
  "positions": {},
  "dock": "right",
  "appearance": {
    "theme": "auto",
    "motion": "full",
    "companions": { "gwen": true, "amumu": true, "placement": "corners", "size": 1, "inGame": true },
    "scale": 1,
    "snapToEdge": false,
    "dockToClient": true
  }
}
```

- `leagueInstallDir`: only needed if the client cannot be found. By default the app looks in `C:\Riot Games\League of Legends`, then next to the running `LeagueClientUx.exe`.
- `positions` / `dock`: saved window positions and the docking edge (used when `snapToEdge` is on). *Reset position* clears them for the current mode.
- `appearance`: edited from the Appearance view. `theme` is `auto` or a tier id (`iron` … `challenger`, `unranked`). Unknown values fall back to the defaults.
- `lastRank`: written by the app, the last rank the client reported.

Data Dragon files are cached in `%LOCALAPPDATA%\dev.rosengarten.riftadvisor\ddragon`. The app also works offline with the last cached version.

### Testing in League of Legends (manual checklist)

These need a real match and are not covered by the automated tests:

1. Set League to **Borderless** (*Settings → Video → Window Mode*). Start Rift Advisor; the status dot on the crest turns green once the client is found.
2. **Champ select:** the full panel appears on its own. Press `Ctrl+Shift+Z`, scroll the guide, open the gear menu, press `Ctrl+Shift+Z` again, then click the client behind the panel: the click must reach the client.
3. **In game:** the compact panel appears on the right edge. Drag it somewhere else in interactive mode, then buy items and level up: the panel resizes in place and does not jump back. Right-click to move your champion *under* the panel: in passive mode the click must reach the game.
4. In game, hover the header buttons: they light up. Click the collapse button: the panel collapses, and your next right-click on the map still moves your champion. Click the pointer button: the panel shows *INTERACTIVE*; move the mouse off the panel and after about 1.5 s it goes back to click-through. Your abilities (Q/W/E/R) must still work without clicking into the game first.
5. In the client, press `Ctrl+Shift+A` twice: the panel hides and comes back. Alt-Tab out and back: the panel stays on top.
6. End the game: the panel hides on the end-of-game screen and returns in the lobby.
7. Optional: try Windowed mode (works like Borderless). Exclusive Fullscreen is **not supported**: Windows does not draw other windows over an exclusive-fullscreen game.

## Mock mode (no League needed)

```powershell
npm run dev:mock
```

This replays recorded API payloads from `fixtures/scenarios/*.json` through the same code path as the real connectors. The LCU and Live Client are never contacted. A dev panel in the overlay lets you pick a scenario and step back and forth.

| Scenario | Covers |
| --- | --- |
| `gwen-vs-fiora` | Gwen top vs Fiora: champ select → in game |
| `amumu-vs-leesin-red` | Amumu on red side vs Lee Sin: jungle plan, invade warning, QSS bought in game |
| `unsupported-champion` | Yasuo picked: "unsupported" state |
| `partially-hidden-enemies` | Hidden enemy picks, roles inferred from champion tags |

| Environment variable | Effect |
| --- | --- |
| `RIFT_MOCK=1` | Enable mock mode (set by `dev:mock`) |
| `RIFT_MOCK_SCENARIO=<id>` | Start with this scenario |
| `RIFT_MOCK_STEP=<n>` | Start paused on step *n* (1-based) |
| `RIFT_FIXTURES_DIR=<path>` | Load scenarios from another folder |
| `RIFT_MOCK_RANK="gold II 47"` | Mock rank for the theme (default `emerald II 63`; e.g. `challenger 1203`, `unranked`) |

```powershell
$env:RIFT_MOCK_SCENARIO="amumu-vs-leesin-red"; $env:RIFT_MOCK_STEP="3"; npm run dev:mock
```

The scenario files are generated by `node scripts/make-fixtures.mjs`. Edit that script, not the JSON. A step only overrides the keys it contains (`phase`, `champSelect`, `liveGame`), and `null` clears a key.

## Curated data

All advice lives in `data/` as plain JSON, validated against the JSON Schemas in `data/schema/`:

| File | Content |
| --- | --- |
| `champions/tags.json` | Profile for every champion: damage type, range, mobility, typical roles, CC, trait tags, early-game strength 1–3 |
| `matchups/gwen.json`, `matchups/amumu.json` | Threat weights per tag, generic advice per tag, and about 20 curated matchups each |
| `items/counters.json` | Counter items (QSS, Grievous Wounds, Zhonya's, …) and what they counter |
| `jungle/amumu-paths.json` | Amumu clear paths and the conditions that favor or avoid each one |

Ground rules for content:

- **No invented numbers.** No win rates and no damage values. Describe interactions qualitatively. A test rejects percentages and win-rate wording in advice text.
- Mark anything you are not sure about with `"confidence": "low"` (per entry or per line). Low-confidence content is shown with a badge in the overlay.
- `lastReviewedPatch` is `"draft"` until a human checks the entry in game. Then set it to the patch, e.g. `"26.20"`.

### Adding or editing a matchup

1. Open `data/matchups/gwen.json` (or `amumu.json`). In VS Code, the `$schema` link gives autocomplete and inline errors.
2. Add or edit an entry under `matchups`, keyed by the **Data Dragon champion id**. Use `MonkeyKing` for Wukong, `KSante` for K'Sante, `LeeSin` for Lee Sin.

   ```jsonc
   "Fiora": {
     "difficulty": 4,                 // 1 = easy for me … 5 = very hard
     "threat": 4,                     // 1–5, base of the threat score
     "phaseAdvantage": { "early": "them", "mid": "even", "late": "even" },
     "powerSpikes": [
       { "kind": "level", "level": 6, "note": "Grand Challenge: very strong all-in." },
       { "kind": "item", "item": 3074, "note": "Ravenous Hydra: side-lane threat rises sharply." }
     ],
     "dangerAbilities": [
       { "key": "W", "name": "Riposte", "note": "Parries incoming damage; don't dump abilities into it." }
     ],
     "tips": [                        // 3–5 tips
       { "text": "Bait Riposte first, then commit while it is on cooldown." },
       { "text": "…" },
       { "text": "…", "confidence": "low" }
     ],
     "itemAdjustments": [ { "item": 3047, "name": "Plated Steelcaps", "note": "…" } ],
     "runeAdjustments": [ { "rune": "Second Wind", "note": "…" } ],
     "threatTags": ["true-damage", "lane-bully"],
     "lastReviewedPatch": "draft",
     "confidence": "medium",
     "reviewNotes": "Optional: what still needs checking."
   }
   ```

   For **Amumu** jungle matchups, also add a `jungle` block:

   ```json
   "jungle": { "invadeRisk": "high", "strongLevels": [2, 3], "note": "Enemy Lee Sin is strong level 2–3 — avoid his side early." }
   ```

3. If the champion is new, also add it to `champions/tags.json`. Every enemy needs a profile, or it falls back to a generic profile from its Data Dragon class.
4. Validate:

   ```powershell
   npm run validate:data                 # schema + cross-file checks
   npm run validate:data -- --ddragon    # also list champions on the latest patch missing from tags.json
   npm run validate:data -- --strict     # treat warnings as errors (CI-style)
   ```

   Errors name the file, the JSON path and the problem, e.g. `ERROR data/matchups/gwen.json /matchups/Fiora/tips: Array has too few items (2 < 3).`.
5. Run `npm test` and check the result in mock mode (`npm run dev:mock`). At runtime, an invalid file is reported as *missing data* instead of being half-used.

Item ids are Data Dragon item ids (the same ids the Live Client reports). Tags must come from the list in `data/schema/common.schema.json`. A new tag must be added there first, then weighted in each matchup file's `threatWeights`.

### How the threat score works

```
score = curated threat (or 2 for uncurated enemies)
      + 1.5 if the enemy is my lane opponent
      + Σ threatWeights[tag] for each of the enemy's tags (from tags.json, the matchup entry, and counter items bought in game)
```

Every term is listed under the enemy in the overlay, so the ranking is always explainable. Roles of enemies without an API-assigned position are inferred from `typicalRoles` and Smite.

### How the jungle plan works

Each path in `jungle/amumu-paths.json` has a `baseScore` and lists of `favors` / `avoid` rules, each with a condition, a weight and a reason:

1. Lane states come from the laners' `earlyGame` values (plus a small bonus for a ranged laner against a melee one): *priority*, *even*, *losing*, or *unknown* while picks are hidden.
2. Conditions such as `end-lane-priority`, `end-lane-gank-setup` and `enemy-jungler-invader` are evaluated to true, false or unknown. Unknown never counts.
3. score = `baseScore` + favors − avoids. The highest score wins, and ties keep the file order (safer paths first).

Paths name camps by buff side (`blue-buff-side` / `red-buff-side`). The app maps that to top or bot for the side you are on. The weights are a first pass and are meant to be tuned.

## Development

```powershell
npm run typecheck
npm test               # vitest: threat scoring, role inference, path selection, data validation, rank themes, companion layout, fixtures end-to-end
npm run test:rust      # cargo: lockfile parsing, loopback-only TLS, WAMP frames, ranked stats, asset paths, overlay geometry, settings, fixtures
npm run validate:data
```

CI (`.github/workflows/ci.yml`) runs data validation, typecheck and the TypeScript tests on Ubuntu, and the web build and Rust tests on Windows.

### Layout

```
data/               curated JSON + schemas
fixtures/scenarios/ mock-mode API replays (generated by scripts/make-fixtures.mjs)
scripts/            validate-data.ts, make-fixtures.mjs
src/                frontend (vanilla TypeScript)
  data/             loading + validation of the curated data
  domain/           pure logic: match normalization, roles, threat, warnings, jungle planner, in-game notes
  theme/            rank palettes (ranks.ts), theme resolution, appearance settings
  ui/               shell (app.ts), store, crest, particles, views (champ select, in game, idle, appearance, dev panel)
  ui/companions/    sprite metadata (eyes, seat, ribbon), placement presets, companion layer + expressions
  styles/           theme.css (tokens), panel.css, components.css, companions.css
  assets/           ranked emblems, companion sprites (gwen.png, amumu.png)
src-tauri/src/      Rust backend
  lockfile.rs       LCU lockfile discovery and parsing
  tls.rs            127.0.0.1-only certificate verifier
  lcu.rs            LCU WebSocket + polling connector
  ranked.rs         ranked tier from the LCU (rank theme)
  live.rs           Live Client Data poller
  overlay.rs        window modes, click-through, placement, docking
  settings.rs       settings.json
  ddragon.rs        Data Dragon cache + art protocol (champion/item/ability icons, splash)
  mock.rs           fixture replay
```
