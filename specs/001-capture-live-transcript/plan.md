# Implementation Plan: Capture & Live Transcript

**Branch**: `001-capture-live-transcript` | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-capture-live-transcript/spec.md`

## Summary

Build the Chrome MV3 extension scaffold and the capture → transcribe → display pipeline every later feature consumes. The toolbar action opens a React side panel; Start (after a consent reminder) asks the service worker for a tab-capture stream id, which an offscreen document turns into tab audio (kept audible) plus a separately captured mic. Both are mixed locally in one 16 kHz AudioContext — the mic through a gain-node gate that 002 closes while the user is muted — into one PCM16 mono stream (AudioWorklet) sent to a single ElevenLabs Scribe v2 Realtime WebSocket session (VAD commits, word timestamps, language detection, key terms; one billed stream, constitution v1.1.0), authenticated with a single-use token the extension mints from the user's key through a `CredentialSource`. Committed lines become `TranscriptSegment`s (stream `mixed`, meeting-relative start/end ms, text, language, speaker label "Others" + label source `fallback` — the user's lines are told apart only by 002's captions), written to IndexedDB as they arrive and streamed to the panel. A reconnecting session wrapper with an audio replay buffer survives drops and session time limits without losing or duplicating lines. Two user-run spikes (echo without headphones; mixed Greek/English) ship as harnesses that write findings into this folder. Details: [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript 5.x, `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`; Node LTS for tooling and spike scripts.

**Primary Dependencies**: WXT 0.21.x (`@wxt-dev/module-react`), React 19, `idb` (IndexedDB wrapper). No ElevenLabs SDK (research R2). Dev: Vitest, `fake-indexeddb`, Playwright, ESLint (typescript-eslint), Prettier, `@colbymchenry/codegraph` (global CLI, not a package dependency).

**Storage**: IndexedDB (`meetings`, `segments`) for transcripts; `chrome.storage.local` for settings and the key (never `sync`).

**Testing**: Vitest unit + integration with recorded ElevenLabs WebSocket fixtures and `fake-indexeddb`; Playwright e2e against the built extension in `e2e` mode (fixture-replaying provider, Chrome fake media devices); manual real-meeting check recorded in `manual-check.md`.

**Target Platform**: Google Chrome ≥ 116 desktop (macOS primary), extension loaded unpacked.

**Project Type**: Browser extension (single project).

**Performance Goals**: in-progress text ≤ 2 s after speech, finished line ≤ 5 s after a pause (SC-002); reconnect ≤ 10 s (SC-003); panel stays responsive with ≥ 3 h of transcript (~5,000 lines — list virtualised only if measured necessary).

**Constraints**: audio and text leave the machine only to ElevenLabs (FR-024); ≤ 5 s of finished lines lost on crash (SC-004); no perceptible change to call audio (SC-006); realtime key terms ≤ 50 × 20 chars; tokens single-use, 15 min.

**Scale/Scope**: one user, one meeting at a time, one realtime session per meeting (one mixed stream; revised 2026-10-08, superseded: two sessions), meetings up to ~3 h.

No open NEEDS CLARIFICATION. 2026-10-08: the single mixed stream (spec Clarifications, constitution v1.1.0, design decisions 28–30) replaces the two-session design; tasks Phase 11 implements it. The two spec questions were answered on 2026-10-07 (spec Clarifications; design decisions 24–25): no manual mic pause in 001 — the mic is transcribed continuously until 002 follows Meet's mute state; the headphones notice (if Spike A shows duplication) shows at Start until "Don't show again".

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence / notes |
|-----------|--------|------------------|
| I. Privacy & Consent | Pass | Only network destination is `api.elevenlabs.io` (host permission, token mint + WebSocket); no telemetry. Key in `chrome.storage.local` only, never sent to UI/logs (credential-source contract, tests assert no key leakage). Consent reminder on Start (US5). Retention text truthful, no zero-retention claim (FR-005). Audio leaves only as one mixed stream; no per-source audio is sent (v1.1.0). Mute: the mic is silenced before mixing while muted, which also keeps muted audio out of the reconnect replay buffer; since 002 the capture delivers paired tab/mic frames, 002's mute gate (`src/core/session/mute-gate.ts`) holds both 500 ms and silences mic frames overlapping a muted span (and, on Meet, while the mute state can't be read — decision 34), and `mixFrames` then sums the pair in JS; 001's `MixedSourceHandle.setMicGate` GainNode gate was removed in 002 T049. No platform mute signal exists in 001 (generic adapter), so the "wherever the mute state can be read" clause does not yet apply; the gate stays open and the mic is mixed in continuously and the mic status shows "mute state unknown — mic is being sent" (FR-021, decision 24). 002 adds Meet mute following. Deletion: any stored meeting can be deleted for real, one at a time, from the panel (FR-029: after a delete the next most recent meeting is shown); the history list itself is 004. |
| II. Grounded Answers, Raw Records | Pass | Segment text stored exactly as received; no AI text anywhere in 001. Every 001 line is `labelSource: fallback`, label "Others" (v1.1.0: the user's label comes only from the platform's caption, 002); "Others" is never presented as a name and is styled as fallback (FR-010). The confirmed style stays for 002's `caption`/`manual` labels. |
| III. Test-First with Fixtures | Pass | Every task pair is test-first; ElevenLabs behaviour covered by JSONL WebSocket fixtures, storage by `fake-indexeddb`, e2e by a fixture provider and fake media devices. No automated test needs network, mic, meeting or key. Manual check recorded in `manual-check.md`. Spikes need real audio but are investigations, not tests, and their scoring logic is unit-tested. No DOM adapter in 001 (snapshot rule applies from 002). |
| IV. Degrade Visibly | **Pass, one recorded gap** | Status for capture (tab), the one transcription stream, speaker names (unavailable + reason, "every line Others"), mic input (a missing mic says the mix is tab-only), retention (FR-020). Auto-reconnect with replay buffer, same meeting (R4). Segments persisted per arrival. Gap: periodic writes to the knowledge-base inbox belong to 004 — see Complexity Tracking. Chat-provider status arrives with 003. |
| V. Isolate the Fragile Edges | Pass | `PlatformAdapter` (generic only), `TranscriptionProvider` (ElevenLabs + fixture fake), `CredentialSource` (local key; backend later) defined in `contracts/`. Chat providers and export sink are not built (003/004) — nothing in core hard-codes chat or export, and `StatusSnapshot` / `CredentialSource` extend by adding keys/methods. |
| VI. Smallest Useful v1 | Pass | New dependencies: `idb` (constitution-mandated IndexedDB, avoids hand-rolled transactions), `fake-indexeddb` (dev, fixtures). ElevenLabs SDK rejected for size (R2). New settings all trace to spec FRs. The spike recorder is dev-only and excluded from production builds. |

**Post-design re-check (after Phase 1)**: unchanged — the contracts introduce no new destinations, settings or dependencies beyond those above.

## Project Structure

### Documentation (this feature)

```text
specs/001-capture-live-transcript/
├── spec.md
├── plan.md                 # this file
├── research.md             # R1–R11 decisions
├── data-model.md           # Settings, Meeting, TranscriptSegment, StatusSnapshot, transitions
├── quickstart.md           # automated, manual-check and spike instructions
├── contracts/
│   ├── transcription-provider.md
│   ├── credential-source.md
│   ├── platform-adapter.md
│   └── extension-messages.md
├── checklists/requirements.md
├── manual-check.md         # filled during implement (Constitution III)
├── spike-findings/         # echo.md, language.md — generated by spike scripts, reviewed by the user
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
package.json · pnpm-lock.yaml · .nvmrc · tsconfig.json · wxt.config.ts
eslint.config.js · .prettierrc · vitest.config.ts · playwright.config.ts
.github/workflows/ci.yml

