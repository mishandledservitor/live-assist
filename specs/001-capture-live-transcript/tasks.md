---

description: "Task list for 001 Capture & live transcript"
---

# Tasks: Capture & Live Transcript

**Input**: Design documents from `specs/001-capture-live-transcript/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required. Constitution III and CLAUDE.md rule 9 make TDD non-negotiable: every test task below is written first and seen failing for the right reason before the implementation task that follows it. No automated test may need network, a microphone, a meeting or a real key.

**Organization**: Setup → Foundational → spikes (US6, sequenced early because their findings decide FR-028 and the language default) → user stories in priority order → polish.

**Clarifications (2026-10-07)**: no manual mic pause in 001 — the mic is transcribed continuously until 002 follows Meet's mute state (FR-021); the headphones notice shows at Start until "Don't show again" (FR-028). Tasks marked `[FR-028]` ship only if Spike A finds duplication. Update 2026-10-08: T047/T048 and Phase 9 (`[FR-028]`) are deferred out of v1 (design decisions 26–27). Update 2026-10-08: one mixed stream and one session per meeting, every 001 line "Others" (constitution v1.1.0, decisions 28–30) — Phase 11; earlier phases' two-session wording is kept as history.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US6 from spec.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: an empty extension that builds, lints, type-checks, runs an empty test suite and passes CI.

- [X] T001 Initialise the pnpm project: `package.json` (name `live-assist`, `private: true`, `packageManager` pnpm, scripts `dev`, `build`, `build:spike`, `build:e2e`, `lint`, `typecheck`, `test`, `test:e2e`, `spike:echo`, `spike:language`), `.nvmrc` (Node LTS), `pnpm-lock.yaml`
- [X] T002 Add WXT + React: `wxt.config.ts` (`srcDir: 'src'`, `@wxt-dev/module-react`, manifest name/description, permissions `sidePanel`, `tabCapture`, `offscreen`, `storage`, `activeTab`, host permission `https://api.elevenlabs.io/*`, `filterEntrypoints` excluding `spike-recorder` unless `mode === 'spike'`), placeholder `src/entrypoints/background.ts` and `src/entrypoints/sidepanel/{index.html,main.tsx,App.tsx}`
- [X] T003 [P] TypeScript strict config in `tsconfig.json` (extends WXT's, adds `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) and `pnpm typecheck` = `wxt prepare && tsc --noEmit`
- [X] T004 [P] ESLint flat config with typescript-eslint (type-aware) + react-hooks in `eslint.config.js`, Prettier in `.prettierrc` and `.prettierignore`; a lint rule (`no-restricted-imports`) forbidding `chrome`/DOM-dependent modules from `src/core/**`
- [X] T005 [P] Vitest config in `vitest.config.ts` (projects: `unit` node, `dom` jsdom for React components, `integration`), `fake-indexeddb` and `@testing-library/react` dev deps, one trivial passing test `tests/unit/smoke.test.ts`
- [X] T006 [P] Playwright config in `playwright.config.ts` and extension fixture `tests/e2e/fixtures.ts` that launches Chromium persistent context with `--load-extension=.output/chrome-mv3-e2e`, fake media flags (`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`, `--use-file-for-fake-audio-capture=tests/fixtures/audio/speech-like.wav`) and exposes the extension id; one smoke spec `tests/e2e/smoke.spec.ts` opening the side panel page
- [X] T007 [P] GitHub Actions workflow `.github/workflows/ci.yml`: on PR and push to main — pnpm install (cached), lint, typecheck, `pnpm test`, `pnpm build`, `pnpm build:e2e`, Playwright install chromium, `xvfb-run pnpm test:e2e`; no secrets used
- [X] T008 [P] Extend `.gitignore` with `.output/`, `.wxt/`, `spikes/data/`, `playwright-report/`, `test-results/`, `.codegraph/` (check CodeGraph docs whether the index should be committed; ignore only if not)
- [X] T009 Install and initialise CodeGraph per CLAUDE.md rule 8 (`npm i -g @colbymchenry/codegraph` if missing, `codegraph install`, `codegraph init` in repo root) and document the commands in CLAUDE.md "Commands" — done 2026-10-07: CLI 1.5.0 already installed and its MCP server already wired in the user's Claude Code config, so `codegraph install` (which rewrites agent config and permissions) was not re-run; `codegraph init` built the index; `.codegraph/` is gitignored (CodeGraph's own `.codegraph/.gitignore` marks the index machine-local)
- [X] T010 Add CLAUDE.md sections "Structure", "Commands" and "CI/CD" now that they are real (CLAUDE.md template comment), keeping text unwrapped (rule 11)

