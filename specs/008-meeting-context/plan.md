# Implementation Plan: Meeting context

**Branch**: `008-meeting-context` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-meeting-context/spec.md`

## Summary

The user adds notes to a meeting — a `.txt` / `.md` file or pasted text — beside Start for the next meeting, or in the Ask area for the meeting shown. The panel decodes and checks the file (UTF-8, ≤ 100,000 characters, not empty) and sends the text to the service worker, the only writer of a new IndexedDB store `meetingContexts` (schema v3), keyed by meeting id, with `next` for pending notes that the service worker moves to the meeting right after a successful Start. Each record has a version that changes on every add, replace and remove; chat turns store only which version their notes block was built from, never the text. When a question is asked, the 003 chat session adds a notes block before the transcript block of the first question after the notes appeared or changed, replays it with that turn while the version is unchanged, and leaves superseded notes out of replayed turns, telling the model they were replaced or removed (one cache rebuild per change; adding notes keeps the cache). The grounding prompt gains rules: notes are material, not said in the meeting; notes passages start "From your notes:" in the answer's language with no citation; what was said comes only from the transcript; notes never name "Others". The chat provider disclosures now say notes are sent; nothing goes to ElevenLabs. Details: [research.md](research.md) N1–N11, [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript 5.9 strict (as 001/003).

**Primary Dependencies**: none new (WXT, React 19, idb 8, the two chat SDKs from 003).

**Storage**: IndexedDB schema v3 adds `meetingContexts` (N2). `ChatTurn` gains `notesSent` (no version bump; absent reads as null). No `chrome.storage` change.

**Testing**: Vitest — core notes decoding/validation and block building, context/request building with notes, prompt rules, protocol parsers, context repo and DB upgrade (fake-indexeddb), chat session with notes (fake provider), Start applying pending notes (meeting control with fakes), provider request assertions with a notes block, panel hook and components (jsdom), privacy and copy scanners. Playwright — e2e build with the fixture chat provider: add beside Start, Start, ask, paste, remove, axe. User-run `pnpm eval:ask` with a notes set (N8).

**Target Platform**: Chrome ≥ 116 desktop (as 001).

**Project Type**: Browser extension (single project).

**Performance Goals**: chip within 1 s of picking a 100,000-character file (SC-001); no measurable change to first-words latency (one extra text block, cached after the first send).

**Constraints**: notes only to the selected chat provider (FR-015); no copy of superseded notes kept or sent (FR-012, FR-017); 003 bodies unchanged byte-for-byte when a meeting has no notes; copy per `embody-dont-announce`.

**Scale/Scope**: one set of notes per meeting, ≤ 100,000 characters; a few changes per meeting.

## Sequencing with other branches

- **`003-fix-real-call`** (not merged): rewrites `src/core/chat/prompt.ts` (rules 1–9), adds the quotation guard to `src/core/chat/citations.ts`, extends `spikes/lib/ask-eval.ts` and `tests/unit/core/chat/{prompt,context,citations}.test.ts`. 008 implementation starts only after it merges: rebase-free — merge `main` into `008-meeting-context` first (T001), then the prompt tasks (T024–T025) append to the merged rules and renumber references, and the eval tasks build on the merged scorer. 008 does not touch `citations.ts` (N6).
- **`007-download-transcript`** (built, not merged): takes design decision 48 and copy-review K40; 008 uses 49–54, K41, R30–R31. 008 adds one guard test against 007's formatter (T050), written once 007 is on `main`; if 007 has not merged by then, that assertion is skipped and noted.
- **004** (specified, not planned): carry-forward note added to `design-decisions.md`; 008's `deleteMeeting` change is what 004 reuses.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence / notes |
|-----------|--------|------------------|
| I. Privacy & Consent | Pass | Notes go only to the selected chat provider, only inside a question (FR-015); never to ElevenLabs (decision 53), the offscreen document or logs (N11, tests). The disclosures in setup and Settings say notes are sent (FR-016, R30–R31). Stored only in IndexedDB with the meeting; deleted with it in one transaction; removal and replacement leave no copy (version references, N3). No new host, permission or dependency. |
| II. Grounded Answers, Raw Records | Pass (constitution v1.2.0) | Principle II v1.2.0 allows marked, uncited `From your notes:` content that is never presented as said in the meeting and never names an unidentified speaker. What was said stays transcript-only and cited; notes passages are labelled and uncited (decision 50, prompt rules N-a–N-e); notes never enter the transcript, the download or the export (FR-018) and never name "Others" (prompt rule, eval SC-004). |
| III. Test-First with Fixtures | Pass | Every task pair is red → green; file fixtures (UTF-8, BOM, CRLF, Windows-1253, NUL, oversize, empty); fixture chat provider records the request; no key or network. Answer quality by the user-run eval; real-meeting check in `manual-check.md`. |
| IV. Degrade Visibly | Pass | Every rejected input says why and what to do (contracts/notes-ui.md); a failed save keeps the earlier notes; a pending-notes apply failure leaves them pending (visible beside Start after Stop) and never blocks Start; chat failures unchanged from 003. |
| V. Isolate the Fragile Edges | Pass | Decoding, validation and block building are pure core code; vendor wire formats change only in the two adapters (one extra text block); storage behind `ContextRepo`. |
| VI. Smallest Useful v1 | Pass | No new settings, dependencies or formats; one store; one component used in two places; no drag and drop, preview or counters. |

**Post-design re-check (after Phase 1)**: unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/008-meeting-context/
├── spec.md
├── plan.md                 # this file
├── research.md             # N1–N11
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── notes-messages.md
│   └── notes-ui.md
├── checklists/requirements.md
├── manual-check.md         # created during implement
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── core/chat/
│   ├── notes.ts                # NEW MeetingNotes, MeetingContextRecord, limits, decodeNotesFile, notesFromPaste, validateNotes, notesBlock, replayNotes, buildNotes
│   ├── context.ts              # buildRequest takes the notes record; estimateTokens counts notes
│   ├── prompt.ts               # rule 1 widened, notes rules N-a–N-e (after 003-fix-real-call)
│   ├── provider.ts             # user turn `notes?`
│   ├── turn.ts                 # notesSent, normalise absent → null, view omits it
│   └── messages.ts             # too-large with notes; notes error texts
├── core/messaging/protocol.ts  # context/set, context/remove, replies, parsers
├── providers/chat/
│   ├── anthropic.ts            # notes text block first
│   ├── openai.ts               # notes input_text first
│   └── fixture-provider.ts     # records whether the request had notes (e2e assertion)
├── storage/
│   ├── db.ts                   # v3: meetingContexts
│   ├── context-repo.ts         # NEW ContextRepo
│   └── meeting-repo.ts         # deleteMeeting also deletes the notes record
└── entrypoints/
    ├── background/
    │   ├── context-commands.ts # NEW context/set, context/remove
    │   ├── chat-session.ts     # loads the record, buildNotes, notesSent, log flag
    │   ├── meeting-control.ts  # applyPending after a successful start
    │   └── index.ts            # route the two commands
    └── sidepanel/
        ├── notes-api.ts        # NEW NotesApi: get (IndexedDB), set/remove (commands), readFile
        ├── hooks/useMeetingNotes.ts      # NEW
        ├── components/NotesControl.tsx   # NEW button, menu, chip, remove, file input, error
        ├── components/NotesPasteDialog.tsx  # NEW
        ├── components/ChatRetention.tsx  # disclosure rewrites R30–R31
        ├── components/StartControls.tsx  # + notes slot after the language picker, hidden while running
        ├── components/AskArea.tsx        # + NotesControl for the meeting shown
        ├── components/ChatThread.tsx     # too-large text with notes
        ├── components/notes.css          # NEW
        ├── App.tsx / main.tsx            # wire notesApi
spikes/lib/ask-eval.ts, spikes/ask-eval.ts   # notes tags and set (N8)

tests/
├── fixtures/notes/*.{txt,md,bin}         # utf8, bom, crlf, windows-1253, nul, empty, whitespace, long, pdf-named
├── fixtures/chat/eval/notes-agenda.json
├── unit/core/chat/{notes,context,prompt,turn,messages}.test.ts   # messages.test.ts new
├── unit/core/messaging/notes-protocol.test.ts
├── unit/providers/chat/{anthropic,openai}.test.ts (+ notes block)
├── integration/storage/{context-repo,meeting-repo}.test.ts
├── integration/background/{chat-session,context-commands}.test.ts, unit/background/meeting-control-notes.test.ts
├── unit/sidepanel/{notes-api,use-meeting-notes,notes-control,notes-paste-dialog,start-controls-notes,ask-area-notes,chat-retention}.test.tsx
├── unit/privacy/notes-leak.test.ts
├── unit/copy/copy-review.test.ts + fixtures/copy/copy-review.json, keep-strings.test.tsx
└── e2e/notes.spec.ts, e2e/a11y.spec.ts (+ notes)
```

