# V1 desktop playable shell

**Status:** implemented for review, not accepted. Schema 18 (simulation core unchanged).

## Desktop architecture

The simulation core stays platform-independent. The desktop shell adds a thin
application layer (`src/app/`) that owns presentation state and persistence:

- `src/app/preferences.ts` — persistent `AppSettings` (graphics/audio/interface/
  gameplay/accessibility) behind a `StorageBackend` adapter. Browser uses
  `localStorage`; the desktop build swaps in a Tauri filesystem/config backend.
- `src/app/saveStorage.ts` — save management (list/save/load/delete/rename) behind
  a `SaveBackend` adapter. Saves never live in the git repository; the desktop
  build stores them under Windows application-data.

## Main Menu

`src/components/MainMenu.tsx` is the startup screen: Continue (most-recent save,
disabled when none), New Game, Load Game, Settings, Credits / Data Sources, Exit.

## Settings

`src/components/SettingsMenu.tsx` exposes five categories — Graphics/Video,
Audio, Interface, Gameplay, Accessibility — with restore-defaults. Only
genuinely functional options remain: display mode (native window), UI scale and
high-contrast/reduced-motion (CSS). Non-functional VSync, frame-rate and
map-quality controls were removed rather than left as placebo. Values persist
independently of `SimulationState` and survive restart.

## Save / Load / Delete

`src/components/SaveManager.tsx` lists saves with metadata (name, Country,
controlled person, office, simulation date, schema), supports Load and
confirmation-gated Delete. The in-game pause menu offers Save / Save As / Load /
Settings / Return to Main Menu / Exit. Saves are canonical serialized
`SimulationState`; corrupt saves fail safely with a game-facing error.

## UI / map

The map remains the central surface. Player navigation covers Government,
Economy, Fiscality, Services, Politics, Diplomacy, Trade, Security, Military,
Operations and Treaties; systems not represented in V1 are shown as unavailable
and never fabricate capabilities. Obsolete milestone/candidate/debug copy has
been removed from the player-facing surface.

## Party and leader presentation

- Party display names are deterministic recognizable fictional analogues derived
  from each sourced party's stem (e.g. "Cambodian People's Party (CPP)" →
  "Cambodian Peoples Coalition CPP"), never a rotating generic family list, and
  never a verbatim copy. Ideology still comes from sourced/derived evidence, not
  the name.
- Initial fallback leaders use deterministic, culturally plausible regional
  given/family name pools keyed by the Country's continent/subregion, replacing
  the synthetic syllable generator. Provenance marks them `modelled_fallback`.
- The leader-evidence pipeline enumerates all 948 parties: 35 have a reviewed
  Party-Facts/Wikidata bridge, 7 have dated 2026-01-01 leadership evidence with a
  reviewed analogue, 1 is ambiguous, and 941 remain explicit modelled fallbacks
  (no dated evidence exists, so none is fabricated).
- Reviewed real-leader analogues and post-start succession behaviour are
  unchanged.

## Tauri integration

`src-tauri/` holds the Tauri v2 desktop configuration and a native command layer
(save list/read/write/delete, settings read/write, display-mode, exit) that
stores saves under `<app-data>/saves/*.json` and settings at
`<app-data>/settings.json`. `src/app/desktop.ts` detects the Tauri runtime at
startup and swaps the browser localStorage backends for the native ones
(memory-cached with async persistence). The desktop build wraps the Vite
frontend in a native resizable window, bundles all local map/data assets, and
closes cleanly — no `npm run dev`, no localhost, no Node/Rust needed at runtime.

Windows native packaging is validated by the dedicated
`.github/workflows/desktop-windows.yml` job, which installs stable Rust, builds
the frontend and Tauri release, and uploads the `.exe` and NSIS installer as a
GitHub Actions artifact.

## Developer commands

- `npm run build` — Vite production frontend build.
- `npm test -- --maxWorkers=1` — full serial test suite.
- `npm run v1:audit` — orchestrated V1 audits + endurance + stress.
- `npm run tauri dev` / `npm run tauri build` — desktop dev/build (requires Rust).

## Release build

- `npm run tauri build` produces the Windows executable and installer under
  `src-tauri/target/release/bundle/`.

## Remaining non-blocking limitations

- The desktop packaging requires the Rust/Tauri toolchain; on machines without
  it, only the browser shell build is available (this session had no Rust
  toolchain, so the `.exe`/installer were not produced here).
- No audio/music assets yet; audio settings are persisted and ready.
- Police/intelligence/justice navigation exists only as future/unavailable.
- Resolution/frame-rate settings apply via the native window and are not
  re-implemented inside the WebView.