**Checkpoint**: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` green locally and in CI.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: contracts, data model, storage, protocol codec, audio conversion and capture plumbing that every story uses.

### Capture-gesture check (do first — de-risks R5)

- [X] T011 Minimal capture wiring for the check: `src/entrypoints/background.ts` sets `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` and handles a temporary `debug/capture` message by calling `chrome.tabCapture.getMediaStreamId({ targetTabId })`, creating the offscreen document (`src/entrypoints/offscreen/{index.html,main.ts}`, reason `USER_MEDIA`) which opens the tab stream and plays it to `AudioContext.destination`; a temporary button in `src/entrypoints/sidepanel/App.tsx` — temporary, non-shipping diagnostic wiring (CLAUDE.md rule 10 exception), deleted by T062
- [X] T012 USER: run the "Capture gesture" manual check in `quickstart.md` on a real Meet tab and record outcome (does action-click-opened panel get `activeTab`? audio still audible?) in `specs/001-capture-live-transcript/manual-check.md`; if it fails, update research R5 before continuing — PENDING USER: build and checklist ready in `manual-check.md` ("Capture gesture"); T013–T037 do not depend on its result (only T062/T067 in Phase 5 do) — DONE 2026-10-08: run 1 FAIL (openPanelOnActionClick does not grant activeTab); fixed on branch `001-capture-gesture-fix` (action.onClicked → sidePanel.open, test in `tests/unit/background/action-click.test.ts`); run 2 PASS on YouTube and a real Meet call. Research R5 revised. T062/T066: Start must detect "not invoked on this tab" and tell the user to click the toolbar icon on the meeting tab.

### Contracts and model

- [X] T013 [P] Write failing tests for `formatOffset`, segment ordering and segment id rules in `tests/unit/core/transcript/model.test.ts` (data-model.md: `mm:ss` < 1 h, `h:mm:ss` ≥ 1 h; order by startMs, tab before mic, seq)
- [X] T014 [P] Implement transcript types (`Meeting`, `TranscriptSegment`, `LabelSource`, `StreamId`, `LanguageMode`) and helpers in `src/core/transcript/model.ts` and `src/core/transcript/ordering.ts` to pass T013
- [X] T015 [P] Write the shared contract suite `tests/contract/platform-adapter.contract.ts` and failing test `tests/unit/core/platform/generic-adapter.test.ts` (unsupported captions/mute with non-empty reasons, registry falls back to generic)
- [X] T016 [P] Implement `PlatformAdapter` contract, `GenericAdapter` and `PlatformRegistry` in `src/core/platform/{adapter.ts,generic-adapter.ts,registry.ts}` to pass T015 (contracts/platform-adapter.md)
- [X] T017 [P] Write failing tests for settings schema and keyterm validation in `tests/unit/core/settings/settings.test.ts` (name 1–60 chars; ≤50 keyterms, ≤20 chars, case-insensitive dedupe, over-limit terms flagged not dropped)
- [X] T018 [P] Implement `src/core/settings/{schema.ts,keyterms.ts}` to pass T017
- [X] T019 [P] Write failing tests for the status reducer in `tests/unit/core/status/status.test.ts` (initial snapshot; generic adapter → speakerNames unavailable with reason; per-stream transitions from data-model.md; retention summary present)
- [X] T020 [P] Implement `StatusSnapshot` types and reducer in `src/core/status/status.ts` to pass T019
- [X] T021 [P] Write failing tests for message validators in `tests/unit/core/messaging/protocol.test.ts` (every message in contracts/extension-messages.md accepted; malformed/unknown rejected; no field named like key/token allowed)
- [X] T022 [P] Implement the message union and validators in `src/core/messaging/protocol.ts` to pass T021

### Storage

- [X] T023 [P] Write failing integration tests on `fake-indexeddb` in `tests/integration/storage/meeting-repo.test.ts`: create meeting, append segment (idempotent on same id), list segments ordered, end meeting, mark orphaned open meetings `crashed`, hard-delete meeting + its segments, latest meeting lookup
- [X] T024 Implement `src/storage/db.ts` (idb schema v1: `meetings` keyPath id + `startedAt` index; `segments` keyPath id + `meetingId` and `[meetingId,startMs]` indexes) and `src/storage/meeting-repo.ts` to pass T023
- [X] T025 [P] Write failing tests in `tests/unit/storage/settings-store.test.ts` with an in-memory `chrome.storage.local` fake: settings round-trip, `credentials` kept under a separate key, `keyHint()` returns only last 4 chars, nothing ever written to `storage.sync`
- [X] T026 Implement `src/storage/settings-store.ts` to pass T025

### Credential source

- [X] T027 [P] Write the credential contract suite `tests/contract/credential-source.contract.ts` and failing tests `tests/unit/providers/credentials/local-key-source.test.ts` (stubbed fetch: POST `/v1/single-use-token/realtime_scribe` with `xi-api-key`; 401→invalid, 403→forbidden, 429→rate-limited, throw→network, no key→missing; fresh token per call; key string never appears in errors or console output)
- [X] T028 Implement `CredentialSource`, `CredentialError` and `LocalKeyCredentialSource` in `src/providers/credentials/{credential-source.ts,local-key-source.ts}` to pass T027 (contracts/credential-source.md)

### Transcription provider

- [X] T029 [P] Create fixtures `tests/fixtures/elevenlabs/{happy-path,drop-mid-partial,time-limit,auth-error,quota-error,no-detail-after-commit,unknown-message}.jsonl` in the format of contracts/transcription-provider.md, plus `tests/support/fake-websocket.ts` that replays them on Vitest fake timers and records outbound messages
- [X] T030 [P] Write failing tests for the ElevenLabs codec in `tests/unit/providers/transcription/elevenlabs/messages.test.ts`: URL builder (all params from research R2, language omitted for auto, keyterms as repeated keys), `input_audio_chunk` serialisation (`previous_text` only on first chunk), server message parsing incl. unknown types ignored, error type → `ProviderErrorKind` mapping table
- [X] T031 Implement `src/providers/transcription/elevenlabs/{url.ts,messages.ts,errors.ts}` to pass T030
- [X] T032 Write the provider contract suite `tests/contract/transcription-provider.contract.ts` (behaviours 1–6 in contracts/transcription-provider.md) and run it against `ElevenLabsRealtimeProvider` with `FakeWebSocket` and a `StaticCredentialSource` in `tests/integration/providers/elevenlabs-provider.test.ts` — failing
- [X] T033 Implement `TranscriptionProvider` contract in `src/providers/transcription/provider.ts` and `ElevenLabsRealtimeProvider` in `src/providers/transcription/elevenlabs/realtime-provider.ts` (injected WebSocket constructor and CredentialSource) to pass T032
- [X] T034 [P] Implement `FakeTranscriptionProvider` replaying fixture JSONL in `src/providers/transcription/fake/fixture-provider.ts`, run against the same contract suite in `tests/integration/providers/fake-provider.test.ts` (test first)

### Audio

- [X] T035 [P] Write failing tests in `tests/unit/audio/pcm.test.ts`: stereo→mono downmix, Float32→Int16 LE clamp/rounding, 100 ms framing at 16 kHz (1600 samples) across uneven input blocks, base64 encoding of Int16 frames, silence frame generation
- [X] T036 Implement pure functions in `src/audio/pcm.ts` to pass T035, and the thin AudioWorklet `src/audio/pcm16-worklet.ts` that uses them and posts frames
- [X] T037 Write failing tests in `tests/unit/audio/capture.test.ts` with fake `navigator.mediaDevices`, `AudioContext` and `AudioWorkletNode` (tab constraints use `chromeMediaSource: 'tab'` + the stream id; mic constraints passed through; capture contexts at 16 kHz; playback context at device rate; stop() stops every track and closes every context), then implement `src/audio/capture.ts` (tab and mic frame sources) and `src/audio/playback.ts` (tab stream → `AudioContext.destination`) to pass them; real-device behaviour is covered by e2e and the manual check

**Checkpoint**: contracts implemented and fixture-tested; capture plumbing proven on a real tab (T012).

**Implementation notes (Phases 1–2, 2026-10-07)** — read before Phase 3+:

- TypeScript is pinned to 5.9 (typescript-eslint supports < 6.1; TS 7 is out). WXT auto-imports are off (`imports: false`): import `defineBackground` etc. explicitly, which keeps `chrome`/`browser` use visible to the `src/core` lint boundary (`no-restricted-globals` + `no-restricted-imports`).
- Vitest projects: `unit` (node, `tests/unit/**/*.test.ts`), `dom` (jsdom, `tests/unit/**/*.test.tsx`), `integration` (node + `fake-indexeddb/auto`). Contract suites are `tests/contract/*.contract.ts` functions imported by a test file.
- `CredentialErrorKind` lives in `src/core/messaging/protocol.ts` (core cannot import providers) and is re-exported by `credential-source.ts`. The protocol's partial type is `PartialLine` (not `Partial`, which shadows the TS utility type). `createReceiver(parse)` counts dropped messages.
- `ElevenLabsRealtimeProvider` closes the socket itself after any server error (so every error is exactly one `error` then one `closed`) and buffers session events until the first `on()` subscriber.
- The replaying socket lives in `src/providers/transcription/fake/replay-socket.ts`; `FakeTranscriptionProvider` runs the real ElevenLabs client over it. For the e2e build (T067) bundle fixtures with `?raw` + `parseFixture`, and script them long enough (or per connection via the function form) for the e2e flow.
- Audio: `captureTab`/`captureMic` take injected deps; `src/audio/browser-deps.ts` supplies the real ones (worklet bundled via `?worker&url`, verified self-contained). The worklet node has no outputs (sink), so nothing reaches the speakers from the 16 kHz context.
- Status reducer ignores invalid transitions; `reset` returns streams/capture to idle for a new meeting.
- `.gitignore`'s broad `credentials/` secret pattern now has negations for `src/providers/credentials/` and `tests/unit/providers/credentials/`. T089's secret scan must tolerate the obviously fake `sk_test_fixture_…` strings in tests (or scan only build output and `tests/fixtures/`).
- Still unverified (first live session): keyterms/secondary_languages encoded as repeated query keys (research R2).

---

## Phase 3: User Story 6 - Quality checks with my own audio (Priority: P3, sequenced early) — spikes

**Goal**: the user can measure echo duplication and mixed Greek/English accuracy on real audio and get a findings record with a recommendation.

**Independent Test**: run each spike per quickstart.md; each writes a findings file with metrics and a recommendation.

- [X] T038 [P] [US6] Write failing tests for scoring in `tests/unit/spikes/scoring.test.ts`: text normalisation (case, punctuation, Greek tonos folding), WER and CER on known pairs incl. mixed-script text, echo duplicate rule (time overlap ±1.5 s and token overlap ≥0.6) on synthetic segment lists
- [X] T039 [US6] Implement `spikes/lib/scoring.ts` to pass T038
- [X] T040 [P] [US6] Write failing tests for `spikes/lib/wav.ts` in `tests/unit/spikes/wav.test.ts` (parse PCM16/Float32 WAV headers, mono downmix, resample to 16 kHz on a generated sine)
- [X] T041 [US6] Implement `spikes/lib/wav.ts` to pass T040 (ffmpeg used for non-WAV input when present, clear error otherwise)
- [X] T042 [US6] Implement `spikes/lib/stream.ts`: Node realtime streamer that reuses `src/providers/transcription/elevenlabs/{url,messages}.ts`, authenticates with the `xi-api-key` header from the `ELEVENLABS_API_KEY` environment variable (fails with a clear message if unset; never logs it), streams a 16 kHz clip in real time in 100 ms frames and returns committed segments with word timings; test it against `FakeWebSocket` fixtures in `tests/integration/spikes/stream.test.ts` (test first)
- [X] T043 [US6] Implement `spikes/language.ts` (`pnpm spike:language <dir>`): pairs clips with `.txt` references, runs configs auto / `el` / `en` / `el`+`secondary_languages=[en]`, writes `specs/001-capture-live-transcript/spike-findings/language.md` (per-config mean WER/CER table, per-clip rows, recommendation per research R8) and raw JSON to `spikes/data/language/results/`
- [X] T044 [US6] Implement the dev-only recorder page `src/entrypoints/spike-recorder/{index.html,main.tsx}` (built only by `pnpm build:spike`): guided run list (headphones+AEC on, speakers+AEC on, speakers+AEC off, speakers+`echoCancellation:"all"` when `getCapabilities` reports it), records tab and mic via `src/audio/capture.ts` to two 16 kHz mono WAVs per run plus `run.json` (conditions, Chrome version, applied mic settings), saved through a download — dev-only, never shipped; its capture calls go through the tested `src/audio/capture.ts`
- [X] T045 [US6] Implement `spikes/echo.ts` (`pnpm spike:echo <dir>`): streams each run's `tab.wav` and `mic.wav`, applies the duplicate rule, writes `specs/001-capture-live-transcript/spike-findings/echo.md` (duplication rate per run, recommendation per research R7 decision rule)
- [X] T046 [P] [US6] Write `spikes/README.md` (how to run both spikes, privacy notes: data stays in gitignored `spikes/data/`, key only in the shell) and findings templates `specs/001-capture-live-transcript/spike-findings/{echo.md,language.md}` with "Not yet run" placeholders
- [ ] DEFERRED 2026-10-08 per design decision 26/27 — T047 [US6] USER: run Spike B (language) per quickstart.md, review and commit `spike-findings/language.md` — PENDING USER: harness ready (`spikes/README.md` → Spike B; needs your clips + `.txt` references in `spikes/data/language/` and `export ELEVENLABS_API_KEY=…` in the shell)
- [ ] DEFERRED 2026-10-08 per design decision 26/27 — T048 [US6] USER: run Spike A (echo) per quickstart.md, review and commit `spike-findings/echo.md`; the result decides whether T087–T088 ship `[FR-028]` — PENDING USER: harness ready (`spikes/README.md` → Spike A; `pnpm build:spike`, recorder page, a Meet call with someone reading, then `pnpm spike:echo`)

**Checkpoint**: both harnesses runnable. Spike runs T047/T048 are deferred (design decisions 26–27, 2026-10-08): mixed Greek/English is validated in real meetings instead, with Automatic as the default and the per-meeting override as fallback; the echo spike and FR-028 are out of v1 because the user always wears headphones. Nothing in Phases 4–8 or 10 waits on them.

---

## Phase 4: User Story 2 - First-run setup and settings (Priority: P1)

**Goal**: name + key (validated, masked), retention notice, key terms, consent toggle, mic permission granted once.

**Independent Test**: fresh install → complete setup → restart browser → values persist, key masked, Start enabled only when complete (e2e).

- [X] T049 [P] [US2] Write failing component tests in `tests/unit/sidepanel/setup.test.tsx`: first-run form requires name and key; Save triggers `settings/validate-key`; invalid/forbidden/network results show plain-language messages; saved key shown as `••••a1b2`; retention notice text present and contains no zero-retention claim
- [X] T050 [US2] Implement `src/entrypoints/sidepanel/components/Setup.tsx` and wire it into `App.tsx` (shown until `firstRunComplete`) to pass T049
- [X] T051 [P] [US2] Write failing component tests in `tests/unit/sidepanel/settings.test.tsx`: edit name, replace/remove key, keyterm add/edit/remove with flagged over-limit terms, consent reminder toggle (default on)
- [X] T052 [US2] Implement `src/entrypoints/sidepanel/components/Settings.tsx` to pass T051
- [X] T053 [US2] Handle `settings/validate-key` in `src/entrypoints/background.ts` using `LocalKeyCredentialSource` (test first in `tests/unit/background/validate-key.test.ts` with stubbed fetch and storage)
- [X] T054 [US2] Implement the mic permission page `src/entrypoints/mic-permission/{index.html,main.ts}` (calls `getUserMedia({audio:true})`, stops tracks, reports granted/denied, explains why) and open it from setup (test first in `tests/unit/mic-permission/mic-permission.test.ts` with a mocked `getUserMedia`: granted, denied, no device); record that the offscreen document then gets the mic without a prompt in `manual-check.md` — done 2026-10-07: page, tests and setup/settings links built; the manual observation has its own section in `manual-check.md` ("Microphone permission (T054)") and is filled in during T068, since the offscreen document opens the mic only once T067 lands
- [X] T055 [US2] Write e2e `tests/e2e/setup.spec.ts` (built in e2e mode with a stubbed token endpoint via Playwright `route`): first run → setup → persist across context restart → key masked → Start enabled

**Checkpoint**: settings complete and persistent.

**Implementation notes (Phases 3–4, 2026-10-07)** — read before Phase 5+:

- Spike CLIs run through `tsx` (new dev dependency; `pnpm spike:echo` / `pnpm spike:language` = `tsx spikes/….ts`): Node's built-in type stripping cannot resolve `src/`'s extensionless imports or its constructor parameter properties.
- `spikes/lib/wav.ts` is pure (parse, resample, `encodeWavPcm16`) so the recorder page can use it; Node file/ffmpeg loading is in `spikes/lib/audio-file.ts`. Run conditions and the `run.json` format live in `spikes/lib/echo-runs.ts`, shared by the recorder page and `spikes/echo.ts`.
- `spikes/lib/stream.ts` authenticates with the `xi-api-key` header (Node's WebSocket accepts `{ headers }`) and reuses `buildRealtimeUrl` with the token parameter removed, plus `secondary_languages` for Spike B. Spike B streams the four configs of a clip in parallel; Spike A streams tab and mic of a run in parallel.
- Echo rule detail: "token overlap" = share of the mic line's normalised words (as a multiset) found in the tab line; research R7 did not fix the denominator.
- Recorder page: opened at `chrome-extension://<id>/spike-recorder.html`; it captures in the page itself (`tabCapture.getMediaStreamId` with `consumerTabId`, mic prompt allowed in a visible tab) and saves via `chrome.downloads` into `Downloads/live-assist-echo/run-…/`. Only the spike build's manifest gets the `downloads` permission (`wxt.config.ts` manifest is now a function of mode). Its UI glue (`main.tsx`) is untested by design (dev-only); `recorder.ts` holds the tested logic.
- Side panel: components take a `SettingsApi` (`src/entrypoints/sidepanel/settings-api.ts`); tests use `tests/unit/sidepanel/fake-settings-api.ts`. No jest-dom — use plain DOM assertions. `App` takes `api` as a prop; `main.tsx` builds the chrome-backed one.
- `App.tsx` has a placeholder **Start** button that only reflects readiness (`isReadyToStart`) with a reason when not ready; T065/T066 replace it with `StartControls`. The temporary "Capture check" block is still there for T012/T062.
- Key validation lives in `src/providers/credentials/validate-key.ts`; `background.ts` validates commands with `createReceiver(parseCommand)` before the debug handlers (debug messages count as dropped there until T062 removes them). Background tests import `@/entrypoints/background` with a stubbed `chrome` global and call `.main()` — reuse that pattern for T061.
- e2e: `tests/e2e/fixtures.ts` exports `launchExtension(userDataDir)` and `extensionIdOf(context)` for restart tests; `context.route` does intercept the extension service worker's `fetch` (asserted in `setup.spec.ts`).
- Mic permission page: `/mic-permission.html` (`MIC_PERMISSION_PAGE`); manual confirmation that the offscreen document then opens the mic silently is in `manual-check.md` and belongs to T068.

---

## Phase 5: User Story 1 - Transcribe a meeting live (Priority: P1) 🎯 MVP

**Goal**: Start/Stop, two streams, live labelled transcript, audible meeting, persistence, panel reopen.

**Independent Test**: e2e with the fixture provider and fake mic: Start → lines from both streams with correct labels and confirmed/fallback styles → close/reopen panel → Stop keeps transcript.

- [X] T056 [P] [US1] Write failing tests for the segment builder in `tests/unit/core/transcript/segment-builder.test.ts`: `committed-detail` → segment with meeting-relative startMs/endMs from words + session `audioOriginMs`; non-word entries dropped; language from detail or fixed mode; label `userName`/`self` for mic and `Others`/`fallback` for tab; empty text dropped; `committed` without detail within 2 s → `timing: 'estimated'`; seq increments per stream
- [X] T057 [US1] Implement `src/core/transcript/segment-builder.ts` to pass T056
- [X] T058 [US1] Write failing integration tests for `MeetingRuntime` in `tests/integration/core/meeting-runtime.test.ts` (FakeTranscriptionProvider + fake-indexeddb + scripted frame sources): begin creates meeting with source/language/userName snapshot; both streams open sessions with keyterms and language; segments are stored before being emitted; partials emitted but never stored; mic source failing → tab continues and mic status `unavailable`; with `GenericAdapter` the mic status has `muteFollowed: false` and mic frames are always sent (FR-021); end closes sessions, stops sources, sets `endedAt`/`endReason`; no frames sent after end (FR-025)
- [X] T059 [US1] Implement `src/core/session/meeting-runtime.ts` (injected provider, frame sources, repo, status reducer, adapter, clock) to pass T058
- [X] T060 [US1] Write e2e `tests/e2e/transcribe.spec.ts` FIRST and see it fail (e2e build, fixture provider, fake mic): Start → lines from both streams with labels → close and reopen panel shows full transcript → Stop keeps it → Delete removes it
- [X] T061 [US1] Write failing tests in `tests/unit/background/start-stop.test.ts` (chrome API fakes): `meeting/start` checks settings → `getMediaStreamId` → ensures offscreen → forwards stream id; maps "not been invoked" to `not-invoked`, restricted URLs to `tab-not-capturable`, existing meeting to `already-running` with tab title; `meeting/stop` sends `offscreen/end` then closes the document; `tabs.onRemoved`/origin change on captured tab → `offscreen/end` with `tab-closed`/`tab-navigated` (FR-023)
- [X] T062 [US1] Implement start/stop orchestration in `src/entrypoints/background.ts` (replacing the T011 debug path) to pass T061
- [X] T063 [P] [US1] Write failing component tests in `tests/unit/sidepanel/transcript.test.tsx`: renders segments in order with `mm:ss`; confirmed vs fallback label styles distinguishable (and announced to screen readers); partial line per stream shown in-progress style and replaced on commit; auto-scroll unless the user scrolled up
- [X] T064 [US1] Implement `src/entrypoints/sidepanel/components/Transcript.tsx` and `src/entrypoints/sidepanel/hooks/useLive.ts` (connect `live` port; fall back to latest meeting from IndexedDB when no runtime) to pass T063
- [X] T065 [P] [US1] Write failing component tests in `tests/unit/sidepanel/start-controls.test.tsx`: Start disabled until settings complete; Start → `meeting/start`; each `StartError` shows its message (incl. "click the toolbar icon on the meeting tab"); `already-running` names the other tab and offers "Stop that one"; Stop → `meeting/stop`; Delete transcript visible only when stopped, confirms, then hard-deletes and shows the next most recent meeting, so every stored meeting can be deleted one by one (FR-029)
- [X] T066 [US1] Implement `src/entrypoints/sidepanel/components/StartControls.tsx` and the delete action via `meeting-repo` to pass T065
- [X] T067 [US1] Implement the offscreen host `src/entrypoints/offscreen/main.ts`: handles `offscreen/begin`/`offscreen/end`, builds frame sources from `src/audio/capture.ts`, starts tab playback, runs `MeetingRuntime` with `ElevenLabsRealtimeProvider` (or `FakeTranscriptionProvider` when built in e2e mode), serves the `live` port (`live/snapshot`, `live/segment`, `live/partial`, `live/status`) — to make e2e T060 pass
- [X] T068 [US1] USER: manual check steps 1–5 and 7 in `quickstart.md` on a real Meet call; record in `manual-check.md`, including setup time (SC-001), observed in-progress and finished-line latency (SC-002) and whether call audio changed (SC-006) — PENDING USER (2026-10-08): build ready (`pnpm build`, reload `.output/chrome-mv3`); step-by-step list and results table in `manual-check.md` ("Live transcript on a real Meet call (T068, plus T054 step 2)"), which also covers T054's offscreen-mic observation — DONE 2026-10-09: user sign-off in a real Meet call (manual-check.md "Sign-off — 2026-10-09").

**Checkpoint**: MVP — live labelled transcript on any tab.

**Implementation notes (Phase 5, 2026-10-08)** — read before Phase 6+:

- Offscreen documents get only `chrome.runtime` (no `chrome.storage`), so the key cannot be read there. The service worker mints each single-use token and returns it as the direct reply to the offscreen document's `credentials/transcription-token` request (`src/entrypoints/background/credentials.ts`, sender id + URL checked); the offscreen provider uses `RelayCredentialSource` (`src/providers/credentials/relay-source.ts`). Contracts (credential-source, extension-messages) and research R5 updated. Reconnects (T072) get their fresh token the same way.
- Offscreen listeners must be registered synchronously on load; a top-level `await` before `addListener` made the service worker's first message fail with "Receiving end does not exist".
- The transcription contract types moved to `src/core/transcription/provider.ts` (re-exported from `src/providers/transcription/provider.ts`) so core can depend on them.
- `MeetingRuntime` (`src/core/session/meeting-runtime.ts`) opens the tab stream first (source, then session), then the mic; a mic that cannot open leaves `mic` unavailable with a plain reason and no mic session. Session errors currently mark the stream `failed` and nothing else — T073 replaces that branch (`onSessionEvent` case `error`) with `ReconnectingSession` and ends the meeting as `failed` when the tab stream dies. `audioOriginMs` = meeting time of the first frame sent minus 100 ms; `SegmentBuilder` takes it via `startSession` and drops a late timestamps message for a commit it already stored as estimated.
- `offscreen/begin` carries `source: { url, title }` (meeting record). The running meeting lives in `chrome.storage.session` (`activeMeeting`) so a woken service worker still enforces one meeting at a time and watches the right tab.
- `background.ts` is now `src/entrypoints/background/{index.ts,meeting-control.ts,credentials.ts}`; tests still import `@/entrypoints/background` and must stub `chrome.tabs.onRemoved/onUpdated`.
- Side panel: `App` takes `meetings: MeetingApi & LiveApi` (`meeting-api.ts`; tests use `tests/unit/sidepanel/fake-meeting-api.ts`). `useLive` follows the `live` port and falls back to the latest stored meeting on disconnect; `refresh()` after Start/Stop/Delete. A one-line `StatusLine` in `App.tsx` stands in for T075's `StatusBar`; Start always sends `{ kind: 'auto' }` until T081; consent (T085) slots in before `api.start` in `StartControls`. Styles in `src/entrypoints/sidepanel/style.css`.
- A panel on any tab connects to the running meeting, so `already-running` is mostly reachable only in races; the "Stop that one" path is still unit-tested.
- e2e seams (compiled out of production, checked): the background's fake tab capture, the offscreen document reading Chrome's fake audio device as the "tab" plus fixture replay (`src/entrypoints/offscreen/e2e-provider.ts`, tab session = even connections, mic = odd), and the panel's `?e2eTabId=` target tab (the panel is an ordinary tab in e2e; without it closing the panel tab ends the meeting as `tab-closed`).
- Fake timers: a 0 ms timer created inside a fake-timer tick fires at +1 ms, so integration tests settle with 1 ms steps (`settle()` in `tests/integration/core/meeting-runtime.test.ts`); fake-indexeddb works with `toFake` limited to timers + Date.

---

## Phase 6: User Story 3 - Resilience and status (Priority: P2)

**Goal**: automatic reconnect with no lost/duplicated lines; visible status for every dependency.

**Independent Test**: fixture sequences for drop and time limit → reconnect, transcript continuous; auth/quota → failed with reason.

- [X] T069 [P] [US3] Write failing tests for the reconnect policy in `tests/unit/core/session/reconnect-policy.test.ts`: immediate retry for `time-limit`; backoff 0.5,1,2,4,8,15,15 s then give up; no retry for auth/quota/terms/invalid-request; one retry for `input`
- [X] T070 [P] [US3] Write failing tests for `ReplayBuffer` in `tests/unit/core/session/replay-buffer.test.ts`: holds frames since last commit; cleared on commit; capped at 40 s dropping oldest and reporting a gap; reports meeting time of first buffered frame
- [X] T071 [US3] Implement `src/core/session/{reconnect-policy.ts,replay-buffer.ts}` to pass T069–T070
- [X] T072 [US3] Write failing integration tests in `tests/integration/core/reconnecting-session.test.ts` using fixtures `drop-mid-partial`, `time-limit`, `auth-error`, `quota-error`: new token per attempt; `previousText` = last ≤50 chars of committed text; replayed audio precedes live audio; new `audioOriginMs` = first replayed frame; no duplicate or missing committed segments across the drop; status transitions active→reconnecting→active / →failed with reason
- [X] T073 [US3] Implement `src/core/session/reconnecting-session.ts` and use it in `MeetingRuntime` (tab stream failure ends the meeting with `failed`; mic failure does not) to pass T072 and keep T058 green
- [X] T074 [P] [US3] Write failing component tests in `tests/unit/sidepanel/status-bar.test.tsx`: shows capture, mic stream, tab stream, speaker names (unavailable + reason), mic (active/unavailable + fix action reopening the permission page; "mute state unknown — mic is being sent" while the adapter cannot read mute, FR-021), retention summary with help link; failure reasons in plain language
- [X] T075 [US3] Implement `src/entrypoints/sidepanel/components/StatusBar.tsx` to pass T074
- [X] T076 [US3] Crash recovery: on offscreen/runtime start, `meeting-repo` marks open meetings without a live runtime as `crashed`; panel shows that meeting's stored lines (test first in `tests/integration/storage/crash-recovery.test.ts`)
- [X] T077 [US3] Write e2e `tests/e2e/resilience.spec.ts` (fixture provider scripted to drop and to hit the time limit): status shows reconnecting then active; transcript continuous; auth-error fixture shows failed with reason
- [X] T078 [US3] USER: manual check step 6 (Wi-Fi off/on) and optional step 8 (long run, observed session limit) in `quickstart.md`; record in `manual-check.md` — PENDING USER (2026-10-08): steps and results table in `manual-check.md` ("Reconnect on a real call (T078)"); build with `pnpm build` on this branch or later — DONE 2026-10-09: user sign-off in a real Meet call (manual-check.md "Sign-off — 2026-10-09").

**Checkpoint**: resilient pipeline with visible state.

**Implementation notes (Phase 6, 2026-10-08)** — read before Phase 7+:

- `ReconnectingSession` (`src/core/session/reconnecting-session.ts`) owns one stream across provider sessions: it holds the `ReplayBuffer` (cleared on every `committed`, so replay starts after the last finished line), keeps the last ≤50 characters of committed text for `previousText`, replays buffered audio before live audio, and emits `origin` (`sessionId` + `audioOriginMs`) for `SegmentBuilder.startSession`, `state` (active / reconnecting / failed with plain reason) and the transcript events. `sendAudio(frame, atMs)` takes the frame's meeting time. Plain-language failure reasons live in `failureReason()` there. A failed reconnect `openSession` is classified by duck typing (`name === 'CredentialError'` → auth / rate-limited), since core cannot import providers.
- The status reducer now allows `connecting → reconnecting` (a session that drops before `session_started`). A failed stream keeps `failed` + reason after the meeting ends (it is not overwritten by `stopped`).
- `MeetingRuntime`: a tab stream that fails for good ends the meeting as `failed` (capture failed with the stream's reason); a failed mic leaves the meeting running. `whenEnded()` resolves however the meeting ended. The offscreen host reports a self-inflicted end to the service worker with the new `offscreen/ended` notice (contracts/extension-messages.md), which closes the document and clears `activeMeeting`, so the next Start is not refused as `already-running`.
- Crash recovery: the offscreen host calls `markOrphanedCrashed(null, now)` at every `offscreen/begin`, before the new meeting exists (no runtime is live in a fresh document). The panel already shows the latest stored meeting's lines when no runtime answers. Not done in the panel itself, to avoid racing a Start that is creating its meeting.
- `useLive` keeps the last live status after a disconnect when the stored latest meeting is the one it was showing, so the reason a meeting failed stays visible until the panel is reopened.
- `StatusBar` replaced `App`'s one-line `StatusLine` and is always shown (idle when no meeting runs). "Allow microphone" there calls `SettingsApi.openMicPermission`.
- e2e: `HostDeps.provider` now receives the meeting source. e2e builds pass a scenario (`drop`, `time-limit`, `auth-error`) from `chrome.storage.local.e2eScenario` as the meeting title (`e2eSource` in the background), and `e2e-provider.ts` picks the tab's first script by it (later tab connections and the mic replay the happy paths). Shared e2e helpers moved to `tests/e2e/helpers.ts`; `seedSettings(panel, { consentReminder, scenario })`. `openMeetingTab` picks the newest other tab (the context starts with its own blank page). The e2e test checks "reconnected 1 time" rather than catching the brief "Reconnecting…" text.

---

## Phase 7: User Story 4 - Language control (Priority: P2)

**Goal**: automatic detection by default; per-meeting override for both streams.

**Independent Test**: start with auto and with a fixed language using fixtures; verify session options and reset to auto for the next meeting.

- [X] T079 [P] [US4] Write failing component tests in `tests/unit/sidepanel/language-picker.test.tsx`: default Automatic; Greek and English first, then the supported list; choice disabled while running; resets to Automatic after Stop
- [X] T080 [P] [US4] Add the supported language list in `src/core/settings/languages.ts` (ISO codes from the ElevenLabs Scribe supported-languages docs, Greek and English pinned) with a unit test `tests/unit/core/settings/languages.test.ts` (test first)
- [X] T081 [US4] Implement `src/entrypoints/sidepanel/components/LanguagePicker.tsx` and pass the choice in `meeting/start` to pass T079
- [X] T082 [US4] Extend `tests/integration/core/meeting-runtime.test.ts` (failing first): fixed language → both sessions get `language_code`, meeting stores `languageMode`, segments without detected language take the fixed code; auto → no `language_code`, detected language stored; then make it pass in `src/core/session/meeting-runtime.ts`
- [ ] DEFERRED 2026-10-08 per design decision 26/27 — T083 [US4] If Spike B (T047) recommends `el`+`secondary_languages=[en]`, raise it with the user as a spec change (new setting) rather than implementing it; record the decision in `spike-findings/language.md`

**Checkpoint**: language behaviour per FR-014.

**Implementation notes (Phase 7, 2026-10-08)**:

- Language codes are the three-letter codes from the ElevenLabs Scribe supported-languages page (read 2026-10-08, 99 languages; Greek `ell`, English `eng`), in `src/core/settings/languages.ts`. The API reference accepts ISO 639-1 or 639-3 for `language_code`; detected languages come back as the service reports them (fixtures show `en`/`el`), so a fixed-language meeting may store `ell` while an auto meeting stores `el`. 004's export does not depend on the code.
- `LanguagePicker` sits in `StartControls`; while a meeting runs it shows (disabled) that meeting's `languageMode`, and the choice resets to Automatic when `running` turns false (state adjusted during render, not in an effect — the `react-hooks/set-state-in-effect` lint rule forbids the latter).
- T082's runtime tests passed on first run: fixed-language handling (`language_code` on both sessions, fixed code as fallback language) was already built in Phase 5 (`SegmentBuilder`, `buildRealtimeUrl`). A mutation check (dropping the fixed-code fallback) made them fail, so they are not vacuous. Reconnects keep the fixed language.
- T083 is deferred with Spike B (decision 26): Automatic stays the default.

---

## Phase 8: User Story 5 - Consent reminder (Priority: P2)

**Goal**: reminder on every Start unless turned off; nothing captured until acknowledged.

**Independent Test**: Start with reminder on (cancel → nothing; acknowledge → starts) and off (starts immediately).

- [X] T084 [P] [US5] Write failing component tests in `tests/unit/sidepanel/consent.test.tsx`: reminder shown on Start when on; Cancel sends nothing; Acknowledge sends `meeting/start`; reminder off → `meeting/start` immediately
- [X] T085 [US5] Implement `src/entrypoints/sidepanel/components/ConsentDialog.tsx` and the Start flow in `src/entrypoints/sidepanel/start-flow.ts` to pass T084
- [X] T086 [US5] Add consent steps to `tests/e2e/transcribe.spec.ts` (T060) (failing first, then passing)

**Implementation notes (Phase 8, 2026-10-08)**:

- `start-flow.ts` returns the steps between pressing Start and `meeting/start` (`startSteps({ consentReminder })` → `['consent']` or `[]`); `StartControls` (new required prop `consentReminder`, from settings in `App`) shows `ConsentDialog` (`role="alertdialog"`, "I've told them — start" / "Cancel") and sends nothing until it is acknowledged. FR-028's notice, if it ever ships, is another step there.
- e2e `seedSettings(panel, { consentReminder: true })` turns the reminder on; `transcribe.spec.ts` cancels once (nothing captured, status "Not capturing"), then acknowledges.
- Found while adding the consent e2e (resilience auth-error spec turned flaky): a meeting that fails within milliseconds could end before the panel reconnected, and the panel then showed idle with no reason. The service worker now forgets the meeting at once on `offscreen/ended` but keeps the offscreen document for `OFFSCREEN_LINGER_MS` (30 s) so a late panel still gets the final snapshot with the reason; a Start in that window cancels the close and reuses the document.

---

## Phase 9: Headphones notice (FR-028)

**DEFERRED 2026-10-08 per design decision 27** — FR-028 is out of v1 (the user always uses headphones). Revisit only if echo duplicates show up in real use or colleagues adopt the tool. Original purpose: the notice decided on 2026-10-07; shipped only if Spike A (T048) finds duplication without headphones.

- [ ] DEFERRED 2026-10-08 per design decision 26/27 — T087 [P] [US6] `[FR-028]` Write failing tests in `tests/unit/sidepanel/headphones-notice.test.tsx`: when enabled by build-time flag `HEADPHONES_NOTICE` (set from Spike A result), notice shows on every Start until "Don't show again" is ticked, which sets `headphonesNoticeDismissed` in `chrome.storage.local`; never shown when the flag is off
- [ ] DEFERRED 2026-10-08 per design decision 26/27 — T088 [US6] `[FR-028]` Implement the notice in `src/entrypoints/sidepanel/start-flow.ts` and a `HeadphonesNotice.tsx` component to pass T087; set the flag according to `spike-findings/echo.md`

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T089 [P] Privacy guard test `tests/unit/privacy/no-secrets.test.ts`: scan built output and all fixtures for `sutkn_`/API-key-shaped strings; assert manifest host permissions are exactly `https://api.elevenlabs.io/*` (FR-024); assert no `storage.sync` usage in `src`
- [X] T090 [P] Logging helper `src/core/log.ts` that redacts any value under keys matching `/key|token|authorization/i` and never logs audio; test first in `tests/unit/core/log.test.ts`; replace any direct `console` use
- [X] T091 [P] Long-meeting performance check: unit/bench test rendering 5,000 segments in `tests/unit/sidepanel/transcript-perf.test.tsx`; add list virtualisation only if it misses a 100 ms render budget (plan performance goal)
- [X] T092 Accessibility pass on the side panel (labels, focus order, status announcements via `aria-live`) with checks in `tests/e2e/a11y.spec.ts`
- [X] T093 Run `quickstart.md` end to end, complete `manual-check.md` (all steps pass), confirm CI green, `codegraph sync` — PENDING USER (2026-10-08): automated part done (lint, typecheck, Vitest, both builds, Playwright green; `codegraph sync` run); the real-meeting part is the open sections of `manual-check.md`, summarised under "001 sign-off (T093)" — DONE 2026-10-09: user sign-off in a real Meet call (manual-check.md "Sign-off — 2026-10-09").
- [X] T094 Update `CLAUDE.md` Current status, `ROADMAP.md` (001 → `done` once merged with manual check recorded) and `CHANGELOG.md` — PARTLY DONE (2026-10-08): CLAUDE.md and CHANGELOG updated for Phase 10; ROADMAP 001 stays `in-progress` until T093's manual checks pass — DONE 2026-10-09: user sign-off in a real Meet call (manual-check.md "Sign-off — 2026-10-09").

**Implementation notes (Phase 10, 2026-10-08)**:

- T089 (`tests/unit/privacy/no-secrets.test.ts`) scans every tracked file plus `.output/chrome-mv3` and `.output/chrome-mv3-e2e` for real-shaped secrets (`sk_` + 32+ hex, `sutkn_` + 20+ chars) and ignores values marked `fixture`/`test`/`e2e`/`fake`/`example`. The build-output checks skip when there is no build locally; CI builds first and sets `LIVE_ASSIST_REQUIRE_BUILD=1`, which makes a missing build fail. It also asserts the manifest has no content scripts — 002's Meet content script must update that assertion deliberately.
- T090: `src/core/log.ts` (`createLogger(scope, sink?)`, `redact`). `MeetingRuntimeDeps.log` is optional (defaults to the console through the logger). ESLint `no-console` is on for `src/**` except `log.ts`; the spike CLIs (`spikes/`) still print with `console` — that is their output, not logging.
- T091: jsdom measured ~75 ms per in-progress update with 5,000 lines before; memoised `Line`/`Lines` brought it under 1 ms (append ~10 ms). The `useLive` segments array keeps its identity across partial updates, which the memo relies on. No virtualisation.
- T092: `@axe-core/playwright` (dev only) runs WCAG 2.1 A/AA in `tests/e2e/a11y.spec.ts`. The transcript scroller is `role="log"` named "Transcript lines" and focusable; Escape cancels the consent reminder; focus returns to Start / Delete transcript after a cancel (a ref plus a post-render effect, since `react-hooks/set-state-in-effect` forbids state there).

---

## Phase 11: Single mixed stream (constitution v1.1.0)

**Goal**: one ElevenLabs realtime session per meeting instead of two (half the cost). Tab audio and the mic are still captured separately, mixed locally at 16 kHz into one mono stream, the mic through a gate 002 can close while the user is muted; every finished line is labelled "Others" (fallback) in 001. Spec Clarifications 2026-10-08; design decisions 28–30; research R4–R6; data-model.md.

**Independent Test**: fixture-driven runtime test with one mixed source opens exactly one provider session and stores every line as "Others"/`fallback` with stream `mixed`; the capture unit test shows tab and gated mic summed into one worklet and `setMicGate(false)` silencing the mic before the mix; e2e Start → lines labelled "Others" → one Transcription status row.

Supersedes the two-session parts of T037, T056, T058–T059, T063, T067, T072–T075, T077 and T082 (their tests are updated here, not rewritten from scratch). TDD per task: the listed tests are changed or added first and seen failing for the right reason, then the implementation.

- [X] T095 [P] [US1] Write failing tests in `tests/unit/audio/capture.test.ts` for `captureMixed(opts, deps, onFrame)`: one 16 kHz context and one PCM16 worklet node; the tab source connects straight to the worklet and the mic source through a gain node (the gate) to the same worklet; gate open (gain 1) at start; `setMicGate(false)` → gain 0, `setMicGate(true)` → gain 1; mic `getUserMedia` rejecting → handle `mic: { ok: false, error }`, tab-only mix runs, `setMicGate` is a no-op; tab rejecting → `captureMixed` rejects and no context is left open; tab kept audible on a device-rate playback context; `stop()` stops every track and closes every context, idempotently
- [X] T096 [US1] Implement `captureMixed` in `src/audio/capture.ts` (graph mixing; `AudioContextLike` gains `createGain`), keeping `captureTab`/`captureMic` for the dev-only spike recorder, to pass T095
- [X] T097 [P] [US1] Update failing tests for the single stream in `tests/unit/core/transcript/{model,segment-builder}.test.ts`: `StreamId` is `'mixed'`; every segment is `speakerLabel: "Others"`, `labelSource: 'fallback'`, id `${meetingId}:mixed:${seq}`; ordering by `startMs` then `seq`; `LabelSource` has no `self` (`caption`/`manual` confirmed, `fallback` not)
- [X] T098 [US1] Implement in `src/core/transcript/{model.ts,ordering.ts,segment-builder.ts}` (builder no longer takes `stream`/`userName`) to pass T097
- [X] T099 [P] [US3] Update failing tests in `tests/unit/core/status/status.test.ts` and `tests/unit/core/messaging/protocol.test.ts`: `transcription` is one `StreamStatus` driven by a `{ type: 'transcription' }` event (transitions and reconnect count as before, reset to idle); validators accept stream `mixed` and a single `transcription`, reject `mic`/`tab` streams, the old `{ mic, tab }` status shape and label source `self`; `tests/unit/core/platform/generic-adapter.test.ts`: captions reason says every line is labelled "Others"
- [X] T100 [US3] Implement in `src/core/status/status.ts`, `src/core/messaging/protocol.ts`, `src/core/platform/generic-adapter.ts` to pass T099
- [X] T101 [US1] Update failing integration tests in `tests/integration/core/meeting-runtime.test.ts` (and the provider contract suite's options): `BeginParams.source` is one mixed `FrameSource` whose handle reports the mic and exposes `setMicGate`; begin opens exactly one provider session with keyterms and language and no `stream` option; lines from the mixed fixture are stored as "Others"/`fallback`/`mixed` before being emitted; partials carry stream `mixed`; mic unavailable → mic status `unavailable` with a reason saying only the meeting tab is transcribed, transcription active; source failing → meeting `failed` and `begin` rejects; quota error → transcription `failed`, meeting ends `failed`; drop → one reconnect on the same session, no duplicate lines; fixed language reaches the one session; end stops the source, sets `endedAt`/`endReason`, sends nothing afterwards (FR-025); `userName` still snapshotted on the meeting
- [X] T102 [US1] Implement in `src/core/session/meeting-runtime.ts` (one `ReconnectingSession`, `MixedFrameSource`/`MixedSourceHandle` with `setMicGate`, no per-stream runs) and drop `stream` from `SessionOptions` in `src/core/transcription/provider.ts`, to pass T101 and keep `tests/integration/core/reconnecting-session.test.ts` green
- [X] T103 [P] [US3] Update failing component tests: `tests/unit/sidepanel/status-bar.test.tsx` (rows Capture, Transcription (one stream), Speaker names "every line is labelled Others", Microphone with "only the meeting tab is transcribed" reason and "Allow microphone" when unavailable), `tests/unit/sidepanel/transcript.test.tsx` and `transcript-perf.test.tsx` (in-progress line labelled "Others" as fallback; no `userName` prop), `tests/unit/sidepanel/setup.test.tsx` (billing note: one stream per meeting, about the meeting's length)
- [X] T104 [US3] Implement in `src/entrypoints/sidepanel/components/{StatusBar,Transcript,RetentionNotice}.tsx` and `App.tsx` to pass T103
- [X] T105 [US1] Update failing tests `tests/unit/offscreen/host.test.ts` and `tests/integration/storage/crash-recovery.test.ts` for `HostDeps.sourceFor(tabStreamId)` returning one mixed source; then implement in `src/entrypoints/offscreen/{host.ts,main.ts}` (production: `captureMixed` with the tab stream id and the mic constraints; e2e: Chrome's fake device as the tab)
- [X] T106 [US1] e2e: update `tests/e2e/{transcribe,resilience,a11y}.spec.ts` first (all lines "Others", one Transcription row, "reconnected 1 time" on it) and see them fail, then replace `PerStreamProvider` in `src/entrypoints/offscreen/e2e-provider.ts` with one `FakeTranscriptionProvider` (scenario script first, happy path after) to pass them
- [X] T107 Remove now-dead two-session code and fixtures: `tests/fixtures/elevenlabs/mic-happy-path.jsonl` (if unreferenced), per-stream wording in comments, `self` label handling; update `src/entrypoints/background/meeting-control.ts` offscreen justification; `codegraph sync` and check no caller of the removed symbols remains
- [X] T108 Update `manual-check.md` pending real-meeting steps (T054, T068, T078, Phases 7–8 quick check) to the new expectations: every line "Others" in 001, one Transcription status row, billed about the call length (one stream); ROADMAP 001 row text

**Checkpoint**: one session per meeting; lint, typecheck, Vitest, both builds and Playwright green.

**Implementation notes (Phase 11, 2026-10-08)**:

- `captureMixed` (`src/audio/capture.ts`) sums tab and mic in one 16 kHz context (Web Audio adds every connection into the worklet's single input); the mic goes through a `GainNode` gate. `AudioContextLike` gained `createGain`. A mic that fails to open is reported in the handle (`mic: { ok: false, error }`) and the tab is mixed alone. `captureTab`/`captureMic` stay only for the dev-only spike recorder, which records the sources separately.
- Core: `BeginParams.audio: MixedFrameSource` (handle: `stop`, `mic`, `setMicGate`); one `SegmentBuilder` and one `ReconnectingSession` per meeting. `SessionOptions` no longer has `stream`; `StatusSnapshot.transcription` is a single `StreamStatus` driven by `{ type: 'transcription' }`. `StreamId` is the literal `'mixed'` (kept on segments and partials so the stored shape and ids stay stable); `LabelSource` lost `self`. Ordering is `startMs` then `seq`. Mic problems now end with "Only the meeting tab is being transcribed; your own speech is not."
- Panel: one "Transcription" status row with the billing note "(one stream: meeting tab and your microphone)"; the in-progress line is always "Others"/fallback and `Transcript` lost its `userName` prop; `RetentionNotice` (setup screen) says one stream is billed for about the meeting's length.
- e2e: one `FakeTranscriptionProvider` (scenario script first, happy path for reconnects); new fixture `mixed-happy-path.jsonl` (the happy path plus the user's own line); `mic-happy-path.jsonl` removed. In e2e the mixed source reads Chrome's fake device as both tab and mic.

**Gate API for 002** (updated 2026-10-08): the mute gate is 002's mute gate (`src/core/session/mute-gate.ts`), which holds tab and mic frames 500 ms and silences mic frames overlapping a muted span before mixing; 001's `MixedSourceHandle.setMicGate` and its gain node were removed in 002 T049. See `specs/002-meet-speaker-names/tasks.md` Phase 5 notes.

---

## Phase 12: Red-team 2026-10-08 fixes

**Purpose**: findings against this feature (spec Clarifications "Red-team 2026-10-08"). Each test is written and seen red before its fix.

- [X] T109 [P] Failing tests: every side-panel settings path (`load`, `saveSettings`, `validateKey` success and failure, `removeKey`, remembered names) runs against a storage fake that throws on any read of `credentials` or `pendingCredential` (`tests/unit/sidepanel/settings-api.test.ts`); the key hint comes from a `settings/key-hint` reply and a malformed reply reads as no key; the service worker answers `settings/key-hint` with the last four characters only and validates a key written to `pendingCredential` (`tests/unit/background/validate-key.test.ts`, `tests/unit/core/messaging/protocol.test.ts`); an ESLint probe shows side-panel code may not import `src/storage/settings-store` (`tests/unit/lint/boundaries.test.ts`)
- [X] T110 Implement `PanelSettingsStore` (no credential reads), the separate `pendingCredential` slot, the `settings/key-hint` command in the protocol and service worker, and the ESLint rule, to pass T109; update `contracts/extension-messages.md` and `contracts/credential-source.md`
- [X] T111 [P] Failing tests in `tests/integration/core/reconnecting-session.test.ts`: frames sent after the committed segment's last word but before the commit message arrived are replayed after a drop; a commit without word timings drops nothing; the time-limit replay starts at the frame holding the end of the last committed word
- [X] T112 Implement in `src/core/session/replay-buffer.ts` and `src/core/session/reconnecting-session.ts` to pass T111; FR-019 and research R4 state the 40 s cap precisely
- [X] T113 [P] Failing tests in `tests/unit/privacy/no-secrets.test.ts`, each shown failing on a planted violation: a real-shaped key containing "e2e"/"test"/"fake" is flagged and only the exact fixture token prefix is allowed; a URL literal to any host other than `api.elevenlabs.io` (outside the listed non-network references) is flagged; a fetch/WebSocket/EventSource/sendBeacon call with an unknown destination is flagged; `storage['sync']`, `storage?.sync` and `const { sync } = chrome.storage` are flagged
- [X] T114 Make the guard checks in `tests/unit/privacy/no-secrets.test.ts` pass on the planted cases and on the real tree
- [X] T115 Docs: research R5, plan Constitution Check and `contracts/platform-adapter.md` describe the current mix (paired tab/mic frames from one worklet, mixed in JS in `src/core/session/mute-gate.ts` behind the mute gate) instead of the GainNode gate and "mixing in JS rejected"

## Phase 13: Clean transcript (design decision 41, 2026-10-09)

**Purpose**: spec Clarifications "Session 2026-10-09 — clean transcript", FR-011b. Built on branch `002-split-at-speaker-change` as its own commit. Each test was seen red first.

- [X] T116 [P] Failing tests: `settings.test.ts` (`cleanTranscript` defaults to true, also for stored settings without it; only `false` turns it off); `protocol.test.ts` (`offscreen/begin` carries `cleanTranscript`, absent = on, non-boolean rejected); `start-stop.test.ts` (the service worker sends the setting); `host.test.ts` and `meeting-runtime.test.ts` (the session URL has `no_verbatim=true` when on, none when off, after a reconnect too); `elevenlabs-provider.test.ts` (`noVerbatim` → `no_verbatim=true`); `settings.test.tsx` (heading "Clean transcript", checkbox "Leave out fillers and false starts", on by default, saves each change); `keep-strings.test.tsx` (K39)
- [X] T117 Implement T116: `src/core/settings/schema.ts`, `src/core/messaging/protocol.ts`, `src/entrypoints/background/meeting-control.ts`, `src/entrypoints/offscreen/host.ts`, `src/core/session/meeting-runtime.ts`, `src/core/transcription/provider.ts` (`noVerbatim`), `src/providers/transcription/elevenlabs/{realtime-provider,url}.ts`, `src/entrypoints/sidepanel/components/Settings.tsx`; copy-review K39

---

## Phase 14: Key terms as a list (2026-10-12)

**Purpose**: spec Clarifications "Session 2026-10-12 — key terms as a list", FR-004a, User Story 2 scenarios 7–9. Built on branch `001-keyterms-paste-list`. Each test is seen red before its implementation.

- [X] T118 [P] Failing unit tests in `tests/unit/core/settings/settings.test.ts`: `splitKeyterms` (line breaks incl. `\r\n`, commas, mixed; trimmed; empty pieces dropped; order kept; a single term unchanged), `addKeyterms` (appended after existing terms; existing terms and repeats collapse case-insensitively, first spelling wins; over-long and over-50 terms kept, then flagged by `planKeyterms`), `insertKeytermList` (pasted lines become comma-separated text at the cursor or in place of the selection)
- [X] T119 [P] Implement T118 in `src/core/settings/keyterms.ts`
- [X] T120 Failing component tests in `tests/unit/sidepanel/settings.test.tsx`: the field is labelled for several terms; `a, b` + Add adds two terms; a list of 50 is added with exactly one save; a paste with line breaks shows comma-separated in the field and a paste without them is left alone; terms over the limits in one list are kept and flagged; a list with nothing new saves nothing; edit and remove still work with 50 terms. Keep-strings test (`tests/unit/copy/keep-strings.test.tsx`) updated to the new label and button (copy-review K17a)
- [X] T121 Failing e2e test `tests/e2e/keyterms.spec.ts` in the real extension: copy 50 names, one per line, to the clipboard, paste them into the field with the keyboard, Add → 50 terms listed and stored; a 51st and an over-long term in a second paste are listed as not used
- [X] T122 Implement T120–T121 in the key-terms block of `src/entrypoints/sidepanel/components/Settings.tsx`; copy-review K17a
- [ ] T123 Manual check (user): `manual-check.md` "Key terms as a list" — paste 50 names, see 50 listed, Start, names recognised

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2** strictly. T011–T012 (capture-gesture check) come first in Phase 2 because a negative result changes R5.
- **Phase 3 (US6 spikes)** needs T029–T031 (codec, fixtures) and T035–T037 (audio); the user-run tasks T047–T048 can happen any time after, in parallel with Phases 4–8.
- **US2 (Phase 4)** needs Phase 2 storage + credentials.
- **US1 (Phase 5)** needs Phase 2 and US2 (settings gate Start). MVP = Phases 1, 2, 4, 5.
- **US3 (Phase 6)** extends `MeetingRuntime` from US1.
- **US4, US5 (Phases 7, 8)** need US1; independent of each other and of US3.
- **Phase 9**: deferred out of v1 (design decision 27); would follow T048 (Spike A findings) and US5's start flow.
- **Phase 10** last.
- **Phase 11** (added 2026-10-08, constitution v1.1.0) reworks Phases 5–8 for one mixed stream. T095/T097/T099/T103 are independent test tasks; T101–T102 need T096, T098 and T100; T105 needs T096 and T102; T106 needs T105; T107–T108 last.

Within each story: test task → implementation task (red → green), then refactor with tests green.

## Parallel examples

- Phase 2: T013, T015, T017, T019, T021, T023, T025, T027, T029, T030, T035 are independent test-writing tasks across different files.
- Phase 3: T038 and T040 in parallel; T043 and T044 after T042/T037.
- Phase 5: T056, T063, T065 in parallel, then their implementations; T060 (e2e) is written before T067 (offscreen host) makes it pass.
- Phase 6: T069, T070, T074 in parallel.

## Implementation strategy

1. MVP: Phases 1, 2, 4, 5 → a working labelled live transcript; run manual check (T068).
2. Ship spike harnesses (Phase 3) early so the user can collect findings while the rest is built.
3. Add US3 resilience, then US4 and US5 (small), then Phase 9 if Spike A calls for it.
4. Polish, full manual check, PR.

Per CLAUDE.md rule 6, Phases 3 (spike harnesses) and 6 (resilience) are self-contained enough to run in their own worktree subagents once Phase 2 is merged; Phases 4, 5, 7, 8 all touch the side panel and should run sequentially.
