# Implementation Plan: Meet speaker names

**Branch**: `002-meet-speaker-names` (planned on `002-meet-speaker-names-plan`) | **Date**: 2026-10-08, revised the same day for one mixed audio stream (design decisions 28–30, constitution v1.1.0) | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-meet-speaker-names/spec.md`

## Summary

On Google Meet, a content script (declared for `https://meet.google.com/*`, idle until attached) turns Meet's captions on, hides them, and reports **caption activity — speaker name and timing, never text** — plus the mic button's mute state over a port to the offscreen document. There a `BridgedMeetAdapter` implements 001's `PlatformAdapter` contract (revised: text removed, runtime state and timestamped mute readings added). 001 now transcribes one mixed stream (tab audio + mic mixed locally, one ElevenLabs session), so every segment arrives as "Others". A pure `SpeakerAttributor` in core aligns caption turns — everyone's, including Meet's "You" turns for the user — with those segments using word timings, and labels a segment with a name only when one speaker clearly dominates it; Meet's label for the user becomes the user's name from settings. Otherwise, and whenever captions are unavailable, the line stays "Others" (the user's included). Segments show at once as "Others" and are updated within ~3 s when attribution settles. A `MuteGate` drives 001's mic gate: the mic input is silenced **before the mixer** (and so before the reconnect replay buffer) while the user is muted in Meet, with both inputs held 500 ms before mixing so mic audio captured just before a mute was detected is silenced too. Speaker names and mic status are always visible, with reasons. Manual corrections are stored as meeting-level renames keyed by speaker and per-line overrides, never overwriting the original attribution; renames of caption names are remembered in settings and auto-applied in later meetings. Details: [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript 5.9 strict (as 001).

**Primary Dependencies**: as 001 (WXT 0.21.x, React 19, `idb`). No new runtime or dev dependencies: jsdom (already the `dom` Vitest project) loads the saved Meet snapshots.

**Storage**: IndexedDB `meetings` / `segments` gain fields (no version bump, v1 records normalised on read); `chrome.storage.local` settings gain `speakerNameMappings`. The spec's assumption that persisting labels belongs to 004 is superseded: 001 already stores every segment as it arrives, so renames, overrides and attribution updates are stored the same way now; 004 only reads them.

**Testing**: Vitest — Meet locators and content-script behaviour on saved snapshots (jsdom), alignment on timeline fixtures, mute gate on frame/mute sequences, adapter contract suite over a fake port; Playwright — fixture Meet page served at `https://meet.google.com/abc-defg-hij` via `context.route`, so the real content script, bridge and offscreen runtime run end to end. Manual real-call check recorded in `manual-check.md`.

**Target Platform**: Chrome ≥ 116 desktop; Google Meet in the browser.

**Project Type**: Browser extension (single project, as 001).

**Performance Goals**: names on a line within ~3 s of the line appearing (SETTLE_MS) and never pending unlabelled (FR-009); mute → silence within one 100 ms frame of the reading arriving, unmute → mixed in again on the next frame, audible in the stream after the 0.5 s hold (FR-015 ≤ 1 s); names-unavailable state within 10 s (SC-003); rename visible on every line immediately (SC-005); content script adds no measurable load to Meet (observers scoped to the captions region and controls, events throttled to 4/s per turn).

**Constraints**: caption text is never read, sent or stored (FR-004; amended 2026-10-12 by feature 013: it is read and kept locally for the captions download only, see `specs/013-captions-download/plan.md`); no new network destination (Principle I); no mic audio captured while muted is ever mixed or sent, including on reconnect replay (FR-014, SC-004); no change visible to other participants (SC-006); a guess is never shown as a name (Principle II, SC-002).

**Scale/Scope**: one meeting, up to ~3 h, up to ~20 speakers, a few thousand caption turns.

