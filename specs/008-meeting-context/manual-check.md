# Manual check record: 008 Meeting context

Real-use checks that automated tests cannot cover (constitution III). Not yet run: the steps are for the user, in a real Google Meet call with the chat provider key already set up (003). Automated coverage already in place: `tests/unit/core/chat/notes*.test.ts`, `context-notes.test.ts`, `prompt-notes.test.ts` (decoding, blocks, request, prompt), `tests/integration/storage/context-repo.test.ts`, `tests/integration/background/{context-commands,chat-session-notes,meeting-control-notes}.test.ts`, `tests/integration/privacy/notes-leak.test.ts`, the panel tests in `tests/unit/sidepanel/`, and `tests/e2e/notes.spec.ts`.

**Build** (from the repo root):

```sh
pnpm install
pnpm build
```

Reload `.output/chrome-mv3` in `chrome://extensions`. Have an agenda as a `.md` file, and a long text file of about 100,000 characters.

## Steps

- [ ] 1. Before Start: `Add notes` beside the language picker → `Choose file…` → the agenda. Expect: the chip with the file name beside Start. Repeat with the ~100,000-character file: the chip shows within 1 s (SC-001). Put the agenda back.
- [ ] 2. Start on a Meet call. Expect: the chip moves to the line under the question box; nothing is left beside Start.
- [ ] 3. After a few minutes ask "Which agenda items haven't we covered?". Expect: what was discussed is cited; the rest is in a passage starting "From your notes:", or in sentences that say it comes from your notes ("Your notes also list…", decision 77), with no `[mm:ss]` (SC-002).
- [ ] 4. Ask whether something only in the notes was said (e.g. a budget figure). Expect: "That isn't in the transcript so far.", at most followed by what the notes say, marked as from the notes (the label, or a sentence naming your notes); no citation on it (SC-003).
- [ ] 5. If the notes list attendees, ask who said an "Others" line. Expect: no name from the notes (SC-004).
- [ ] 6. Mid-call, `Paste text` with new notes and save. Ask. Expect: the old notes are not quoted any more; the service-worker log line `chat answer` shows `notes: 'replaced'` and contains no notes text.
- [ ] 7. Ask in Greek. Expect: the notes label is in Greek.
- [ ] 8. Remove the notes (`×`) and ask. Expect: no notes passage; the log shows `notes: 'removed'`.
- [ ] 9. Stop, close and reopen the panel, ask. Expect: answered over the full transcript (with the notes, if any are attached). `Delete transcript`: the chip goes too.
- [ ] 10. SC-007: start a second meeting without notes, ask once, then add notes and ask again within 5 minutes. Expect: the log shows `notes: 'added'` and `cacheRead` greater than 0.
- [ ] 11. Answer-quality run (key in the shell only, see `spikes/README.md`): `pnpm eval:ask --set notes-agenda`, then paste the printed table below.

## Results

Real Meet call 2026-10-10 with `agenda.md` (attendees, launch date, glossary DSM-5/CBT/intake assessment, hiring, budget).

| Step | Result (pass / fail / note) |
|---|---|
| 1 | |
| 2 | |
| 3 | Fail, 2026-10-10: "Which agenda items haven't we covered?" answered "…It also hasn't covered the glossary terms beyond DSM-5, or the next-year budget. [01:08] [02:09]": a notes-derived sentence, unlabelled and cited. Fixed on `ask-fixes-2026-10-10` (T063–T066); re-check. |
| 4 | Pass with a change asked for, 2026-10-10: "Did anyone mention the budget?" said no one mentions it, then "From your notes: The proposed budget is €40,000…", uncited. The user asked for the label to start its own paragraph, like "Background:" (FR-009, FR-009a); re-check. |
| 5 | |
| 6 | Pass, 2026-10-10: after pasting "Only agenda item: picking a venue for the offsite.", "What's on the agenda?" cited the transcript part and gave a separate "From your notes:" paragraph with only the venue. Log line not checked. |
| 7 | Fail, 2026-10-10: "Ποια θέματα δεν έχουμε καλύψει ακόμα;" gave a notes-derived sentence with citations and no Greek notes label. Fixed with step 3; re-check. |
| 8 | |
| 9 | |
| 10 | |

### `pnpm eval:ask --set notes-agenda` summary

Run by the user 2026-10-12 on main after the Ask fixes of 2026-10-10 (`pnpm eval:ask --provider openai --model gpt-6-luna --set notes-agenda`, 14 questions). Before those fixes (2026-10-10): precision 40%, 3 notes failures.

| Measure | Result | Target | Met |
|---|---|---|---|
| Citation precision (SC-002) | 78.9% | ≥ 95% | no |
| Absent detected (SC-003) | 100.0% | ≥ 95% | yes |
| Invented answers to absent questions (SC-003) | 0 | 0 | yes |
| Answer in the question language (SC-005) | 100.0% | 100% | yes |
| "Others" lines given a name | 0 | 0 | yes |
| Term questions without a cited mention and uncited background (FR-007) | 0 | 0 | yes |
| Facts from the chat itself cited or not given (SC-002) | 0 | 0 | yes |
| Notes passages unlabelled, cited or presented as said (SC-002, SC-003) | 4 | 0 | no |

