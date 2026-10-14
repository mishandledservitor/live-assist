<!--
Sync Impact Report
- Version change: 1.2.1 → 1.2.2 (instructed by the user 2026-10-13)
- Bump rationale: PATCH — wording only, no principle added, removed or redefined. The v1 target folder of the knowledge-base export is named without a company name, ahead of the repo going public (design decision 81).
- Modified principles: none
- Modified sections: Technical Constraints, Knowledge-base export (v1 target folder name)
- Added / removed sections: none
- Templates reviewed: plan-template.md, spec-template.md, tasks-template.md — no edits needed
- Follow-up (non-governance): none
- History: 1.2.1 (2026-10-12) wording brought in line with decision 63 and 008: caption speaker and text stream; storage lists notes and the meeting platform’s captions; 1.2.0 (2026-10-09) Principle II expanded: marked, uncited Background and user notes; 1.1.1 (2026-10-09) default chat model GPT-6 Luna; 1.1.0 (2026-10-08) single mixed audio stream; 1.0.0 ratified 2026-10-07
-->

# live-assist Constitution

## Core Principles

### I. Privacy & Consent by Design

live-assist records other people. Every feature MUST treat that as the primary risk.

- Audio and transcript text MUST leave the machine only to the speech-to-text provider (ElevenLabs) and the user's selected chat model provider. No other network destination, telemetry, or analytics is permitted without a constitution amendment.
- Microphone audio MUST NOT be sent anywhere while the user is muted in the meeting, wherever the meeting platform's mute state can be read: the microphone's contribution is replaced with silence before it is mixed into the outgoing stream.
- API keys and tokens MUST be stored only in `chrome.storage.local` (never `storage.sync`), MUST never appear in logs, error messages, exports, or test fixtures, and MUST never be committed.
- Meeting history MUST stay in local browser storage; deletion MUST be available per meeting and MUST be real (no soft delete).
- Starting a transcription MUST show a consent reminder unless the user has explicitly turned it off.
- The UI MUST state truthfully what the third parties retain; the app MUST NOT imply a privacy guarantee it does not have.

Rationale: a meeting tool earns trust only if the user can say exactly where every word went.

### II. Grounded Answers, Raw Records

- Chat answers MUST be grounded in the transcript the user has: the model is given the transcript so far, and every statement about what was said MUST cite the moments it relies on as `[mm:ss]` timestamps that navigate to the transcript. A citation MUST point only at lines that support the statement.
- Two other kinds of content MAY appear in an answer, each visibly marked and never cited: background explaining a term or concept (`Background:`), and material from notes the user attached (`From your notes:`). Neither MAY be presented as something said in the meeting, and neither MAY name a speaker the transcript leaves unidentified.
- When the transcript does not support an answer, the assistant MUST say so rather than guess.
- AI-generated text MUST never be written into a transcript or a knowledge-base export. Exports to the knowledge-base inbox contain only what was said, attributed to who said it.
- Speaker attribution MUST distinguish confirmed labels (from platform captions — including the platform's own label for the user, shown as the user's name — or manual correction) from fallbacks; a guess MUST NOT be presented as a name.

Rationale: transcripts feed a company knowledge base; an invented sentence there becomes a false fact.

### III. Test-First with Fixtures (NON-NEGOTIABLE)

- Red → green → refactor for every unit of work: a test is written and seen failing for the right reason before the implementation exists.
- Automated tests MUST NOT require a live meeting, a microphone, network access, or real API keys. External behaviour is exercised through recorded fixtures: audio clips, ElevenLabs WebSocket message sequences, chat-provider streams, and saved meeting-page DOM snapshots.
- Every platform DOM adapter MUST have tests against saved page snapshots; a selector change on the platform is fixed by updating the snapshot and the adapter together.
- Manual verification against a real meeting is required before a platform feature is called done, and its result is recorded in the feature's spec folder.

Rationale: the hard parts (captions, alignment, streaming) are timing-dependent and must be reproducible without a call.

### IV. Degrade Visibly, Never Lose the Transcript

