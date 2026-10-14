# Manual check record: 003 Ask the transcript

Real-use checks that automated tests cannot cover (constitution III). Not yet run: the steps are for the user, in a real Google Meet call, with a real OpenAI key and the default model GPT-6 Luna (design decision 40). Automated coverage already in place: `tests/unit/core/chat/` (context, prompt, citations), `tests/unit/providers/chat/` (contract suite on recorded fixtures), `tests/integration/background/chat-session.test.ts` (service-worker flow), `tests/unit/sidepanel/` (Ask area), `tests/e2e/ask.spec.ts` (ask, citation, Stop, panel closed mid-answer).

**Build** (from the repo root):

```sh
pnpm install
pnpm build
```

Load `.output/chrome-mv3` unpacked in `chrome://extensions` (or reload the loaded copy; Chrome shows the new access to api.anthropic.com and api.openai.com). Have an OpenAI API key ready; turn off any OpenAI data sharing you do not want.

## Steps

- [ ] 1. Setup (fresh profile, or the chat-only step on an existing install): `Answers from` shows OpenAI selected; paste the OpenAI key; `Check keys and save`. Expect: the key is shown only as `••••` and its last four characters; Settings → Questions shows GPT-6 Luna selected; the question box under the transcript shows `GPT-6 Luna` and no notice.
- [ ] 2. Start on a Meet call and talk for a few minutes. Ask "What have we covered so far?". Expect: the first words within 3 s (SC-001); the answer streams into the strip above the box; the transcript keeps moving meanwhile; the finished answer shows `GPT-6 Luna` under it.
- [ ] 3. Click a `[mm:ss]` citation in the answer while transcription runs. Expect: the transcript scrolls to that line within half a second and highlights it for about 2 s (SC-004); the answer stays visible; new lines keep arriving (the transcript stops following until you scroll back down).
- [ ] 4. Ask something the meeting has not covered (e.g. "What is the budget for next year?"). Expect: a plain "That isn't in the transcript so far." (or similar), no invented figure, no citation (SC-003).
- [ ] 5. Ask "Who said …?" about a line labelled `Others`. Expect: the answer does not give it a name; it says someone not identified said it.
- [ ] 6. Mention a term without explaining it (e.g. "Let's add X to the glossary"), then ask "What does X mean?" twice. Expect both times: the mention is cited; the meaning is in a separate "Background:" sentence without citations; never only "That isn't in the transcript so far." (FR-007, research R7 rule 7).
- [ ] 6b. Ask the assistant to say a made-up word exactly (e.g. `Say exactly "QZVRT" in chat`), then ask "What was the word I asked you to say?". Expect: the answer gives the word with no citation; if a time is shown after a quotation the cited line does not contain, it is plain text, not a link (SC-002, R7 rule 5 and quotation guard).
- [ ] 6a. Ask in Greek about the (English) meeting. Expect: the answer is in Greek and its citations go to the right lines (SC-005).
- [ ] 7. Ask a follow-up ("And who disagreed?"). Expect: it is answered in the context of the earlier exchange; every follow-up is sent with the whole conversation so far, however long ago the earlier questions were. Cache check: ask the follow-up within 5 minutes of the previous question (the provider keeps its prompt cache for about 5 minutes; this does not limit what the assistant remembers), then in the service worker console (`chrome://extensions` → live-assist → service worker) the `chat answer` log line shows `cacheRead` greater than 0 (research R6) and contains no question, answer, transcript text or key.
- [ ] 8. Ask a question and press `Stop` mid-answer. Expect: the partial answer stays, marked `Stopped`; the next question works.
- [ ] 9. Ask a question and close the side panel mid-answer; reopen it. Expect: the partial answer shows `Stopped`.
- [ ] 10. Type a second question while an answer streams and press Enter. Expect: it shows with `Waiting…` and is sent when the first answer ends.
- [ ] 10a. Ask any question and watch its turn before the first word (design decision 80). Expect: three small dots where the answer will be until the first word replaces them, with nothing else on the panel moving; `Stop` is offered meanwhile. If a question ever gets no answer: after 45 seconds the turn reads `No answer came back. Ask again.`, the question is back in the box, and pressing `Ask` sends it again. Then open the service worker console (`chrome://extensions` → live-assist → service worker) and copy the last `chat answer` line here: `end`, `firstEventMs`, `firstTextMs` and `totalMs` tell whether the provider answered the request at all (it holds no question, answer, transcript text or key). This cannot be forced in a real call; to see a failed question on purpose, turn the network off right after pressing `Ask` (that may read `Couldn't reach OpenAI.` instead, which is also correct).
- [ ] 11. Stop the meeting and ask about it. Expect: answered over the full transcript. Then `Delete transcript`. Expect: the questions and answers are gone too (reopen the panel to confirm).
- [ ] 12. Switch to Claude in Settings with a Claude key and ask. Expect: the answer shows `Claude Sonnet 5.5`.
- [ ] 13. Fresh-profile timing: install → setup with both keys → first answered question in under 2 minutes (SC-006).
- [ ] 14. Answer-quality run (needs the key in the shell only, see `spikes/README.md`): `pnpm eval:ask --provider openai --model gpt-6-luna` (and `--provider anthropic`), then paste the printed table below. The `term-mention` set reproduces steps 6 and 6b.