src/
├── entrypoints/
│   ├── background.ts              # service worker: panel behaviour, start/stop orchestration, getMediaStreamId, offscreen lifecycle, tab watch
│   ├── sidepanel/                 # React UI: index.html, main.tsx, App.tsx, components/ (Setup, Settings, Transcript, StatusBar, StartControls, ConsentDialog)
│   ├── offscreen/                 # index.html, main.ts — hosts MeetingRuntime (capture, sessions, persistence, live port)
│   ├── mic-permission/            # index.html, main.ts — one-time mic prompt page
│   └── spike-recorder/            # dev-only (excluded from production via filterEntrypoints)
├── core/
│   ├── transcript/                # segment builder, ordering, formatOffset
│   ├── session/                   # ReconnectingSession, reconnect policy, ReplayBuffer, MeetingRuntime
│   ├── status/                    # StatusSnapshot reducer
│   ├── settings/                  # schema, keyterm validation
│   ├── platform/                  # PlatformAdapter contract, GenericAdapter, registry
│   └── messaging/                 # protocol types + validators
├── providers/
│   ├── transcription/             # provider.ts contract, elevenlabs/ (client, messages, errors, url), fake/ (fixture provider)
│   └── credentials/               # credential-source.ts, local-key-source.ts
├── audio/                         # pcm.ts (downmix, float→int16, base64, framing), pcm16-worklet.ts, capture.ts, playback.ts
└── storage/                       # db.ts (idb schema), meeting-repo.ts, settings-store.ts