- Every external dependency has a defined failure mode, and the side panel MUST show the current state of each (capture, transcription, speaker names, mic/mute, chat provider, retention).
- If captions cannot be enabled or read, every line MUST be labelled "Others" (the user's own lines included) and the panel MUST say why.
- If a transcription session drops or hits a time limit, the app MUST reconnect automatically and continue the same meeting record.
- Transcript data MUST be persisted locally as it arrives, and written to the knowledge-base inbox periodically during the meeting and on Stop, so a crash loses at most a few minutes.

Rationale: a silent failure in a live meeting is discovered only after the moment it was needed.

### V. Isolate the Fragile Edges

Everything that can change underneath us sits behind a narrow interface with a fixture-tested contract:

- **Meeting-platform adapters** (one per platform: captions on/off/hide, caption speaker and text stream, mute state, meeting metadata). Core logic MUST NOT reference a platform's DOM.
- **Transcription provider** (ElevenLabs realtime).
- **Chat-model providers** (Anthropic Claude and OpenAI in v1), selected in settings.
- **Credential source** (user-supplied keys in v1; a company backend issuing tokens later) — no feature may assume keys are local.
- **Export sink** (local folder via the File System Access API in v1; a GitHub push later).

Rationale: platform DOMs and vendor APIs change without notice; a change must stay a one-adapter fix.

### VI. Smallest Useful v1

- v1 is a personal tool for one user: Chrome only, Google Meet only for speaker names, bring-your-own keys, loaded unpacked.
- Other surfaces (Teams and Zoom adapters, company backend and multi-user distribution, GitHub push to the knowledge base, auto-posted consent notice) are separate future features with their own specs. They inform interfaces (Principle V) but MUST NOT be built speculatively.
- New settings, dependencies, and abstractions MUST be justified by a current requirement in a spec.

Rationale: a working Meet tool beats an unfinished three-platform one.

## Technical Constraints

- **Runtime**: Chrome extension, Manifest V3, using a side panel, an offscreen document for audio, and content scripts per supported meeting platform.
- **Stack**: TypeScript (strict), WXT, React, pnpm. Tests: Vitest (unit/integration) and Playwright (end-to-end against the built extension and saved meeting pages). ESLint and Prettier.
- **Audio**: tab audio and microphone are captured separately, mixed locally into one mono stream, and transcribed in a single ElevenLabs realtime session (one billed stream), converted to the PCM format the API requires. The separate captures exist only so the microphone can be silenced before mixing; no per-source audio leaves the machine.
- **Transcription**: ElevenLabs Scribe realtime, with automatic language detection by default, a per-meeting language override, and a user-maintained key-terms list. Mixed-language speech (e.g. Greek/English) is an expected input, not an edge case.
- **Chat**: OpenAI (default GPT-6 Luna, `gpt-6-luna`) or Anthropic Claude, chosen in first-run setup and changeable in settings; responses stream; the full transcript so far is sent as context.
- **Storage**: meeting history (transcript, labels, chat, notes, the meeting platform's captions) in IndexedDB; settings and keys in `chrome.storage.local`.
- **Knowledge-base export**: plain text written to a user-granted folder (v1 target: `knowledge-base/05-inbox/`), file name `Meeting — DD-MM-YYYY at HHhMM.txt`, body lines `[mm:ss] Speaker: text` separated by blank lines — matching the existing inbox format.

## Development Workflow & Quality Gates

- All development follows Spec Kit: specify → (clarify) → plan → tasks → (analyze/checklist) → implement. No production code outside a spec'd, planned, tasked feature, whatever channel the request arrived through.
- All development happens on a git worktree branch, never on `main`; changes reach `main` by PR or fast-forward after gates pass.
- CI (GitHub Actions) MUST pass on every PR: lint, type-check, unit/integration tests, and end-to-end tests.
- Every plan MUST include a Constitution Check against Principles I–VI and record any justified deviation in its Complexity Tracking table.
- Process rules for agents (commit cadence, status upkeep, CodeGraph, context preservation, `.env` handling) live in `CLAUDE.md` and apply alongside this constitution.

## Governance

- This constitution outranks `CLAUDE.md` and all other guidance on anything about the code and product; `CLAUDE.md` governs agent process.
- Amendments are made with `/speckit-constitution`, require the user's explicit approval, update the Sync Impact Report, and are committed on their own.
- Versioning: MAJOR for removing or redefining a principle; MINOR for adding a principle or materially expanding one; PATCH for wording and clarifications.
- Compliance is checked at three points: the plan's Constitution Check, `/speckit-analyze` before implementation, and PR review. A violation blocks merge unless it is recorded and justified in the plan.

**Version**: 1.2.2 | **Ratified**: 2026-10-07 | **Last Amended**: 2026-10-13
