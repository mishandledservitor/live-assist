# Status log

Record, not law: superseded "Current status" paragraphs from `CLAUDE.md`, moved here verbatim so the always-loaded file stays short. Agents do not need to read this file. Numbers such as `#17` or `PR #17`, commit hashes, branch names and the "handoff notes" mentioned here belong to the private development history before release 1.0.0 and have no public counterpart.

## 2026-10-08 — moved out of CLAUDE.md (main side of the 002-plan merge)

Design grilled; constitution v1.1.0 (amended 2026-10-08: single mixed audio stream, user's lines identified from captions only) (`.specify/memory/constitution.md`); every product decision is recorded in `.specify/memory/design-decisions.md` (decisions 1-27). v1 is split into four features in `ROADMAP.md`; 002 Meet speaker names, 003 Ask the transcript and 004 History & inbox export are specified (clarifications resolved) on main. 001 capture & live transcript: all code is built. Phases 1–8 are merged (PRs #3–#7); Phase 10 (polish: privacy guard test, redacting logger, 5,000-line transcript performance, accessibility pass) is on branch `001-impl-polish` (PR open, not merged). The spike runs (T047/T048, T083) and Phase 9 (FR-028 headphones notice) are deferred out of v1 (decisions 26–27). **With the user:** the real-call manual checks in `specs/001-capture-live-transcript/manual-check.md` — T068 (MVP, includes T054 step 2), T078 (Wi-Fi off/on reconnect), the 3-minute language/consent check, and the 001 sign-off (T093). ROADMAP 001 stays `in-progress` until they pass. **Resume:** merge the Phase 10 PR on green CI; once the user records the manual checks, tick T068/T078/T093 and finish T094 (ROADMAP 001 → `done`). Then plan/tasks/implement 002, 003, 004 in that order. Implementation notes for later phases are at the end of tasks Phases 2, 4–8 and 10 in `tasks.md`. The extension has no icon yet (no spec'd task covers it) — candidate follow-up.

## 2026-10-08 — moved out of CLAUDE.md (002-plan branch side of the same merge)