tests/
├── unit/                          # mirrors src/
├── integration/                   # session+provider on fixtures, runtime+repo on fake-indexeddb
├── contract/                      # shared suites: platform adapter, credential source, transcription provider
├── e2e/                           # Playwright specs + extension fixture
└── fixtures/
    ├── elevenlabs/*.jsonl         # recorded/synthesised WebSocket sequences (no keys, scrubbed ids)
    └── audio/*.wav                # short synthetic tones/speech-like clips for e2e fake mic

spikes/
├── README.md                      # how to run both spikes (mirrors quickstart)
├── lib/                           # wav reader/resampler, realtime streamer (Node, xi-api-key from env), scoring (WER/CER, echo duplicates)
├── echo.ts                        # pnpm spike:echo
├── language.ts                    # pnpm spike:language
└── data/                          # gitignored user audio and references
```

**Structure Decision**: single WXT project with `srcDir: 'src'`. Core logic (`src/core`) is free of `chrome.*` and DOM so it runs in plain Vitest; `chrome.*`, Web Audio and WebSocket are touched only in `entrypoints/`, `audio/`, `providers/` and `storage/` behind injected interfaces. Spike tooling lives outside `src/` and never ships.

## Key design decisions (one line each; details in research.md)

1. Auth: extension mints a single-use `realtime_scribe` token per connection from the stored key, behind `CredentialSource` (R1).
2. Own thin WebSocket client, no `@elevenlabs/client` (R2).
3. VAD commits; segments from `committed_transcript_with_timestamps`, meeting-relative word timings stored for 002 (R3).
4. Reconnect: fresh token, `previous_text` ≤ 50 chars, replay mixed audio since last commit, append-only segments (R4).
5. Offscreen document owns audio, sockets and DB writes; toolbar action grants `activeTab`; mic permission obtained once in an extension tab (R5).
6. One 16 kHz mixing context (tab + gated mic summed into the PCM16 worklet) + device-rate playback context for the tab (R5; revised 2026-10-08, superseded: a capture context per stream).
7. No manual mic pause; mute following arrives with 002's adapter, which closes the mic gate before mixing (R6).
8. Spikes: dev-only recorder page + Node scoring scripts, findings committed to this folder (R7, R8).
9. IndexedDB via `idb`, one transaction per segment, offscreen as single writer (R9).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle IV: no periodic knowledge-base inbox writes in 001 | Export sink and folder grant are 004's scope | Pulling export into 001 doubles its size; local IndexedDB persistence already bounds crash loss to seconds. |