**Structure Decision**: same layering as 003: pure logic in `core/`, vendor formats in `providers/`, `chrome.*` in entrypoints, panel UI in its own components and stylesheet. Shared files (`prompt.ts`, `context.ts`, `protocol.ts`, `db.ts`, `meeting-control.ts`, `App.tsx`, `StartControls.tsx`, `AskArea.tsx`) change by small additive edits.

## Decided in the plan without asking (reversible)

Service worker as the only notes writer (N1); a separate store with a `next` key and tombstones (N2); version references instead of copies (N3); notes block before the transcript block, superseded blocks dropped from replay (N4); prompt rules (N5); no citation-parser change (N6); decoding in the panel with re-validation in the worker (N7); eval tags (N8); too-large wording (N9); control placement (N10). The spec's defaults A1–A10 are the user-facing ones and are listed for the user.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|-----------|------------|--------------------------------------|
| IndexedDB schema bump to v3 | Notes stored with the meeting, deleted with it (decision 52, FR-017) | A field on `Meeting` puts notes in the offscreen document's records and every meeting read; `chrome.storage.local` is for settings and keys |
| Replayed turns can lose their notes block (one exception to 003's byte-for-byte replay) | Superseded notes must never be sent again (FR-012) | Keeping them replayed sends removed text on every later question |

## Analyze pass (2026-10-09)

No CRITICAL or HIGH findings. Coverage: 19 of 19 functional requirements have at least one task (FR-001 T004/T032/T044; FR-002 T010/T046; FR-003 T010/T026/T034/T036; FR-004 T034/T046/T054; FR-005 T032; FR-006 T004/T014/T046; FR-007 T004; FR-008 T018/T022; FR-009–FR-011 T024/T038; FR-012–FR-013 T042; FR-014 T018/T040; FR-015 T026/T050; FR-016 T052; FR-017 T010/T012/T050; FR-018 T050; FR-019 T056). SC-002–SC-004 by the user-run eval (T038–T039, T062), SC-001 and SC-007 by the manual check (T059, T062), SC-005–SC-006 by T050.

MEDIUM, fixed: SC-001 had no measuring step (added to the manual check and T059); the upgrade test named a file that does not exist (`db-upgrade.test.ts`; the upgrade case now sits in `context-repo.test.ts`, following 003's `chat-repo.test.ts`); the e2e Start path and the fixture provider's request recording were unspecified (T036, T021 now name `transcribe.spec.ts` and the service-worker read in `helpers.ts`). MEDIUM, resolved: uncited notes passages beside Principle II's citation rule — constitution v1.2.0 (merged 2026-10-09) allows them explicitly, so the Constitution Check now passes and the Complexity Tracking row is gone. LOW, fixed: research N3 and the data model disagreed on the version of applied pending notes (now version 1 in both); "context" vs "notes" naming (data-model note); research N2 said every removal leaves a tombstone, data-model deletes pending notes instead (N2 aligned); `unknown-meeting` missing from the panel's error mapping (data-model); an edge case implied reading limits by characters before decoding (spec reworded). LOW, left: two side panels saving notes at once (last write wins, no task); persistence across a browser restart is IndexedDB's own behaviour (covered by the e2e reopen in T054, not a restart).

Tasks: 62 (Setup 3, Foundational 12, US1 22, US2 4, US3 8, US4 6, Polish 7).
