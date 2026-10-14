# live-assist

## What this repo is

A live meeting assistant: it transcribes a Google Meet, Zoom or Microsoft Teams meeting in real time via the ElevenLabs realtime speech-to-text API, uses context from the browser to help attribute speech to speakers, and lets the user ask questions of the transcript so far in a chat panel — to catch up after drifting off, or to get something explained. Requirements and design live in `.specify/memory/constitution.md`, `.specify/memory/design-decisions.md` and `specs/`.

## Conventions

- **User-facing copy embodies, never announces** (the copy rule; specs call it "embody-dont-announce"). Every string a user sees (panel, settings, status, errors, pages) is checked against these tells and a line that matches one is cut unless removing it loses something the reader needs:
  - it names the frame or stance of the screen instead of taking it ("Built around how you work");
  - it narrates the screen or the reader's path ("Below you'll find…", "In this section…");
  - it explains the interface's own logic ("We put this first because…");
  - it duplicates something already visible on the same screen;
  - it reassures or encourages ("You're all set!") — a real fact inside it is kept as a plain statement ("Changes save automatically");
  - it names the mechanism ("model", "prompt", "algorithm") where the user only cares what happens.
  Always kept: titles and one-line descriptions of what something does, instructions, error and empty states that say what happened and what to do, accessible equivalents (labels for colour or icons), and required disclosures (consent, retention, AI). Deleted lines are not replaced by new explanatory text. Every new string is recorded in `specs/006-panel-redesign/copy-review.md`, and a scanner test enforces it. Adopted 2026-10-08 (design decisions 33, 86).

## Standing rules

Binding on any agent working in this repo. These are process rules, not project conventions. **This file is the only source of truth for them.** Delete one only deliberately, never because it looks like unused scaffolding.