Design grilled and constitution v1.0.0 ratified (`.specify/memory/constitution.md`); every product decision is recorded in `.specify/memory/design-decisions.md` (decisions 1-27). v1 is split into four features in `ROADMAP.md`; 003 Ask the transcript and 004 History & inbox export are specified (clarifications resolved) on main. 001 capture & live transcript: all code is built and merged (PRs #3–#8). The spike runs (T047/T048, T083) and Phase 9 (FR-028 headphones notice) are deferred out of v1 (decisions 26–27). **With the user:** the real-call manual checks in `specs/001-capture-live-transcript/manual-check.md` — T068, T078, the language/consent check and the 001 sign-off (T093); ROADMAP 001 stays `in-progress` until they pass, then tick them and finish T094. 002 Meet speaker names: planned on branch `002-meet-speaker-names-plan` (PR open, not merged) — plan, research, data model, contracts, quickstart, 77 tasks in 8 phases, analyze findings fixed, synthetic Meet snapshots in `tests/fixtures/meet/`; ROADMAP 002 `planned-impl`. One open question for the user in research R8 (stream silence vs suspend the mic session while muted; tasks assume silence). **Resume:** merge the 002 plan PR on green CI; then `/speckit-implement` 002 one phase per worktree run (bridge proof T005–T006 first), with the user capturing real Meet snapshots and an alignment trace (tasks Phase 7). Then plan/tasks/implement 003, 004. Implementation notes for later phases are at the end of tasks phases in each feature's `tasks.md`. The extension has no icon yet (no spec'd task covers it) — candidate follow-up.

## 2026-10-08 — superseded 001 bullet

- 001 capture & transcript: built (Phases 1–8, 10 merged; Phase 9 and spikes deferred). Being reworked to one mixed stream on branch `001-single-mixed-stream`. Real-call checks with the user afterwards: `specs/001-capture-live-transcript/manual-check.md`.

## 2026-10-08 — superseded bullets (after PR #10 merged)

- 001 capture & transcript: built (Phases 1–8, 10 merged; Phase 9 and spikes deferred). One-mixed-stream rework (Phase 11, T095–T108) done on PR #10, CI not yet checked — **resume here:** watch CI, fix if red, merge, rebuild, then ask the user for the real-call checks in `specs/001-capture-live-transcript/manual-check.md`. 002's spec may still mention the removed `self` label source; fix during 002 implementation (mic gate API: `MixedSourceHandle.setMicGate`).
- 002 Meet speaker names: planned on branch `002-meet-speaker-names-plan` (PR #9), revised for the mixed stream; implement after the 001 rework merges.

## 2026-10-08 — superseded 002 bullet (after PR #13)

- 002 Meet speaker names: plan merged (PR #9); implementation in progress one phase per worktree run. Its spec may still mention the removed `self` label source — fix during implementation. Mic gate API: `MixedSourceHandle.setMicGate`.

## 2026-10-08 — superseded skills bullet (embody-dont-announce added)

- Process skills vendored in `.claude/skills/` (copied 2026-10-07 from the user's claude.ai skill sync): `context-preservation`, `salience`, `grilling`, `grill-me`, `anti-ai-writing`, alongside the `speckit-*` skills. To refresh, re-copy from the newest synced copy rather than editing in place.

## 2026-10-08 — superseded status bullets (after PR #15 and the red-team review)

- Constitution v1.1.0 (single mixed audio stream; user's lines from captions only). Decisions 1-30 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`.
- 001 capture & transcript: built and merged, including the one-mixed-stream rework (PR #10). Waiting on the user's real-call checks in `specs/001-capture-live-transcript/manual-check.md`; ROADMAP 001 → `done` once they pass.
- 002 Meet speaker names: Phases 1–6 merged (PRs #11–#13: names from captions, fallback reasons, mute gate before the mixer, relabel and remembered names). Left: Phase 7 (user-run real snapshots and alignment trace) and Phase 8 polish; real-call checks in `specs/002-meet-speaker-names/manual-check.md`.
- 003, 004: specified, not planned.

## 2026-10-08 — superseded status bullets (after PRs #16, #17)

- Constitution v1.1.0. Decisions 1-33 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`.
- 006 panel redesign: spec + copy review (embody-dont-announce) in progress on branch `006-panel-redesign`.
- Red-team review 2026-10-08: fixes for its findings on branch `fix/red-team-2026-10-08`. Open user decision: mute gate fails open after 3 s without a Meet mute reading.

## 2026-10-08 — superseded status bullets (after PRs #18, #19)

- Constitution v1.1.0. Decisions 1-35 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- 001 capture & transcript and 002 Meet speaker names: built and merged (002 real-Meet fix in PR #15). Waiting on the user's real-call checks (`specs/00{1,2}-*/manual-check.md`).
- 006 panel redesign: spec, plan, 53 tasks and copy review merged (PR #16); implementation in progress, one phase group per worktree run. Reconcile the mute-status copy with decision 34 (fail closed on Meet) first.

## 2026-10-08 — superseded 001/002 bullet (end-of-day pause)

- 001 capture & transcript and 002 Meet speaker names: built and merged, incl. real-Meet fix (#15) and retest fixes (#19: caption activity from item mutations, long-turn timing, auto-stop on leaving the call). Next: the user's real call with the trace build (`pnpm build:spike`, saves to `Downloads/live-assist-meet/`); then tune from the trace and sign off via `specs/00{1,2}-*/manual-check.md`.

## 2026-10-09 — superseded status bullets (after PR #21)

- Constitution v1.1.0. Decisions 1-36 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- 001 and 002: built and merged (#15 real-Meet fix, #19 retest fixes). **Resume here:** branch `002-late-captions` (WIP e5b18f4, real anonymised trace fixture added, no PR): spec entries + decision 37 ("…" placeholder while a name is pending), then test-first: trace records the meeting origin (single clock domain), turn-split gap 5 s → 5.5 s (`ACTIVITY_GAP_MS`), settle ~6 s, "…" placeholder, manual-check update; analysis is in the WIP commit message. Then the user's next real call to confirm, and sign-off via `specs/00{1,2}-*/manual-check.md`.
- 003, 004: specified, not planned.

## 2026-10-09 — superseded status bullets (constitution v1.1.1)

- Constitution v1.1.0. Decisions 1-37 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- 003 Ask the transcript: plan + 77 tasks on PR #20 (not merged); open: Ask placement + chat key at setup (user), verify the Claude model list (a "Haiku 5.5" appears; newest known is Haiku 4.5). 004: specified, not planned.

## 2026-10-09 — superseded status bullets (sign-off)

- 001 and 002: built and merged, incl. late-caption fixes (#21: trace records the meeting origin, turn-split gap 5.5 s with a thin ~0.1 s margin backed by one real trace, "…" placeholder while a name settles ~6 s). Next: the user's real call to confirm, then sign-off via `specs/00{1,2}-*/manual-check.md`.
- 006 panel redesign: merged (PR #18); real-use check open (`specs/006-panel-redesign/manual-check.md`).

## 2026-10-09 — superseded status bullets (pause)

- Constitution v1.1.1 (default chat model GPT-6 Luna). Decisions 1-40 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- 003 Ask the transcript: plan merged (PR #20; Ask box under the transcript, chat provider + key required in first-run setup, default GPT-6 Luna); implementation in progress one phase group per worktree run. 004: specified, not planned.

## 2026-10-09 — superseded status bullet (handoff note added)

- **Paused 2026-10-09 — resume here:** (1) PR #24 `002-split-at-speaker-change` (split lines at speaker changes, 1.0 s VAD, clean transcript on by default — decisions 41, 43): open, check CI, review, merge. (2) Branch `003-impl-setup-polish` (WIP d9ea597, no PR): 003 Phase 5 in progress — OpenAI adapter, chat-key check, settings API and Questions section done; next T064/T065 (retention disclosure; Anthropic text gains "by default"), fix typecheck in Settings.tsx/Setup.tsx, T066–T073 setup step, then Phases 6–7, PR. 003 Phases 1–4 merged (#22, #23). 004: specified, not planned; first planning question is the post-meeting batch pass (decision 42).

## 2026-10-09 — superseded status bullet (session resumed)

- **Paused 2026-10-09 — read the maintainer's local handoff notes first:** resume order (PR #24 merge, then 003 Phase 5 WIP on `003-impl-setup-polish`, then the user's real call, then plan 004), pending user approvals, working method and gotchas.

## 2026-10-09 — superseded status bullets (PR #25 merged)

- Constitution v1.1.1 (default chat model GPT-6 Luna). Decisions 1-43 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- **Resumed 2026-10-09:** PR #24 (split lines at speaker changes, 1.0 s VAD, clean transcript default) merged. 003 Phases 5–7 running on `003-impl-setup-polish`; PR to follow. Next: the user's real call (`specs/003-ask-the-transcript/manual-check.md`, `specs/002-meet-speaker-names/manual-check.md`), then plan 004. Pending approvals and gotchas: the maintainer's local handoff notes.

## 2026-10-09 — superseded status bullet (Others-rate follow-up added)

- 001, 002, 006: done — signed off by the user in a real Meet call 2026-10-09 (`specs/00{1,2,6}-*/manual-check.md`). Follow-ups: a ≥3-person alignment trace for 002 (thin 5.5 s margin); 005 minutes estimate needs a measured credit rate.

## 2026-10-09 — superseded status bullets (PRs #26-#28 merged)

- Constitution v1.1.1 (default chat model GPT-6 Luna). Decisions 1-47 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- **003 Ask the transcript: built, awaiting the user's real call** (PR #25 merged 2026-10-09; PR #24 merged too). Next: T082 real call + `pnpm eval:ask` per `specs/003-ask-the-transcript/manual-check.md` and `specs/002-meet-speaker-names/manual-check.md`, then plan 004 (first question: post-meeting batch pass, decision 42). Gotchas and working method: the maintainer's local handoff notes.

## 2026-10-09 — superseded status bullet (constitution 1.2.0)

- Constitution v1.1.1 (default chat model GPT-6 Luna). Decisions 1-48, 55-56 (49-54 reserved by the 008 branch) in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.

## 2026-10-09 — superseded status bullets (PR #30 merged)

- Constitution v1.2.0 (Principle II: marked, uncited Background and user notes; default chat model GPT-6 Luna). Decisions 1-48, 55-56 (49-54 reserved by the 008 branch) in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- **Awaiting the user's real call** for 003 (incl. fixes PR #27: Background for terms, citation guard), 007 Download transcript (PR #28) and the 002 captions collapse (PR #26), all merged 2026-10-09. Steps: `specs/{002,003,007}-*/manual-check.md`; the user also runs `pnpm eval:ask`. 008 Meeting context: spec/plan/tasks on `008-meeting-context` (decisions 49–54), build after the user checks its defaults; then a Principle II amendment question (uncited notes/Background). 009 Standing context, 010 key terms from context: roadmap only. 004 plan after. Gotchas: the maintainer's local handoff notes.

## 2026-10-10 — superseded status bullets (pause)

- Constitution v1.2.0 (Principle II: marked, uncited Background and user notes; default chat model GPT-6 Luna). Decisions 1-57 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- **Awaiting the user's real call** for 003 (incl. fixes PR #27), 007 Download transcript (PR #28), the 002 captions collapse (PR #26) and 008 Meeting context (PR #30), all merged 2026-10-09. Steps: `specs/{002,003,007,008}-*/manual-check.md`; the user also runs `pnpm eval:ask` (incl. `--set notes-agenda`). Next: 009 Standing context and 010 key terms from context (roadmap only), then plan 004 (first question: post-meeting batch pass, decision 42; also unfinished meetings after a browser quit have no end time). Gotchas: the maintainer's local handoff notes.

## 2026-10-10 — superseded status bullets (PR #32 merged)

- Constitution v1.2.0 (Principle II: marked, uncited Background and user notes; default chat model GPT-6 Luna). Decisions 1-58 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- **Paused 2026-10-10 — read the maintainer's local handoff notes first:** second real call done; PR #26 captions collapse reverted (#31, decision 58). Resume: finish WIP `ask-fixes-2026-10-10` (conversation-word answers, notes labelling/paragraph, eval scoring), PR; then the user's next call and evals; then the captions-space investigation; then plan 004.

## 2026-10-12 — superseded status bullets (PRs #33-#36 merged)

Last updated: 2026-10-09
- Constitution v1.2.0 (Principle II: marked, uncited Background and user notes; default chat model GPT-6 Luna). Decisions 1-60 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- **Awaiting the user's evals and next real call** (2026-10-10): ask fixes merged (PR #32: answer chat-only facts from the conversation; notes statements always labelled, own paragraph, uncited; eval scoring fixed). Captions collapse reverted (#31). User runs `pnpm eval:ask` (+ `--set notes-agenda`) and re-checks 003 step 6b, 008 steps 3/4/7 with the walkthrough artifact in the maintainer's local handoff notes. Next: captions-space investigation (live DOM first), then plan 004.

## 2026-10-12 — superseded status bullets (PRs #39-#41 merged, constitution v1.2.1)

- Constitution v1.2.0 (Principle II: marked, uncited Background and user notes; default chat model GPT-6 Luna). Decisions 1-64 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- **In progress 2026-10-12:** merged today and awaiting the user's real-call check: panel page no longer scrolls (#33, 006 step 10), `Show Meet captions` setting (#34, decision 61: the captions band cannot be reclaimed), key terms added as a list (#36). 012 past transcripts: specified (#35), plan and tasks on branch `012-past-transcripts-plan`, then build (decisions 62, 64). 013 captions download: being specified on branch `013-captions-download` (decision 63). Still owed by the user from 2026-10-10: `pnpm eval:ask` (+ `--set notes-agenda`), 003 step 6b, 008 steps 3/4/7. Open: 002 "Others" on full sentences (seen again in a 5-person call), remainder of 004, Zoom (user: not now).

## 2026-10-12 — superseded status bullets (PRs #42-#45 merged)

- Constitution v1.2.1 (Principle II: marked, uncited Background and user notes; default chat model GPT-6 Luna). Decisions 1-76 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- **In progress 2026-10-12:** 012 past transcripts is merged (#39, #41: Transcripts screen, clean main view after a delete; decisions 62, 64) and awaits the user's real check (`specs/012-past-transcripts/manual-check.md`); follow-up on branch `012-row-title` (decision 76). 013 captions download is planned (#40, decisions 63, 65-75): core on branch `013-captions-core`, built to change nothing observable; the store wiring (WG-I) and panel work (WG-P) come after, and captions must not be kept on main before the Meet reminder ships with them (tasks T026 / T030). Also merged today and awaiting the user's real-call check: panel page no longer scrolls (#33), `Show Meet captions` (#34, decision 61), key terms as a list (#36). Still owed by the user from 2026-10-10: `pnpm eval:ask` (+ `--set notes-agenda`), 003 step 6b, 008 steps 3/4/7. Open: 002 "Others" on full sentences, two load-sensitive tests (`transcript-perf` rename within 100 ms, a `download-transcript` race), remainder of 004, Zoom (user: not now).

## 2026-10-12 — superseded status bullet (PR #46 merged)

- **Awaiting the user's real Meet call (2026-10-12):** everything below is merged, built (`pnpm build`, `pnpm build:spike`) and checked only by tests and CI. 012 past transcripts (#39, #41, #42; decisions 62, 64, 76): `specs/012-past-transcripts/manual-check.md`. 013 captions download (#40, #43, #45; decisions 63, 65-75): Meet's captions are now kept with every Meet call and the pre-Start reminder says so; `specs/013-captions-download/manual-check.md`, whose open risks O1-O7 in `research.md` need the live call (first: the production build shows the Meet reminder sentence). Also unchecked: panel page no longer scrolls (#33), `Show Meet captions` (#34, decision 61), key terms as a list (#36), 003 step 6b, 008 steps 3/4/7. Notes attribution (#44, decision 77): evals re-run, notes failures 0, citation precision 90.0% / 86.4% with the misses on coverage questions citing the opening line; the user's ruling on that is pending. Open: 002 "Others" on full sentences, the `transcript-perf` rename timing test under load, remainder of 004, Zoom (user: not now).

## 2026-10-13 — superseded status bullet (first real check of the 2026-10-12 build)

- **Awaiting the user's real Meet call (2026-10-12):** everything below is merged, built (`pnpm build`, `pnpm build:spike`) and checked only by tests and CI. 012 past transcripts (#39, #41, #42; decisions 62, 64, 76): `specs/012-past-transcripts/manual-check.md`. 013 captions download (#40, #43, #45; decisions 63, 65-75): Meet's captions are now kept with every Meet call and the pre-Start reminder says so; `specs/013-captions-download/manual-check.md`, whose open risks O1-O7 in `research.md` need the live call (first: the production build shows the Meet reminder sentence). Also unchecked: panel page no longer scrolls (#33), `Show Meet captions` (#34, decision 61), key terms as a list (#36), 003 step 6b, 008 steps 3/4/7. Evals after #44 and #46 (decisions 77, 78): notes failures 0; the 2026-10-12 answers re-scored give citation precision 96.0% / 95.5%, every measure at target. Not started: a correct citation is left unlinked when its sentence puts a label such as "Others" in quotation marks (quotation guard, `src/core/chat/citations.ts`; seen in the eval, not reproduced in the panel). Open: 002 "Others" on full sentences, the `transcript-perf` rename timing test under load, remainder of 004, Zoom (user: not now).

## 2026-10-13 — superseded status bullet (013 step 1 confirmed)

- **Real check 2026-10-13, partly done (results in each feature's `manual-check.md`):** passed in a real Meet call on the production build: key terms as a list (#36), Transcripts screen list, read, row download, delete confirmation, main-view delete to a clean main view (012), zip download with both files and the captions delete confirmation (013), non-Meet reminder unchanged, `Show Meet captions` toggled live (#34), no panel scrollbar (#33), 003 step 6b. Not yet confirmed: that the Meet reminder shows the captions sentence on the production build (013 step 1; captions were kept in that call). Not done: 008 steps 3/4/7, captions off/on, the running row, long-call and reload checks (013 O1-O7), interrupted meeting, narrow panel. New, cause not established: two questions the transcript could not answer hung with no answer and no error until the user stopped them; the OpenAI request has no time limit of ours and the panel shows nothing while waiting. Evals at target after #44 and #46 (decisions 77, 78). Not started: a correct citation left unlinked when its sentence quotes a label such as "Others" (`src/core/chat/citations.ts`). Open: 002 "Others" on full sentences, the `transcript-perf` rename timing test under load, remainder of 004, Zoom (user: not now).

## 2026-10-13 — superseded status bullet (PR #47 merged)

- **Real check 2026-10-13, partly done (results in each feature's `manual-check.md`):** passed in a real Meet call on the production build: key terms as a list (#36), Transcripts screen list, read, row download, delete confirmation, main-view delete to a clean main view (012), zip download with both files and the captions delete confirmation (013), non-Meet reminder unchanged, `Show Meet captions` toggled live (#34), no panel scrollbar (#33), 003 step 6b. Confirmed by the user: the Meet reminder shows the captions sentence on the production build (013 step 1); the reminder and the keeping are still decided separately by panel and background, with a hardening offered and not started. Not done: 008 steps 3/4/7, captions off/on, the running row, long-call and reload checks (013 O1-O7), interrupted meeting, narrow panel. New, cause not established: two questions the transcript could not answer hung with no answer and no error until the user stopped them; the OpenAI request has no time limit of ours and the panel shows nothing while waiting. Evals at target after #44 and #46 (decisions 77, 78). Not started: a correct citation left unlinked when its sentence quotes a label such as "Others" (`src/core/chat/citations.ts`). Open: 002 "Others" on full sentences, the `transcript-perf` rename timing test under load, remainder of 004, Zoom (user: not now).

## 2026-10-13 — superseded status bullet (PR #48 merged)

- **Real check 2026-10-13, partly done (results in each feature's `manual-check.md`):** passed in a real Meet call on the production build: key terms as a list (#36), Transcripts screen list, read, row download, delete confirmation, main-view delete to a clean main view (012), zip download with both files and the captions delete confirmation (013), non-Meet reminder unchanged, `Show Meet captions` toggled live (#34), no panel scrollbar (#33), 003 step 6b. The reminder is one text on every platform again (#47, decision 79 supersedes 71; built, not yet seen by the user); captions are kept on Meet with the reminder on or off. Not done: 008 steps 3/4/7, captions off/on, the running row, long-call and reload checks (013 O1-O7), interrupted meeting, narrow panel. New, cause not established: two questions the transcript could not answer hung with no answer and no error until the user stopped them; the OpenAI request has no time limit of ours and the panel shows nothing while waiting. Evals at target after #44 and #46 (decisions 77, 78). Not started: a correct citation left unlinked when its sentence quotes a label such as "Others" (`src/core/chat/citations.ts`). Open: 002 "Others" on full sentences, the `transcript-perf` rename timing test under load, remainder of 004, Zoom (user: not now).

## 2026-10-13 — superseded status bullet (licence added)

- No `LICENSE` — this repo is **private**.

## 2026-10-13 — superseded lines (pre-publication cleanup)

- **User-facing copy embodies, never announces.** Every string a user sees (panel, settings, status, errors, pages) follows `.claude/skills/embody-dont-announce`: no lines that name the frame, narrate the screen, explain the interface's own logic, duplicate a visible element, reassure, or name the mechanism. Instead: titles, instructions, error/empty states that say what happened and what to do, and required disclosures (consent, retention, AI) stay. Adopted 2026-10-08 (design decision 33).
- Constitution v1.2.1 (Principle II: marked, uncited Background and user notes; default chat model GPT-6 Luna). Decisions 1-84 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- Process skills vendored in `.claude/skills/`: `context-preservation`, `salience`, `grilling`, `grill-me`, `anti-ai-writing` (copied 2026-10-07 from the user's claude.ai skill sync) and `embody-dont-announce` (user-supplied 2026-10-08), alongside the `speckit-*` skills. To refresh, re-copy from the source rather than editing in place.
- Licence: MIT (`LICENSE`, decision 81). The repo is still **private** on GitHub; the user asked for it to be made public and that step waits on their answer about what to clean first.

## 2026-10-13 — superseded status bullet (pause)

- Licence: MIT (`LICENSE`, decision 81). **Public release in preparation (decisions 82-84):** employer and personal references removed from tracked files (#49; leftovers on branch `chore-prepublish-leftovers`); then, on the user's go, this repo is renamed `live-assist-archive` and a fresh public `live-assist` is created from the cleaned files as one commit. Until then the repo is private.

## 2026-10-13 — superseded CLAUDE.md passages (rules made self-contained, decision 86)

- **User-facing copy embodies, never announces.** Every string a user sees (panel, settings, status, errors, pages) follows the `embody-dont-announce` skill: no lines that name the frame, narrate the screen, explain the interface's own logic, duplicate a visible element, reassure, or name the mechanism. Instead: titles, instructions, error/empty states that say what happened and what to do, and required disclosures (consent, retention, AI) stay. Adopted 2026-10-08 (design decision 33).
6. **Context & delegation.** Use the `context-preservation` skill to keep long sessions clean, and dispatch a **worktree** subagent per phase whenever a phase is self-contained enough to run independently (its own branch, its own test run). Typical split: one worktree per Spec Kit phase, or per independent task group in `tasks.md`. Skip it when the phase is a few lines, or when phases touch the same files and would conflict on merge.
- `.claude/skills/` tracks only the `speckit-*` skills. The process skills this file names (`context-preservation`, `embody-dont-announce`) and the handoff notes are the maintainer's own and are not in the repo (gitignored; decision 82).

## 2026-10-13 — superseded status bullets (release 1.0.0, decision 87)

Last updated: 2026-10-13
- Constitution v1.2.2 (Principle II: marked, uncited Background and user notes; default chat model GPT-6 Luna). Decisions 1-84 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- 001, 002, 006: done — signed off by the user in a real Meet call 2026-10-09 (`specs/00{1,2,6}-*/manual-check.md`). Follow-ups: a ≥3-person alignment trace for 002 (thin 5.5 s margin); 002 "Others" rate (8 of 62 lines in a solo call 2026-10-09, incl. full sentences — dig in with a spike-build trace, deferred by the user); 005 minutes estimate needs a measured credit rate.
- 005 account usage: merged (PR #14); minutes estimate waits on a measured credit rate.
- Red-team review 2026-10-08: all findings fixed and merged (PR #17), incl. fail-closed mute on Meet (decision 34) and no rename-everywhere for "Others" (decision 35).
- **Real check 2026-10-13, partly done (results in each feature's `manual-check.md`):** passed in a real Meet call on the production build: key terms as a list (#36), Transcripts screen list, read, row download, delete confirmation, main-view delete to a clean main view (012), zip download with both files and the captions delete confirmation (013), non-Meet reminder unchanged, `Show Meet captions` toggled live (#34), no panel scrollbar (#33), 003 step 6b. The reminder is one text on every platform again (#47, decision 79 supersedes 71; built, not yet seen by the user); captions are kept on Meet with the reminder on or off. Not done: 008 steps 3/4/7, captions off/on, the running row, long-call and reload checks (013 O1-O7), interrupted meeting, narrow panel. Two questions hung with no answer and no error in that call (cause not established); since #48 (decision 80) Ask shows a waiting mark, gives up after 45 s without a first word, and logs time to first text (built, not yet seen by the user). Evals at target after #44 and #46 (decisions 77, 78). Not started: a correct citation left unlinked when its sentence quotes a label such as "Others" (`src/core/chat/citations.ts`). Open: 002 "Others" on full sentences, the `transcript-perf` rename timing test under load, remainder of 004, Zoom (user: not now).
- Full history: `CHANGELOG.md`.
- Licence: MIT (`LICENSE`, decision 81). **Paused 2026-10-13, public release in preparation (decisions 82-84):** employer and personal references removed from tracked files (#49). Resume on branch `chore-prepublish-leftovers` (pushed at `f47948a`, no PR, no worktree): generic John-and-Jane names for fixture people are done there (lint, typecheck, unit tests pass; build and e2e not run); still to do on it: a changelog line, `THIRD_PARTY_NOTICES.md` for Spec Kit, a last sweep for remaining person names, then gates, PR, merge. After that: final scan, the user's explicit go, rename this repo to `live-assist-archive`, and create a fresh public `live-assist` from the cleaned files as one commit. Until then the repo is private. The maintainer's local handoff notes hold the detail.
- `.claude/skills/` holds only the Spec Kit `speckit-*` skills (see `THIRD_PARTY_NOTICES.md`). The rules in this file are complete without any other skill; the maintainer's personal skills and handoff notes are not in the repo (gitignored; decisions 82, 86).
- Release 1.0.0, the first public release (decision 87; semantic versioning from here). What it does for a user: `CHANGELOG.md`. Constitution v1.2.2; decisions 1-87 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- Open: 002 lines left "Others" on full sentences, and a trace of a call with three or more people; the 005 minutes estimate (needs a measured credit rate); a correct citation left unlinked when its sentence quotes a label such as "Others" (`src/core/chat/citations.ts`); the `transcript-perf` rename timing test is flaky under load; the rest of 004 (inbox export, reopening a meeting); Zoom and Teams speaker names.
- Release 1.0.0, the first public release (decision 87; semantic versioning from here), published 2026-10-14 as the public repo `mishandledservitor/live-assist` with one root commit. What it does for a user: `CHANGELOG.md`. Constitution v1.2.2; decisions 1-87 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- Release 1.0.0, the first public release (decision 87; semantic versioning from here), published 2026-10-14 as the public repo `mishandledservitor/live-assist` with one root commit. What it does for a user: `CHANGELOG.md`. Constitution v1.2.2; decisions 1-88 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- Release 1.0.0, the first public release (decision 87; semantic versioning from here), published 2026-10-14 as the public repo `mishandledservitor/live-assist` with one root commit. What it does for a user: `CHANGELOG.md`. Constitution v1.2.2; decisions 1-89 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- Built: 001 capture and live transcript, 002 Meet speaker names, 003 Ask the transcript, 005 account line, 006 panel layout, 007 download, 008 meeting notes, 012 past transcripts, 013 Meet captions download. 001, 002 and 006 were signed off in a real Meet call on 2026-10-09; most of 012 and 013 passed one on 2026-10-13. Real-call steps still to run are in each feature's `manual-check.md` (008 steps 3/4/7; 013 O1-O7; interrupted meeting; narrow panel).
- Built, not yet seen in a real call: one reminder text on every platform (decision 79); Ask's waiting mark and 45 s limit for a first word (decision 80).
- Release 1.0.0, the first public release (decision 87; semantic versioning from here), published 2026-10-14 as the public repo `mishandledservitor/live-assist` with one root commit. What it does for a user: `CHANGELOG.md`. Constitution v1.2.2; decisions 1-90 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- Release 1.0.0, the first public release (decision 87; semantic versioning from here), published 2026-10-14 as the public repo `mishandledservitor/live-assist` with one root commit. What it does for a user: `CHANGELOG.md`. Constitution v1.2.2; decisions 1-91 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- Built, not yet seen in a real call: Ask's 45 s limit for a first word (decision 80). The one reminder text (decision 79) and Ask's waiting mark passed on 2026-10-14.
- Built, not yet seen in a real call: 014 `Close transcript` and the clean main view at the next panel opening (decisions 91, 92; first check whether switching tabs counts as an opening, `specs/014-close-transcript/manual-check.md` step 6); Ask's 45 s limit for a first word (decision 80). The one reminder text (decision 79) and Ask's waiting mark passed on 2026-10-14.
- Built, not yet seen in a real call: 014 `Close transcript` and the clean main view at the next panel opening (decisions 91, 92; in the first real call Close did nothing after a Meet hang-up, fixed 2026-10-14; check `specs/014-close-transcript/manual-check.md` steps 6 and 9: switching tabs, and Close within 30 s of a hang-up). CI on main has been red since 014 merged: three e2e tests, a test helper suspected, fix in progress; Ask's 45 s limit for a first word (decision 80). The one reminder text (decision 79) and Ask's waiting mark passed on 2026-10-14.
