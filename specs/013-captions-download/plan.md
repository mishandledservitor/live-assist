# Implementation Plan: Captions download

**Branch**: `013-captions-download` (this plan was written on `013-captions-download-plan`) | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/013-captions-download/spec.md`, amended 2026-10-12 for design decisions 65–75 (Clarifications, sessions two and three). Constitution v1.2.1.

## Summary

On a Google Meet call live-assist keeps the text of Meet's own captions, turn by turn, in local storage with the meeting, and `Download transcript` saves it with the transcript: one `.zip` holding `… — Transcript.txt` and `… — Meet captions.txt` when a meeting has both, a plain `.txt` when it has one. The text never leaves the machine and never reaches Ask, the transcript or the panel. Naming is untouched.

Technical approach: the existing caption observer on the Meet page gets a second output for text. It reads only the turn a mutation touched, at most once a second, keeps the beginning Meet drops from long turns, and recognises a turn Meet re-creates (research R1, R3). One new bridge message carries a bounded difference of the turn's text to the offscreen document (R4), where the adapter reassembles it behind a new `subscribeText` on the adapter contract. A platform-free `CaptionLog` writes changed turns every two seconds to a new IndexedDB store, `captionTurns` (`DB_VERSION` 4), guarded against writing for a deleted or ended meeting; `deleteMeeting` removes the range in its one transaction (R5, R7). A turn's time is when live-assist first saw it, on the transcript's clock (R2). The side panel reads the stored turns at the moment of a download and builds the file with pure functions in `src/core/export/`, including a stored-only zip writer of about 100 lines checked byte for byte against an archive made by an independent implementation (R6). Two texts change: the two delete confirmations for a meeting with captions. (Amended 2026-10-13, decision 79: the reminder before Start does not change. The Meet-only sentence and the panel's platform check behind it were built and then removed.)

Details: [research.md](research.md), [data-model.md](data-model.md), [contracts/captions-capture.md](contracts/captions-capture.md), [contracts/files-and-storage.md](contracts/files-and-storage.md), [contracts/download-ui.md](contracts/download-ui.md), [quickstart.md](quickstart.md), [manual-check.md](manual-check.md).

## Technical Context

**Language/Version**: TypeScript strict (as 001), Node 24 LTS, pnpm.

**Primary Dependencies**: WXT, React 19, `idb`. No new dependency, shipped or dev (the zip is written here, research R6; the e2e test unpacks with the system's `unzip`).

**Storage**: IndexedDB `live-assist`, `DB_VERSION` 3 → 4: one new store `captionTurns` (key `[meetingId, seq]`), additive. One new optional field on stored meetings, `Meeting.hasCaptions`. Nothing in `chrome.storage`.

**Testing**: Vitest unit (node) for `src/core/export/*`, `src/core/captions/*`, the bridge parser and the adapter; Vitest dom (jsdom) on saved Meet snapshots for the locator, the observer's text path and the page agent, and for the panel components; Vitest integration (fake-indexeddb) for the migration, `MeetingRepo`, deletion, late writers and `MeetingRuntime`; Playwright on the built e2e extension (`captions-capture.spec.ts`, `captions-download.spec.ts`), which unpacks the saved zip with `unzip` and compares names and bodies byte for byte.

**Target Platform**: Chrome ≥ 116, Manifest V3: content script on `meet.google.com`, offscreen document (only `chrome.runtime`), side panel.

**Project Type**: Browser extension (single project).

**Performance Goals**: one `textContent` read per changed turn per second at most, independent of how many turns the page holds; one IndexedDB transaction per two seconds while captions change; the download of a 3-hour meeting (5,000 lines, 1,200 turns) built in under 200 ms and in Downloads within 2 s (SC-008).

**Constraints**: caption text exists only on the Meet page, in the offscreen document, in `captionTurns` and, for one download, in the panel; it is in no `LiveEvent`, log, chat request, transcript line or provider message (FR-008, FR-009). A crash loses at most 10 s of caption changes (design: about 3 s). Naming behaviour byte-identical on the 002 fixtures and traces (SC-006). No new permission (SC-009). DOM reading only in `src/platforms/meet/`; `src/core/` platform-free; `chrome.*` only in `src/entrypoints/`. No string beyond spec "Proposed copy".

**Scale/Scope**: 7 new source files, about 18 edited; about 16 new test files, about 14 edited; the synthetic Meet snapshots already hold invented caption sentences, which the tests now read; 1 binary fixture (the known-good zip) with its generator script.

## Permission impact

None. The content script already runs on `https://meet.google.com/*`; storage is IndexedDB; the download stays an anchor/blob download from the panel (007 research R1), and being one file it cannot raise Chrome's multiple-downloads prompt. The production permission list stays `sidePanel, tabCapture, offscreen, storage, activeTab`, host permissions unchanged. A test pins both, and that `package.json` `dependencies` is unchanged.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence / notes |
|-----------|--------|------------------|
| I. Privacy & Consent | Pass | Caption text goes to no network destination at all: stricter than "audio and transcript text MUST leave the machine only to" the two providers. It crosses only the extension's own port from the Meet page to the offscreen document, in one message type with its own validation and size limits (contracts/captions-capture.md), is written to IndexedDB, and is read by the panel for a download. Tests prove it is absent from ElevenLabs traffic, chat requests, the `live` port, logs and the spike trace (research R10). "Deletion MUST be real": the meeting's delete transaction removes its caption turns, a guard stops a late write from putting one back, and 012's every-store scan is extended (R7). "Consent reminder": unchanged, one text on every platform (decision 79, 2026-10-13, superseding decision 71 and C2); the delete confirmations name the captions (C3, C4). No third party receives captions, so the retention texts stay true as they are. Mute: untouched. No key or token is involved. |
| II. Grounded Answers, Raw Records | Pass | Ask's context is built from the meeting, its lines and earlier turns only; nothing in `src/core/chat/` may import `src/core/captions/` (a boundary test), and a test with a marker sentence in the caption store shows the request without it (decision 72). "AI-generated text MUST never be written into a transcript or a knowledge-base export": nothing is written into the transcript; the transcript body in the zip is 007's, byte for byte; the inbox export's name and format are not touched (decision 70). The captions file is Meet's machine transcription, saved as its own file under a name that says so, never merged with or presented as live-assist's transcript. Speaker attribution: line labels unchanged (SC-006); the captions file shows only names Meet gave, with the same renames the user made, and never "Others". |
| III. Test-First with Fixtures | Pass | Every implementation task in tasks.md follows its failing test. Meet DOM behaviour is tested only on saved snapshots; their turns already hold invented sentences, which are now asserted (the anonymiser keeps overwriting a real page's text, and a test pins that). The zip writer is tested against an archive made by Python's `zipfile`, committed with its generator. No test needs a meeting, microphone, network or key. `manual-check.md` records the user's real call, including the three things only a live page can show. |
| IV. Degrade Visibly, Never Lose the Transcript | Pass | Captions are persisted as they arrive: at most about 3 s behind the page, inside the spec's 10. Capture does not depend on the transcription session, so a reconnect loses no captions. A failed caption write is retried at the next flush and never touches the transcript's write chain (`writes`): transcript persistence cannot be slowed or broken by captions. A gap (captions off, page reloaded) is already visible in the speaker-names status; the user decided nothing new is said (standing defaults). A download whose captions cannot be read saves nothing rather than a zip missing a file. |
| V. Isolate the Fragile Edges | Pass | The amended bullet reads "caption speaker and text stream": the adapter contract gains `subscribeText` (revision 3) and core sees whole-text events, never Meet's DOM or the bridge's difference encoding. DOM reading stays in `src/platforms/meet/` (`captionTextOf`, the observer, `mergeCaptionText` for Meet's long-turn quirk); the wire format stays in `src/core/messaging/meet-bridge.ts`; storage in `src/storage/`. File building and the zip are pure functions in `src/core/export/`, separate from saving (FR-021), so 004's export sink can reuse them. A Meet change stays a one-adapter fix with a failing snapshot test naming it (D8–D10). |
| VI. Smallest Useful v1 | Pass | No setting (decision 65), no permission, no dependency. The zip writer is the smaller of the two ways to meet decision 67 (research R6: about 100 lines with one function, against a library's deflate, streams and zip64 that would never run). One store and one flag, each required: FR-003 needs turns stored as they arrive, FR-018/FR-022 need "has captions" without reading the text. One bridge message, one adapter method, one live event. Nothing for Zoom or Teams, no captions viewer, no search, no gap markers, no compression. |

Re-check after design: unchanged. No deviation; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/013-captions-download/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── manual-check.md            # steps written with the plan; results filled in by the user (T058)
├── contracts/
│   ├── captions-capture.md    # DOM assumptions D8–D10, observer text path, bridge message, adapter revision 3, runtime
│   ├── files-and-storage.md   # CaptionLog, file builders, the zip byte for byte, storage, panel seams
│   └── download-ui.md         # when the button shows, what a press saves, the three texts
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── platforms/meet/
│   ├── locators.ts                  # + captionTextOf (D8, D9)
│   ├── caption-text.ts              # NEW mergeCaptionText (Meet drops a long turn's beginning)
│   ├── caption-observer.ts          # + onText path: dirty marking, 1 s throttle, history, re-binding; activity path untouched
│   └── page-agent.ts                # + meet/caption-text (keep/append), owns the turn counter
├── core/
│   ├── messaging/meet-bridge.ts     # + meet/caption-text and its own validation; envelope also rejects `append`
│   ├── messaging/protocol.ts        # + live/captions-kept
│   ├── platform/adapter.ts          # revision 3: CaptionText, captions.subscribeText
│   ├── platform/meet-bridge-adapter.ts  # reassembles keep/append, emits whole text
│   ├── captions/
│   │   ├── model.ts                 # NEW StoredCaptionTurn
│   │   └── caption-log.ts           # NEW seq, startMs, dirty set, 2 s flush, close
│   ├── session/meeting-runtime.ts   # wires CaptionLog; remembered name on first kept turn; close before endMeeting
│   ├── transcript/model.ts          # + Meeting.hasCaptions
│   └── export/
│       ├── download-names.ts        # NEW base name and the three download names
│       ├── captions-file.ts         # NEW captionSpeaker, captionsFile
│       ├── zip.ts                   # NEW crc32, zipStored
│       ├── meeting-download.ts      # NEW what one press saves
│       ├── meeting-files.ts         # kind 'captions'; transcript name gains "— Transcript"
│       └── transcript-file.ts       # transcriptFileName built on meetingBaseName (inbox name unchanged)
├── storage/
│   ├── db.ts                        # DB_VERSION 4, store captionTurns
│   └── meeting-repo.ts              # putCaptionTurns (guarded), listCaptionTurns, deleteMeeting range
└── entrypoints/
    ├── offscreen/main.ts            # store.putCaptionTurns
    └── sidepanel/
        ├── save-file.ts             # saveDownload (text or zip)
        ├── meeting-api.ts           # captionTurns
        ├── main.tsx                 # wires it
        ├── hooks/useLive.ts         # live/captions-kept → meeting.hasCaptions
        ├── App.tsx                  # availability, load, C3
        ├── transcripts-api.ts       # (012) open() returns captionTurns
        └── components/
            ├── DownloadTranscript.tsx   # load → MeetingDownload | null
            └── MeetingRow.tsx, PastTranscript.tsx, TranscriptsScreen.tsx   # (012) availability, load, C4

tests/
├── fixtures/meet/README.md                                                   # the snapshots themselves are unchanged: their turns already hold invented sentences
├── fixtures/zip/{known-good.zip,make-known-good.py}
├── support/{meet-snapshot.ts,fake-meet-adapter.ts,stored-meetings.ts,caption-marker.ts}
├── unit/platforms/meet/{locators,caption-text,caption-text-observer,page-agent}.test.ts
├── unit/core/{messaging/meet-bridge,captions/caption-log,export/{zip,download-names,captions-file,meeting-files,meeting-download}}.test.ts
├── contract/platform-adapter.contract.ts
├── integration/{storage/{caption-turns,migration-v4,real-deletion,late-writers},core/meeting-runtime-captions,privacy/captions-leak}.test.ts
├── unit/sidepanel/{consent,start-controls,app-captions,download-transcript,save-file,…}.test.tsx
└── e2e/{captions-helpers.ts,captions-capture.spec.ts,captions-download.spec.ts}
```

**Structure Decision**: the existing single-project layout. The only new folder is `src/core/captions/`, kept apart from `src/core/speakers/` (naming, which must not see text) and `src/core/chat/` (which must not see captions); a lint-boundary test holds both separations.

## Design notes that span documents

1. **Two paths out of one observer, and they never meet.** Activity (002) and text (013) share the `MutationObserver` and the element-to-turn map, nothing else. Activity keeps its throttle, its closing rule and its "announce" rule; text has its own throttle, no closing rule and its own "kept or history" rule. Downstream they stay apart: `meet/caption` → `subscribe` → attributor and watchdog; `meet/caption-text` → `subscribeText` → `CaptionLog` → store.
2. **What the panel knows.** That a meeting has captions (`hasCaptions`), never what they say. The text is read from IndexedDB inside the download's `load()` and dropped when the file is built.
3. **One press, one file.** `meetingDownload` decides between the transcript, the captions and a zip of both; every Download in the panel (main view, row, single meeting) calls it, so the three places cannot differ (FR-019).
4. **Freshness.** Page → offscreen ≤ 1 s, offscreen → IndexedDB ≤ 2 s: a crash, a download or Stop is at most about 3 s behind Meet's page (spec: 10 s after a crash, 5 s for a download or Stop).
5. **Unknowns about Meet** (pruning, reload, long turns, re-renders) are designed so that either answer is safe, and are observed in the real call: research "Open risks" O1–O6, `manual-check.md` steps 7–10.

## Dependency on 012

`meetingFiles`, `saveFiles`, and the `available` / `load` / `prompt` props are on main (012 WG-A to WG-C). The Transcripts screen is being built on `012-transcripts-screen` and edits `App.tsx`, `main.tsx`, `meeting-api.ts`, `StartControls.tsx`, the shared panel fakes and the e2e helpers. Every 013 task that edits the side panel, changes `meetingFiles` (whose transcript name 012's e2e asserts) or touches the Transcripts screen therefore waits until that branch is merged (tasks.md, group WG-P). Everything else (Meet page, bridge, adapter, runtime, storage, the pure file builders) does not.

Withdrawn 2026-10-13 (decision 79): the ordering rule that the wiring that starts keeping captions (T026) must not reach the build the user runs before the reminder that says so (T030). The reminder no longer says so, on any platform, and captions are kept with the reminder on or off.

## Complexity Tracking

No constitution violation to justify. (The zip writer is own code instead of a dependency; that is the simpler alternative under Principle VI, argued in research R6, not a deviation.)