**Dependency on 001 rework**: 001 is being switched to one mixed stream on branch `001-single-mixed-stream` (decision 28), exposing a gate that silences the mic input before mixing. 002 plans against that design; its only assumption about the API is "a per-frame gate on the mic input in front of the mixer" (research R8). Implementation of 002 starts after that rework is merged. No open user questions.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence / notes |
|-----------|--------|------------------|
| I. Privacy & Consent | Pass | No new network destination: the content script talks only to the extension; host permissions stay `https://api.elevenlabs.io/*`, plus one content-script match for `https://meet.google.com/*` (privacy guard test updated deliberately to assert exactly that). Caption text is never read (R5). Mute is followed on Meet as v1.1.0 words it: the mic contribution is silenced before mixing (and so before the replay buffer), with a guard hold for the detection window, closed until the first reading, closed for 5 s after losing a muted reading (R8); SC-004 suite proves no muted mic audio reaches the mixer or the provider. Mic status always shown. |
| II. Grounded Answers, Raw Records | Pass | Names only from captions under explicit coverage/dominance rules, the user's own name included (Meet's self label shown as the settings name, v1.1.0); ambiguity → "Others" fallback (R6). Corrections never overwrite the stored attribution (R9); display source distinguishes caption, manual and fallback. No AI text involved. |
| III. Test-First with Fixtures | Pass | Every Meet DOM assumption has a saved snapshot (contracts/meet-dom.md); synthetic snapshots now, real anonymised ones from the user (tasks Phase 7) with a dev-only capture helper. Alignment and mute behaviour run on recorded-style fixtures; e2e uses a routed fixture Meet page. Real-call check recorded in `manual-check.md`. |
| IV. Degrade Visibly | Pass | Every Meet failure has a reason in the status area (R4, R12): connecting, lobby, can't turn on, can't read, turned off by user, no captions for 8 s, page reloaded; without captions every line is "Others", the user's included (v1.1.0). Transcript never pauses for naming; recovery is automatic (US2-3, reload re-attach). |
| V. Isolate the Fragile Edges | Pass | All Meet DOM code in `src/platforms/meet/` + the content script; core sees only the revised `PlatformAdapter` contract through `BridgedMeetAdapter`. Contract revision is backwards-compatible for `GenericAdapter`. |
| VI. Smallest Useful v1 | Pass | No participant list, no active-speaker source, no segment splitting, no adaptive lag (R1, R6 alternatives). New setting (`speakerNameMappings`) is FR-022. Snapshot/trace helper is dev-only (spike build). 2026-10-12: the new setting `showMeetCaptions` is FR-028 (design decision 61); it adds no dependency, permission, network destination or abstraction — one boolean, one bridge field and one one-shot message. Principle I: still no caption text read or sent (FR-030); Principle V: the DOM change stays in `src/platforms/meet/`. |

**Post-design re-check (after Phase 1)**: unchanged. The design adds one content-script match and the `scripting`-free attach path; no new dependencies or destinations.

## Project Structure

### Documentation (this feature)