The four notes failures: `budget-figure` and `budget-figure-el` (the notes' figure given in a sentence without the label); `coverage` (names two people from the notes, Emma and Mike, in an unlabelled bullet, with two citations that do not support it); `coverage-el` (label written half in English, "From τις σημειώσεις σου:", and a notes item in the paragraph before it). The citations scored imprecise: `budget-said` and `budget-said-el` cite [02:00] for "approved, no amount given" (1 each), `coverage` 3 of 9, `coverage-el` 1 of 5. Raw answers: `spikes/data/ask-eval/2026-10-12T12-50-43-615Z-openai-gpt-6-luna.json` (gitignored).

Re-run by the user 2026-10-12 on main after the decision 77 change ( 17 questions): citation precision 86.4% (target ≥ 95%, not met), notes statements unmarked, cited or presented as said 0 (target met), every other measure at target. The precision misses are `[00:03]` once each in `coverage-el` and `agenda-left`. Raw answers: `spikes/data/ask-eval/2026-10-12T13-45-24-898Z-openai-gpt-6-luna.json` (gitignored).

### After the fixes of 2026-10-12 (branch `008-notes-attribution`, tasks T070–T078): to re-run

What changed. Scoring (decision 77): a notes statement counts as marked when it is in a `From your notes:` passage or when its sentence names your notes as its source ("your notes" / "σημειώσεις σου, σας" as the subject of a verb of stating, or after "in / from / according to", "στις / από τις / σύμφωνα με τις"); the row is now "Notes statements unmarked, cited or presented as said". The same two raw files rescored with the new rule give 1 notes failure in the full run (`coverage-el`) and 2 in the notes run (`coverage`, `coverage-el`); `budget-figure` and `budget-figure-el` pass. Citation precision is scored exactly as before (95.5% and 78.9% on those files). Model instructions: two accepted ways to mark notes material, the Greek label written out, "a sentence that mentions something only in the notes is notes material even when it is about the meeting", "nothing in the transcript shows that something was not said: cite a line only for what it does say", no unasked people or details from the notes, no name from the notes beside an "Others" line. Panel: "From τις σημειώσεις σου:" is shown as "Από τις σημειώσεις σου:", on its own paragraph, without citations inside. The set has three new questions (`agenda-left`, `attendees`, `attendees-el`), so the notes run is 17 questions and the full run 45.

Commands, from the repo root on a checkout that has this branch (the key in the shell only, never in a file):

```sh
export OPENAI_API_KEY=…
pnpm install
pnpm eval:ask --provider openai --model gpt-6-luna
pnpm eval:ask --provider openai --model gpt-6-luna --set notes-agenda
```

Paste the first table into `specs/003-ask-the-transcript/manual-check.md` and the second below. Expect, not yet measured: 0 in the notes row of both runs. Then re-check steps 3, 4 and 7 in a real call.

| Measure | Result | Target | Met |
|---|---|---|---|
| | | | |

### Citation precision in the notes run: for the user to decide (not changed)

The 78.9% above is 15 precise of 19 citations, and all four misses are in the two coverage answers: `coverage` cited [00:03] ("Morning everyone, let's start with pricing.") and the two "Others" lines [01:42] [15:05] under the bullet about Emma and Mike; `coverage-el` cited [00:03]. `budget-said` and `budget-said-el` did not lower it: `notes-vs-said` rows are left out of the precision ratio (as `absent` and `notes-only` rows are), although each row in the raw file shows 0 precise of 1 because the question lists [02:00] under `related`, not `supports`. Decision 60 is about a different measure: a partial answer citing the surrounding line is not an invented answer and passes the notes row, and it does. So there is no contradiction with decision 60, and the sentence above that lists `budget-said` among the citations "scored imprecise" is true of the rows but not of the percentage.

Options (option 2 taken 2026-10-12, design decision 78; the others not taken):

1. Leave the scoring as it is. The [01:42] [15:05] citations should go with the new instructions; [00:03] may stay, and one unlisted citation per coverage answer keeps the notes run under 95% (about 6 of 7 per coverage question).
2. Add `00:03` to `supports` of the coverage questions, if the opening line counts as support for "pricing was discussed". It names the topic; the decision is in [00:12] and [00:31]. **Taken 2026-10-12 (design decision 78):** `00:03` is now in `supports` of `coverage`, `coverage-el` and `agenda-left` in `tests/fixtures/chat/eval/notes-agenda.json`; no other line of `standup-en` opens a covered topic without its substance, so nothing else was added, and the scorer, the model instructions and every other question are unchanged. The user's two latest raw files rescored with it (read-only, nothing re-asked): the full run `2026-10-12T13-44-55-726Z` goes from 45 of 50 (90.0%) to 48 of 50 (96.0%, target met), the notes run `2026-10-12T13-45-24-898Z` from 19 of 22 (86.4%) to 21 of 22 (95.5%, target met). What still misses: in the full run, `coverage-el` wrote `[00:37]` for `[02:37]` and repeated it in a footnote correcting itself (2 citations to a time with no line); in the notes run, `spreadsheet` cited the right line `[01:42]` after a sentence with “Others” in quotation marks, which the quotation guard reads as a quotation the cited line does not contain, so the citation is not linked (this third miss of the 19 of 22 was not listed above).
3. Count a cited `related` line as precise and bring `notes-vs-said` (and `absent`) rows into the ratio, so decision 60's accepted citation also counts for precision. On the notes run of 2026-10-12 that would have given 17 of 21 (81.0%).
4. Keep those rows out of the ratio but write their per-row precise count from `related`, so the raw file stops showing 0 of 1 for an accepted citation.

Real call 2026-10-13: steps 3, 4 and 7 not done (walkthrough steps B7 to B9).