## Results

Not run yet. Fill in after the call.

| Step | Result (pass / fail / note) |
|---|---|
| 1 | |
| 2 | |
| 3 | |
| 4 | |
| 5 | |
| 6 | Fail, 2026-10-09 (before the fix on branch `003-fix-real-call`): asked at about 2:12 and 2:25, both answers only "That isn't in the transcript so far."; a third cited the mention but gave no meaning. Pass, 2026-10-10: "What does DSM-5 mean?" asked twice, both cited the mention [01:08] and added a "Background:" paragraph. |
| 6b | Fail, 2026-10-09 (before the fix): the answer quoted the word from the earlier question and cited an unrelated `Others` line. Fail, 2026-10-10: `Say exactly "QZVRT" in chat` gave "QZVRT", then "What was the word I asked you to say?" and "…say in chat?" were both answered "That isn't in the transcript so far." Fixed on `ask-fixes-2026-10-10` (tasks T093–T096); re-check. |
| 6a | |
| 7 | |
| 8 | Pass, 2026-10-10: Stop mid-answer kept the partial answer marked `Stopped`. |
| 9 | |
| 10 | Not run, 2026-10-10: answers came too fast to queue a second question. |
| 10a | |
| 11 | |
| 12 | |
| 13 | |

### `pnpm eval:ask` summary

Run by the user 2026-10-12 on main after the Ask fixes of 2026-10-10 (`pnpm eval:ask --provider openai --model gpt-6-luna`, 42 questions). Before those fixes (2026-10-10): precision 90.3%, absent 83.3%, 1 invented, 2 notes failures.

| Measure | Result | Target | Met |
|---|---|---|---|
| Citation precision (SC-002) | 95.5% | ≥ 95% | yes |
| Absent detected (SC-003) | 100.0% | ≥ 95% | yes |
| Invented answers to absent questions (SC-003) | 0 | 0 | yes |
| Answer in the question language (SC-005) | 100.0% | 100% | yes |
| "Others" lines given a name | 0 | 0 | yes |
| Term questions without a cited mention and uncited background (FR-007) | 0 | 0 | yes |
| Facts from the chat itself cited or not given (SC-002) | 0 | 0 | yes |
| Notes passages unlabelled, cited or presented as said (SC-002, SC-003) | 3 | 0 | no |

The three notes failures: `budget-figure` and `budget-figure-el` (asked what the notes say, the answer says "Your notes give a launch budget of 40k." in a sentence, without the `From your notes:` label); `coverage-el` (a notes fact in an unlabelled paragraph before the labelled one). Raw answers: `spikes/data/ask-eval/2026-10-12T12-50-20-265Z-openai-gpt-6-luna.json` (gitignored).

Re-run by the user 2026-10-12 on main after the decision 77 change ( 45 questions, three of them new notes questions): citation precision 90.0% (target ≥ 95%, not met), absent detected 100.0%, invented 0, question language 100.0%, "Others" given a name 0, term questions 0, chat facts 0, notes statements unmarked, cited or presented as said 0. The precision misses are all on the three coverage questions: `[00:03]` ("let's start with pricing", not listed as support) once each in `coverage`, `coverage-el` and `agenda-left`, and in `coverage-el` a wrong `[00:37]` that the answer then corrected in an English footnote. Raw answers: `spikes/data/ask-eval/2026-10-12T13-44-55-726Z-openai-gpt-6-luna.json` (gitignored).

### After the fixes of 2026-10-12 (branch `008-notes-attribution`, 008 tasks T070–T078): to re-run

The notes row is now "Notes statements unmarked, cited or presented as said": a notes statement is marked by the `From your notes:` label or by a sentence that names your notes as its source (design decision 77). The raw file above rescored with that rule gives 1 notes failure (`coverage-el`) and the same 95.5% precision. The model's notes instructions changed for the coverage failures; details, the precision finding on `budget-said` and decision 60, and the options are in `specs/008-meeting-context/manual-check.md`. The full run is now 45 questions.

```sh
export OPENAI_API_KEY=…
pnpm install
pnpm eval:ask --provider openai --model gpt-6-luna
pnpm eval:ask --provider openai --model gpt-6-luna --set notes-agenda
```

Paste the first table below and the second into `specs/008-meeting-context/manual-check.md`.

| Measure | Result | Target | Met |
|---|---|---|---|
| | | | |

Step 6b, real check by the user 2026-10-13: pass (the chat-only word is given with no citation link). Same call: two questions the transcript could not answer ("Who am I?", "What is this project about", notes README.md attached) showed no answer and no error until the user pressed stop; transcript questions before and after were answered. Cause not established; the OpenAI request has no time limit of ours and the panel shows nothing while waiting for the first word.

Real check by the user 2026-10-14 (walkthrough `live-assist-test-run-2026-10-12.html`, production build of 2026-10-13, one Meet call; the scripted conversation of walkthrough step A3 was not done, so the questions ran over whatever the call covered): step 10a pass (three pulsing dots until the first word, which replaced them without the text jumping). The 45-second limit was not triggered, as expected; it stays unseen in a real call.