```text
specs/002-meet-speaker-names/
├── spec.md
├── plan.md                    # this file
├── research.md                # R1–R12
├── data-model.md              # segment/meeting/settings additions, caption turn, attribution, mute gate, status
├── quickstart.md              # automated + manual check
├── contracts/
│   ├── platform-adapter.md    # revision 2 of 001's contract
│   ├── meet-bridge.md         # attach handshake + port messages
│   ├── meet-dom.md            # Meet page assumptions ↔ snapshots
│   └── live-port-and-labels.md
├── checklists/requirements.md
├── manual-check.md            # created during implement (Constitution III)
└── tasks.md                   # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── entrypoints/
│   ├── meet.content/index.ts          # NEW content script on meet.google.com: attach handshake, wires src/platforms/meet
│   ├── background/meeting-control.ts  # + meet/attach after begin, meet/ready handler, meet/detach on end
│   ├── offscreen/host.ts              # + accept `platform:meet` ports → BridgeConnector; mappings in offscreen/begin
│   └── sidepanel/components/          # + LabelEditor.tsx (rename / just this line), RememberedNames.tsx in Settings; Transcript, StatusBar updates
├── platforms/meet/                    # NEW — all Meet DOM code (content-script side)
│   ├── locators.ts                    # tiered lookups (research R1, contracts/meet-dom.md)
│   ├── captions-control.ts            # enable / hide / restore / off-by-user detection
│   ├── caption-observer.ts            # turns → CaptionActivity (no text read)
│   ├── mute-observer.ts               # data-is-muted → MuteReading
│   ├── page-agent.ts                  # ties the above to the bridge port
│   └── snapshot.ts                    # dev-only (spike build): anonymised page snapshot
├── core/
│   ├── platform/adapter.ts            # contract revision 2
│   ├── platform/meet-bridge-adapter.ts# NEW BridgedMeetAdapter
│   ├── messaging/meet-bridge.ts       # NEW bridge protocol + validators
│   ├── messaging/protocol.ts          # + live/segment-updated, live/labels, labels/* commands
│   ├── speakers/                      # NEW caption-turns.ts, attribution.ts (pure rules), speaker-attributor.ts (pending/settle), watchdog.ts
│   ├── session/mute-gate.ts           # NEW
│   ├── session/meeting-runtime.ts     # wires captions, attributor, gate, label commands
│   ├── transcript/labels.ts           # NEW speakerKey, displayLabel, normaliseName
│   ├── settings/schema.ts             # + speakerNameMappings, showMeetCaptions (2026-10-12)
│   └── status/status.ts               # + captions/mute events, starting/muted states
└── storage/                           # meeting-repo.ts (+ updateSegment, setSpeakerRename, setLabelOverride, v1 normalise), settings-store.ts (+ mappings)

tests/
├── fixtures/meet/                     # synthetic snapshots (this plan), real/ (user), timelines/*.json (alignment)
├── unit/platforms/meet/               # locators × snapshots, captions control, caption & mute observers, snapshot anonymiser
├── unit/core/speakers/                # attribution rules, attributor, watchdog, timeline suite (SC-001/SC-002)
├── unit/core/session/mute-gate.test.ts
├── integration/core/                  # runtime + attributor + gate + fake adapter; mute-gate SC-004 suite
├── contract/platform-adapter.contract.ts  # extended; runs on BridgedMeetAdapter
└── e2e/meet.spec.ts                   # routed fixture Meet page
```

**Structure Decision**: Meet DOM code lives in a new `src/platforms/meet/` layer that only the content script imports; ESLint keeps it out of `src/core` (as `providers/` is today). The alignment and gate logic is platform-free core so the Zoom/Teams adapters can reuse them unchanged.

## Key design decisions (one line each; details in research.md)

1. Locators try semantic attributes → icon ligatures → English labels → class names, and report the tier (R1).
2. Declared content script on `meet.google.com`, idle until attached; re-attaches itself after a page reload (R2).
3. Content script ⇄ offscreen over a `platform:meet` port, attach via the service worker; offscreen receipt verified first, SW relay as fallback (R3).
4. Captions: wait for the call, click on if off, hide with opacity (nodes kept rendered), restore to the prior state, never fight the user (R4). 2026-10-12 (design decision 61): the band Meet reserves is left alone, and hiding is skipped while Settings → `Show Meet captions` is on.
5. Caption text is never read — only "this turn by this name changed at time t" (R5).
6. Named only if ≥ 60% of the segment's word time is covered by caption turns and one speaker has ≥ 80%; else "Others". Everyone's turns count, Meet's "You" turns become the user's settings name; no mic-vs-tab rule exists any more (R6).
7. Show "Others" at once, settle at end + 3 s, final at end + 10 s; every change stored before shown (R6).
8. Mute gate silences the mic input before the mixer (and before any replay buffer), both inputs held 500 ms, closed until the first reading, silence instead of dropping frames (R8). Red-team 2026-10-08 (decision 34): on Meet the gate fails closed — no reading, or a lost one, keeps the mic silenced (`unreadable`), never "unknown → sent".
9. Corrections are renames by speaker key and per-line overrides layered over the untouched attribution; `displayLabel()` is shared with 003/004 (R9). Red-team 2026-10-08 (decision 35): `others` has no rename — only per-line overrides, never remembered.
10. Remembered names copied into each meeting on first sight, so settings edits change only future meetings (R9).
11. Synthetic snapshots now; real anonymised snapshots and an alignment trace from the user via a dev-only spike-build helper (R11).
12. `Show Meet captions` (FR-028–FR-030, 2026-10-12): one boolean in settings, read by the service worker and passed to the Meet content script on attach, on re-attach and on change; `CaptionsControl.setShown` only adds or removes the hide tag and stylesheet. Core, the offscreen document and the adapter contract are unchanged (R4 "closed, live call 2026-10-12").

## Complexity Tracking

No constitution violations to justify.