1. **No agent memory.** Never rely on assistant-side memory, per-project memory files, or recall from a previous session. Everything durable lives in the repo: this file, `CHANGELOG.md`, `.specify/memory/constitution.md` and `specs/`. If something is worth remembering, write it here in the same turn you learn it. If a memory and the repo disagree, the repo wins.
2. **Spec Kit governs all development.** Every feature flows through `/speckit-specify` → (`/speckit-clarify` as needed) → `/speckit-plan` → `/speckit-tasks` → (`/speckit-analyze` / `/speckit-checklist` as needed) → `/speckit-implement`. No production code is written outside a spec'd, planned, tasked feature. The constitution outranks this file on anything about the code itself; these standing rules govern process and agent behaviour.
3. **All development happens on a worktree.** Never write code, tests, specs, or plans on a checkout of the main branch. Create a worktree with its own branch and work there. Only *repo management* belongs outside a worktree: opening and merging PRs, reviewing, tagging, releases, branch cleanup, and reading. If you notice you are about to edit a file on main, stop and make a worktree first.
4. **Commit every round.** Each round — one user request plus its completion — ends with a git commit of whatever that round changed, without waiting to be asked. This includes Spec Kit artifacts (`spec.md`, `plan.md`, `tasks.md`). Stage specific paths, never `-A`; review what's staged first; new commits only (no `--amend` unless asked); no force-push. A pure Q&A round that changes no files has nothing to commit.
5. **Refresh `Current status` before each commit.** Update the "Current status" section below — including its `Last updated:` date — to match reality as part of the same commit, so the summary can never drift from the repo.
6. **Context & delegation.** Keep long sessions clean: hand work that would produce large exploratory output (broad searches, file dumps, log reads) or that can run on its own to a subagent, and keep only its conclusion in the main conversation. Dispatch a **worktree** subagent per phase whenever a phase is self-contained enough to run independently (its own branch, its own test run). Typical split: one worktree per Spec Kit phase, or per independent task group in `tasks.md`. Skip it when the phase is a few lines, or when phases touch the same files and would conflict on merge.
7. **Don't narrate no-ops.** A check that came back empty doesn't need a line of output. Report what you did and what the user has to decide. In particular, with no `.specify/extensions.yml` every `/speckit-*` hook check is a guaranteed no-op — skip it silently.
8. **CodeGraph is mandatory.** [CodeGraph](https://github.com/colbymchenry/codegraph) indexes the codebase into a knowledge graph so agents get call paths and impact analysis in one tool call. Once there is code to index: install the CLI if missing (`npm i -g @colbymchenry/codegraph`), run `codegraph install` once to wire the agent's MCP config, then `codegraph init` in the repo root. Use `codegraph sync` if it needs a manual nudge. Once a `.codegraph/` index exists, use `codegraph_explore` for architecture, call-flow, or impact-analysis questions instead of manual exploration.
9. **True TDD — red, green, refactor.** No production code without a failing test first. For every unit of work: write a test that fails for the right reason (red), write the minimum code to make it pass (green), then clean up with the tests still green (refactor). This happens inside `/speckit-implement`: each task's test is written and shown failing before that task's implementation is written.
10. **Spec Kit and TDD apply whatever door the work came in by** — a queued task, an email, a chat message, or the user typing at a session directly. Act on what is genuinely urgent, then spec and test the build rather than implementing straight out of an inbox. The only exception is a small, reversible, non-shipping change — a typo, a comment, a note. If a user can see the behaviour change, it is spec'd and tested.
11. **Never hard-wrap text meant for a human to read.** No fixed-column line breaks in UI copy, generated reports, chat messages, docs prose, or commit-message bodies — one paragraph is one line, and the device does the wrapping. This does not touch code: source lines, `<pre>` blocks, ASCII tables, and fixed-width terminal output stay as they are.
12. **Never touch a `.env` file without asking the user.** Not to untrack it, delete it, move it, or rewrite it. Report what you found, say what reads the file, and ask. Reading one to classify a key is allowed, changing one is not, and no value ever appears in a report, a commit message, or a prompt. Before removing any file to satisfy a guard, ask what reads it — some builds (e.g. Vite) inline values from a tracked `.env` at build time, and removing it ships a broken build.

## Commands

Node per `.nvmrc` (24 LTS) and pnpm per `packageManager` (`corepack enable`).

```sh
pnpm install                 # also runs `wxt prepare` (generates .wxt/ types)
pnpm dev                     # WXT dev server with a live-reloading Chrome
pnpm build                   # production extension → .output/chrome-mv3 (load unpacked)
pnpm build:e2e               # e2e mode → .output/chrome-mv3-e2e (used by Playwright)
pnpm build:spike             # spike mode → .output/chrome-mv3-spike (adds the dev-only spike recorder)
pnpm lint                    # ESLint (type-aware) + Prettier check; `pnpm format` to fix
pnpm typecheck               # wxt prepare && tsc --noEmit
pnpm test                    # Vitest projects: unit (node), dom (jsdom, *.test.tsx), integration (fake-indexeddb)
pnpm exec vitest run <path>  # one file
pnpm test:e2e                # Playwright against .output/chrome-mv3-e2e (run build:e2e first)
pnpm spike:echo [dir]        # Spike A scorer (needs ELEVENLABS_API_KEY in the shell, never a file); see spikes/README.md
pnpm spike:language [dir]    # Spike B scorer (same key rule); see spikes/README.md
codegraph sync               # refresh the local CodeGraph index (.codegraph/, gitignored)
```

## Structure

- `src/entrypoints/` — WXT entrypoints: `background/` (service worker: start/stop orchestration, token minting for the offscreen document), `sidepanel/` (React UI), `offscreen/` (runs the meeting: audio, sockets, DB writes, live port; it has only `chrome.runtime`, no `chrome.storage`), `mic-permission/`. Only place `chrome.*` is wired up.
- `src/core/` — platform-free logic (transcript model and segment builder, `MeetingRuntime`, transcription provider contract, status, settings, platform adapter contract, message protocol). ESLint forbids `chrome`, DOM, WebSocket, `fetch`, `idb` and outer-layer imports here.
- `src/providers/` — transcription provider (ElevenLabs realtime + fixture fake) and credential source; the only code that knows vendor wire protocols.
- `src/audio/` — PCM conversion, AudioWorklet, capture and playback.
- `src/storage/` — IndexedDB (`idb`) meeting repo and `chrome.storage.local` settings store.
- `spikes/` — user-run Spike A/B harnesses (Node, via `tsx`); `spikes/data/` is gitignored and holds real audio and raw results.
- `tests/unit|integration|contract|e2e` — Vitest and Playwright; `tests/fixtures/` holds ElevenLabs JSONL sequences and synthetic audio; `tests/support/` holds fakes.
- `specs/NNN-*/` — Spec Kit feature folders; manual-check records live there.

## CI/CD

- `.github/workflows/ci.yml` (`CI`) — on every PR and push to main: install, lint, typecheck, Vitest, production + e2e builds, Playwright under xvfb. Uses no secrets.

## Current status

Last updated: 2026-10-14
- Release 1.0.0, the first public release (decision 87; semantic versioning from here), published 2026-10-14 as the public repo `mishandledservitor/live-assist` with one root commit. What it does for a user: `CHANGELOG.md`. Constitution v1.2.2; decisions 1-92 in `.specify/memory/design-decisions.md`; features in `ROADMAP.md`; red-team traps in `.claude/red-team-traps.md`.
- Built: 001 capture and live transcript, 002 Meet speaker names, 003 Ask the transcript, 005 account line, 006 panel layout, 007 download, 008 meeting notes, 012 past transcripts, 013 Meet captions download. 001, 002 and 006 were signed off in a real Meet call on 2026-10-09; most of 012 and 013 passed one on 2026-10-13; 008's notes answers (steps 3, 4, 7), the running row and narrow panel (012) and a 30-minute captions check (013 step 7) passed on 2026-10-14. Real-call steps still to run are in each feature's `manual-check.md` (012 interrupted meeting and the next Start after a clean main view; 013 O1-O3, O7 and the captions file around a gap).
- Built, not yet seen in a real call: 014 `Close transcript` and the clean main view at the next panel opening (decisions 91, 92; in the first real call Close did nothing after a Meet hang-up, fixed 2026-10-14; check `specs/014-close-transcript/manual-check.md` steps 6 and 9: switching tabs, and Close within 30 s of a hang-up).; Ask's 45 s limit for a first word (decision 80). The one reminder text (decision 79) and Ask's waiting mark passed on 2026-10-14.
- Open: 002 lines left "Others" on full sentences, and a trace of a call with three or more people; the 005 minutes estimate (needs a measured credit rate); a correct citation left unlinked when its sentence quotes a label such as "Others" (`src/core/chat/citations.ts`); the rest of 004 (inbox export, reopening a meeting); Zoom and Teams speaker names.
- Superseded status paragraphs: `.specify/memory/status-log.md` (record, not needed to work).
- Release notes: `CHANGELOG.md`. Development log up to 1.0.0: `.specify/memory/development-log.md`.
- If this section contradicts what you see in the repo, trust the repo and flag the mismatch.
- `.claude/skills/` holds only the Spec Kit `speckit-*` skills (see `THIRD_PARTY_NOTICES.md`). The rules in this file are complete without any other skill; personal skills and local notes are gitignored (decisions 82, 86).
- `.claude/settings.local.json` is gitignored — commit it only to deliberately share config across machines.
- Licence: MIT (`LICENSE`, decision 81). Third-party files: `THIRD_PARTY_NOTICES.md`. The history before 1.0.0 is not public: pull-request numbers, commit hashes and branch names in the logs and specs belong to it.

<!-- ─── Add the sections below only when each is REAL. An empty version of any of these is ceremony that rots — leave it out until true. ───

## Data model / API   schema or route list, once there is one
## Branch strategy    once there's a release process or more than one contributor
## Deep reference     Need | File routing table, once there are enough docs to route to
## Important notes    recurring gotchas — a lessons-learned LOG (add an entry once a mistake has actually recurred)
-->
