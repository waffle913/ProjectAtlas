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
Audio, Interface, Gameplay, Accessibility — with restore-defaults. Values persist
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
- Reviewed real-leader analogues and post-start succession behaviour are
  unchanged.

## Tauri integration

`src-tauri/` holds the Tauri v2 desktop configuration. The desktop build wraps
the Vite frontend in a native resizable window (minimum size configured), bundles
all local map/data assets, provides desktop save/settings persistence, and closes
cleanly — no `npm run dev`, no localhost, no Node/Rust needed at runtime.

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
