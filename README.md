# Rift Advisor

A small desktop overlay for League of Legends with pre-game matchup notes for **Gwen (top)** and **Amumu (jungle)**:

- **Champ select:** threat ranking of the enemy team with the reason for every point, lane matchup card (tips, danger abilities, power spikes, item/rune adjustments), team-comp warnings and, for Amumu, a pre-game jungle path plan.
- **In game:** a compact panel docked to a screen edge with the same reference info, item counters the enemy has bought, and the lane opponent's level spikes.

Built with Tauri 2 (Rust) and TypeScript.

## What it does not do

Rift Advisor reads data **only** from Riot's official local APIs:

| API | Used for |
| --- | --- |
| LCU API (League client, `https://127.0.0.1:<port>`; auth from the client's `lockfile`) | `/lol-gameflow/v1/gameflow-phase` and `/lol-champ-select/v1/session`, via the LCU WebSocket (`OnJsonApiEvent`) with HTTP polling as a fallback |
| Live Client Data API (`https://127.0.0.1:2999/liveclientdata/allgamedata`) | Champions, levels and items while in game |
| Data Dragon (`ddragon.leagueoflegends.com`) | Champion list and icons, cached locally |

It does **not** use keyboard/mouse hooks, memory reading, screen capture, minimap reading or injection. Global hotkeys are registered with the standard Windows `RegisterHotKey` API. The self-signed Riot certificates are accepted **only for `127.0.0.1`** (see `src-tauri/src/tls.rs`). Every other host gets normal certificate verification.

It also never makes decisions for you or gives real-time "go here now" instructions in game. Everything shown is pre-game planning or static reference info. The jungle plan is visible for the first 90 s of the game (loading screen and the first clear), then collapses to a single line.

> Rift Advisor is not endorsed by Riot Games. It is designed to stay within Riot's third-party application rules (official APIs only, no automation, no information the game does not already give you), but you use it at your own risk. Check Riot's current developer policies before you distribute it.

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

Start Rift Advisor before or after the League client; it connects automatically. The tray icon menu has *Show / hide*, *Interactive mode* and *Quit*.

The header shows the connection state:

| State | Meaning |
| --- | --- |
| Client not running | No League client `lockfile` was found. Start the client, or set `leagueInstallDir` (see below) if League is installed somewhere unusual. |
| API unreachable | The lockfile exists but the client did not answer (it is starting up or shutting down). It retries every 3 s. |
| Connected · websocket / polling | Live events, or the 1 s polling fallback. |
| Unsupported champion | You picked something other than Gwen or Amumu. The overlay shows a short note and stays out of the way. |
| Missing data | No curated data file for your champion, or the file failed validation. Run `npm run validate:data` to see why. |

### Display modes

The overlay switches mode automatically from the gameflow phase:

| Phase | Mode |
| --- | --- |
| No client, lobby, matchmaking | idle (small status card) |
| ChampSelect | full panel (460 px wide) |
| GameStart / InProgress | compact panel docked to a screen edge |
| EndOfGame | hidden |

The window is transparent, frameless, always on top and **click-through**, so the game receives every click. Turn on *interactive mode* to scroll, collapse sections or drag the panel by its header. The in-game panel snaps to the nearest screen edge after a drag. Positions are remembered per mode, kept inside the monitor's work area, and are DPI-aware.

### Hotkeys

| Default | Action |
| --- | --- |
| `Ctrl+Shift+A` | Show / hide the overlay |
| `Ctrl+Shift+Z` | Toggle interactive mode (click-through off / on) |

### Settings file

`%APPDATA%\dev.rosengarten.riftadvisor\settings.json` is created on first start. Any field you leave out falls back to its default. Restart the app after editing it.

```json
{
  "hotkeys": { "toggleVisibility": "Ctrl+Shift+A", "toggleInteractive": "Ctrl+Shift+Z" },
  "leagueInstallDir": "D:/Games/League of Legends",
  "positions": {},
  "dock": "right"
}
```

- `leagueInstallDir`: only needed if the client cannot be found. By default the app looks in `C:\Riot Games\League of Legends`, then next to the running `LeagueClientUx.exe`.
- `positions` / `dock`: saved window positions and the docking edge. Delete them to reset placement.

Data Dragon files are cached in `%LOCALAPPDATA%\dev.rosengarten.riftadvisor\ddragon`. The app also works offline with the last cached version.

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
npm test               # vitest: threat scoring, role inference, path selection, data validation, fixtures end-to-end
npm run test:rust      # cargo: lockfile parsing, loopback-only TLS, WAMP frames, overlay geometry, settings, fixtures
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
  ui/               store + views (champ select, in game, idle, dev panel)
src-tauri/src/      Rust backend
  lockfile.rs       LCU lockfile discovery and parsing
  tls.rs            127.0.0.1-only certificate verifier
  lcu.rs            LCU WebSocket + polling connector
  live.rs           Live Client Data poller
  overlay.rs        window modes, click-through, placement, docking
  settings.rs       settings.json
  ddragon.rs        Data Dragon cache + icon protocol
  mock.rs           fixture replay
```
