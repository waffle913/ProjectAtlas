# Audit follow-up — consolidated triage (2026-10-17)

This is the Phase B one-pass triage of the repository-wide audit follow-up
directive, validated against the actual GitHub HEAD at inspection time:

- Branch `waffle913-interface-033`, HEAD `b6267b0bf9391727b92290b1cab43188ef95895d` (local == `origin/waffle913-interface-033`).
- `main` HEAD `ee82bb918e7a1d093d723a4408bb0f1bd197f1c9`; sealed human-accepted baseline `0.24` (`6b6794e`); last autonomously-validated `0.32` (`9d5d640`, merged as `ee82bb9`).
- CI at inspection: run `39053360096` (head `b6267b0`) `in_progress`; previous run `39051055238` (head `455d967`) `success`.

Each finding is re-validated against HEAD. `CONFIRMED` = defect is present in the
current code; `PROBABLE` = plausible risk not yet demonstrated; `GAP` = a missing
capability or overstatement, not a code defect.

## 1. Consolidated matrix

| ID | Finding | Verdict | Evidence at HEAD | Dependency |
|----|---------|---------|------------------|------------|
| A1 | Native writes not acknowledged / false save success | **CONFIRMED** | `src/app/desktop.ts:30-31,49-50` — `void invoke(...).catch(() => {})`; `SaveBackend.write/remove` are `void`; `save_file_write` uses non-atomic `fs::write` (`src-tauri/src/lib.rs:54-58`) | none |
| A2 | Async backend-init race (browser vs desktop storage) | **CONFIRMED** | `src/App.tsx:115` `void initDesktopBackends()` vs synchronous `loadSettings()`/`listSaves()` at `:110,:113`; no reload after init | none |
| A3 | Browser storage failures silently ignored | **CONFIRMED** | `src/app/saveStorage.ts:45` and `src/app/preferences.ts:59` catch and discard `localStorage` failures | none |
| B1 | Autosave setting not connected to autosaving | **CONFIRMED** | `src/app/preferences.ts:29-30` + `SettingsMenu.tsx:88-93` expose `autosave`/`autosaveIntervalMinutes`; no autosave effect/scheduler in `src/App.tsx` | A1/A2 (needs reliable save) |
| C1 | Regular CI does not validate the desktop release | **CONFIRMED** | `.github/workflows/desktop-windows.yml:4-8` triggers only on `waffle913-v1-playable-shell-desktop`; `verify.yml` is TS/Vitest only | A1 (needs native tests) |
| D1 | 0.33 completion status overstated | **CONFIRMED (partial)** | `docs/integration-gap-0.33.md` uses a single `integrated`/`partial`/`unimplemented` status per row; e.g. 0.33.3 "integrated" = navigation+reads, not commands/consequences/tests | Phase D |
| R1 | Clock replacement resets fractional elapsed time | **PROBABLE** | `src/App.tsx:265,326` build `new SimulationClock(...)` on every `applyState`/`commitCommand`; `clock.ts:14` inits `elapsed = 0` | demonstrated only for `commitCommand` |
| R2 | Large accumulated elapsed after suspension | **PROBABLE** | `clock.ts:45-50` loops `wholeDays` synchronously; a throttled `setInterval` (App `:216`) can produce a large `now - previous` | 0.33.8 time controls |
| R3 | Crisis benchmark lacks positive causal scenario | **GAP (partial)** | `crisisWorld.test.ts:32-68` reports `activeEpisodes` but never asserts > 0; positive unit cycle exists in `crisis.test.ts:219-237` | Phase E |
| R4 | Historical-data admissibility (2026-01-01 cutoff) | **NOT CONFIRMED / deferred** | Data-initialization provenance is enforced in the data layer; the extensive calibration/world-data campaign is 0.34 scope | 0.34 |

## 2. Root causes and affected dependencies

- **A1/A3** root cause: the persistence boundary (`SaveBackend`/`StorageBackend`) is
  fire-and-forget by design; success is reported by the in-memory cache, never by the
  storage medium. Fix must change the contract to `Promise`-returning writes and make
  every caller await and surface the result.
- **A2** root cause: backend swap is a side-effectful `useEffect` with no lifecycle
  state; React reads settings/saves before the swap completes. Fix introduces an
  explicit `storageState` and reloads after init.
- **B1** root cause: the setting exists in the model/UI but no runtime consumer was
  wired. Fix implements a wall-clock autosave effect (never a simulation scheduler),
  gated on storage readiness and a dedicated autosave slot.
- **C1** root cause: the desktop workflow's `on.push.branches` list was frozen to the
  legacy shell branch when the desktop backend landed.

## 3. Execution order (agreed priority sequence)

- **Phase B** — this triage.
- **Phase C** — data durability first (A1, A2, A3, B1), then C1 desktop CI.
- **Phase D** — remaining authorized 0.33 functional integration + matrix revision.
- **Phase E** — targeted regression tests, positive crisis scenario (R3), R1 fix,
  GitHub CI on Ubuntu + Windows, independent review.
- **Phase F** — 0.34 only when the completion gates permit.

## 4. Confirmed defects — correction criteria

### A1 / A3 — persistence must be awaitable and honest
1. `SaveBackend.write/remove` and `StorageBackend.set/remove` return `Promise<void>`.
2. `saveGame`/`deleteSave`/`renameSave` and `saveSettings` await the medium and surface
   rejection to the caller; no caller reports success before the write resolves.
3. Browser `localStorage` failures (quota, unavailable) reject instead of being
   swallowed.
4. Save data and save index are written in an order that cannot index a missing save,
   and an index-write failure is surfaced (not silently divergent) while preserving
   the already-written save data.
5. Native writes are serialized so an older queued write cannot overwrite a newer one.

### A2 — explicit storage lifecycle
1. `storageState` (`initializing | ready | error`) gates persistence-sensitive actions.
2. Settings and save listings reload after native init completes.
3. Init errors are recorded and surfaced; there is no silent fallback from the native
   location to browser `localStorage`.

### B1 — autosave
1. Respect `gameplay.autosave` and `gameplay.autosaveIntervalMinutes`.
2. Dedicated autosave slot (`slot.autosave`); never overwrites a named user save.
3. No overlapping autosaves; failures surfaced; wall-clock only (no simulation
   scheduler).

### C1 — desktop CI
1. Desktop build + native persistence tests run for relevant current branches.
2. Rust unit tests cover the native save/settings commands (atomic write, safe id).
3. Packaging stays distinguishable from TS/Vitest `verify`.

## 5. Deferred / documented (no action this block)

- **R2** — full remediation belongs to 0.33.8 (time controls / interruption); the
  deterministic advancement is already correct, only the UX chunking is missing.
- **R4** — 0.34 calibration campaign; no fabrication of post-2026-01-01 records.
- **0.25–0.32 engine integration matrix** — the 0.26–0.32 layers are contract/vocabulary
  only by design; their wiring is the substance of 0.33 (tracked in
  `docs/integration-gap-0.33.md`). No second engine is introduced.
