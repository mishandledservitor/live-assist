# Research: Merged download (016)

Evidence: the repo (code and earlier features' research, cited by path); the reference merge script the user ran on six real Meet calls on 2026-10-22 (outside this repo, in the user's knowledge base, `merge-captions.py`); a local prototype of the repeat rule run on those six calls (`spikes/data/016-parity/`, gitignored: the calls hold colleagues' names and employer content, decision 82). Only metrics from them appear here, under neutral names m1–m6.

## R1 — Where and when the merge runs

**Decision**: in the side panel, at the press, from what a download already reads: the meeting record, its stored lines and its kept caption turns (`MeetingFileSource`, 013). A new pure function `mergedMeetingDownload(source, at)` in `src/core/export/meeting-download.ts` returns the merged `.txt` when `meetingFiles(source)` holds both files, and otherwise exactly what `meetingDownload(source, at)` returns (FR-003, decision 99). The panel calls `meetingDownload` for a running meeting on the main view and for `Download originals`, and `mergedMeetingDownload` everywhere else.

**Why**: the merge needs nothing the download path does not already have, and nothing new is stored (FR-004). The caption turns are already read at the press and dropped afterwards (013 FR-009); the merge keeps that shape: their text is used to decide speakers inside one function call and never leaves it. The offscreen document and the runtime are not involved, so live behaviour cannot change (FR-018).

**"Not running"**: the main view already knows (`isRunning` in `App.tsx`: connected, a meeting, `endedAt === null`). On the Transcripts screen the running meeting's row has no Download and its single-meeting view returns to the main view (012), so every Download there is of a meeting that is not running; an interrupted meeting counts as not running (spec A2).

**Alternatives considered**: merging in the offscreen document at Stop and storing the result (rejected: a stored second transcript to keep in step with renames and corrections, and a change to the runtime the user ruled out, decision 94); a Web Worker for the merge (rejected unless R5's measurement needed it: a new entrypoint and a message protocol for a computation that measures well under the bound).

## R2 — The alignment: a port of the reference merge

**Decision**: `src/core/export/merged-transcript.ts` ports the reference merge's `assign`, chunking and joining, and `src/core/export/matching-blocks.ts` ports the part of Python's `difflib.SequenceMatcher` it relies on (`get_matching_blocks` with `autojunk=False`, no junk function). Left out: the names list (`caption-names.txt`), `stash`, the Gemini-export parser and the text parsers (the inputs here are structured records), and the console report.

The steps, with the reference's constants:

1. **Words.** The transcript's words are the tokens of each written line's one-line text (`transcriptFileLines`' text, split on spaces), in `sortSegments` order: exactly the words of the transcript file. The caption words are the tokens of each kept turn's one-line text in the captions file's order (`startMs`, then `seq`), each carrying its turn's display name (R4).
2. **Normalise** for comparison only: lower case, accents removed (NFKD, combining marks dropped), everything but letters and digits removed, in any script. A token that normalises to nothing (a dash, an ellipsis) takes no part in the alignment but stays in the file. The reference keeps only `a`–`z` and `0`–`9`, so Greek or any non-Latin word never matched there; for English text the two give the same strings except that an accented letter is kept as its base letter instead of being dropped (spec A11).
3. **Match.** `matchingBlocks(rec, cap)`: difflib's recursive longest-common-block matching over the normalised transcript words and caption words (interned to integers), blocks sorted and adjacent ones joined, with the final `(len(rec), len(cap), 0)` sentinel. A block of one word shorter than four characters is ignored as likely chance. Each word of the remaining blocks is an **anchor**: it takes its caption word's speaker with weight 2.
4. **Gaps** between consecutive anchors (`g` transcript words, `h` caption words between them), for each transcript word in the gap, first rule that applies:
   - `h > 0` and `g ≤ 3h + 8`: the speaker of the caption word at the same proportion through the caption gap (`c0 + 1 + ⌊k·h/g⌋`), weight 1;
   - `g ≤ 12` and the live line's own label is a caption speaker (its "hint", R4): that name, weight 0.75;
   - the anchors on both sides have the same speaker, `g ≤ 20`, and not every word of the gap is a short reply (`yeah yes yep no mmhmm mhm mm hmm okay ok right exactly sure thank you thanks nice`): that speaker, weight 0.5;
   - otherwise unplaced (`Others`), weight 1.
5. **Sentences.** Each transcript line is cut after every token that ends a sentence (`/(?:[.?!…]["”')]*|-)$/`) and at its end. Each sentence takes the speaker with the highest total weight among its words; on a tie a name beats `Others`, then the first one met wins (Python's `max` over a `Counter` in insertion order). A sentence with no normalisable word takes the speaker of the sentence before it, else the one after, else `Others`.
6. **Corrections** (spec A1, FR-008): every sentence of a line with a single-line correction takes the corrected name, whatever the alignment said.
7. **Join.** A sentence joins the previous merged line when they have the same speaker and either come from the same transcript line or the previous one does not end a sentence; otherwise it starts a new merged line, stamped with its transcript line's start time (spec A6).
8. **Write** `[mm:ss] Name: text` lines, one blank line apart, one newline at the end (007's `exportTimestamp` and one-line rule), `Others` for unplaced.

**Why a port and not a new design**: the user measured this algorithm on six real calls (17.4% → 4.5% unnamed, 98.6% agreement with live where both name someone, 12 of 12 sampled rescued runs right, 7 of 10 sampled disagreements right against 1 for live). Every constant above is one those numbers rest on; changing one would need the measurement again. The parity check (R7) holds the port to the reference.

**difflib, exactly**: `find_longest_match` keeps, for each `i`, the length of the common run ending at each `j` of the previous row (`j2len`) and records a longer run only when strictly longer, so of equally long blocks the one ending first in `a` wins, then the first in `b`. The port keeps that order (it decides which of two identical passages an anchor goes to, which R3 relies on). Python's linear skip of positions below `blo` becomes a binary search over the same sorted list, and the two dictionaries per row become two typed arrays stamped with a row counter, which changes the cost, not the result. `get_matching_blocks` pops subproblems from the end of its list, sorts the blocks and joins adjacent ones; the port does the same, because joining decides whether two neighbouring one-word blocks count as one two-word block (step 3).

**Alternatives considered**: a timing-based alignment (caption turn times against word times): rejected, caption times are when Meet first showed a turn and lag the words by a second or two (013 research R2), which is what the live attribution already copes with and what the word alignment improves on. Needleman–Wunsch or Myers diff: rejected, different block choices from the reference with no measurement behind them. A diff library from npm: rejected, a shipped dependency (Principle VI) with different tie-breaks.

## R3 — Repeated passages

**What the data shows** (the six calls, local prototype `spikes/data/016-parity/repeats_explore.py` and `anchors_explore.py`): of 42 runs of words that repeat an exact 8-word run from the previous 400 words, 35 are whole transcript lines (the repeat starts at the start of a line and ends at its end, and its source does too), 6–35 seconds after the first copy, and 24 of those 35 carry a different speaker from the first copy. Taken line by line (36 lines), the later copy has none of its words matched to the captions in 31, at most 38% in 35, and all of them in one (an 8-word line the captions carry twice); the first copy has 50–100% matched in 35 of 36. In ordinary lines of eight words or more, the median line has 88–94% of its words matched to the captions (by call) and the tenth percentile 48–75%. The 7 runs that are not whole lines are 8–10 words long, several inside a single line: they look like ordinary speech (a phrase said again) and are not touched.

That is the signature of audio transcribed twice: the realtime service writes the same passage as new lines, the captions hold it once, and the word alignment can match only one copy, leaving the other unnamed. 1,274 of the reference merge's 1,610 unnamed words were in such repeats.

**Decision (FR-012)**: on the full transcript, first align as in R2 (pass 1). Then:

1. Mark every normalised word that is part of an 8-word run (`K = 8`) occurring earlier in the transcript, where the earlier occurrence starts at most 400 normalised words before (`WINDOW = 400`) and ends before the run starts (no overlap). For each 8-word run the comparison is with its most recent earlier occurrence not itself marked as a repeat, so the first copy of a passage is the source of every later one. Each marked word remembers the word it repeats.
2. A line is a candidate when every one of its normalised words is marked, it has at least one, and it has no single-line correction. Consecutive candidate lines form a run; a run must hold at least 8 normalised words.
3. For a run, `L` is the share of its words that are anchors in pass 1 and `E` the share of the words they repeat that are anchors. A copy is **carried by the captions** when its share is at least 0.5 (`CARRIED = 0.5`).
4. The run is removed when exactly one of the two copies is carried. Both carried: Meet captioned it twice, so a person said it twice (kept). Neither carried: there is no caption evidence either way, typically because captions were off (kept).
5. The remaining lines are aligned again (pass 2) and merged as R2 says; pass 2 is skipped when nothing was removed.

Removing the later copy keeps the passage at its first time. When the later copy was the one the captions matched, pass 2 matches the first copy to the same caption words, so the passage keeps its speaker.

**Prototype numbers** (Python, the reference merge after this rule, the six calls): 1,334 of 35,469 words removed (3.8%) in 34 lines; unnamed words after removal 1.0% (m1 0.5%, m2 0.9%, m3 4.0%, m4 0.4%, m5 0.6%, m6 0.8%), against 4.5% for the reference merge without it. Two candidate runs were kept: in m2 an 8-word line both of whose copies the captions carry in full (a person saying it twice), and in m3 a 30-word line whose copies the captions carry at 30% and 0% (neither carried). The TypeScript numbers are in R7.

**Why conservative**: every condition only narrows what is removed. Whole lines only: a person repeating a phrase inside a sentence is never touched. 8 words: short repeated phrases ("can you hear me", "yes, yes, yes") are never touched. 400 words: a passage quoted again later in the meeting is never touched. Caption evidence of exactly one copy: a person saying the same thing twice is captioned twice and kept; with no captions there is no evidence, and the lines stay. Corrections: a line a person has looked at and corrected is never removed. The cost of the conservatism is in the numbers: m3's kept 30-word line is about a third of its remaining unnamed words.

**Alternatives considered**: the measuring script's exact rule (an 8-gram compared with its first occurrence only, any words, not whole lines): rejected, it marks the 7 phrase-level repeats too and has no evidence that they were said once. Removing repeats by time (a line whose time falls inside an earlier line's span): rejected, the repeats carry later times (6–35 s) and nothing ties that to a cause this feature may rely on. Fixing the cause in the live transcript: out of scope by decision 96 (and decision 94).

## R4 — Names

**Decision**: speakers are compared and tallied as display names, as the reference does with its aliases. A caption word's speaker is `captionSpeaker(turn, meeting)` (013 R8): the user's name or its rename for Meet's label for the user, a caption name's rename where the meeting has one, else Meet's name. The **hint** for a live line is `displayLabel(segment, meeting).text` when the line has no correction, its label came from the captions (`labelSource === 'caption'`), and that text is one of the caption words' speakers; otherwise none. A corrected line's name is its `labelOverride` (R2 step 6). `Others` is `OTHERS_LABEL`.

**Why**: the reference hints with "the recorder's label when exactly one caption speaker has that first name"; here both files come from live-assist with the same display names, so an exact match is the faithful equivalent, with no first-name guessing. Using display names (not speaker keys) makes two caption names the user renamed to the same person count as one speaker, as the merged file shows them.

## R5 — Speed

**Target** (SC-005): a 15,000-word meeting in under 1 s from the press to the file handed to the browser; a 3-hour meeting (about 45,000 words) under 2 s (013 SC-008).

**Design**: words are interned to integers once; the caption side's positions per word are one sorted array (`b2j` as offsets into a flat `Int32Array`); each row of `find_longest_match` uses two stamped typed arrays instead of dictionaries; the lower bound is a binary search. Pass 2 runs only when lines were removed. Everything is synchronous and runs in the press handler, as 013's zip does.

**Measured** (T021, Node 24 on the development machine, an Apple-silicon laptop; single runs):

| Input | Words | Time |
|---|---|---|
| The six recorded calls (R7) | 1,228 to 14,499 | 4 to 124 ms each |
| The six calls' words joined into one meeting (alignment only) | 35,378 | 199 ms, 36 million search steps |
| Generated meeting, `tests/unit/core/export/merged-transcript-speed.test.ts` | 15,000 | 132–160 ms |
| Generated meeting, same test | 45,000 | 900–920 ms |
| 013's 3-hour timing meeting (5,000 lines of one repeated sentence, 1,200 caption turns of another), exact search | 90,000 | minutes (1,000 lines: 1.1 s; 2,000 lines: 9 s; growth about cubic) |
| The same, with the fallback below | 90,000 | 403–431 ms |

**Fallback for text that is not speech-like**: difflib's longest-block search re-scans what is left after each block it finds; when nearly every word recurs thousands of times on both sides, the blocks are short and many and the work grows about with the cube of the length. Speech does not do this (the joined calls: 373 equal pairs per word), but a meeting made of a repeated phrase would freeze the panel for minutes. So the exact search is skipped when the transcript's and the captions' words have more than 50 million equal pairs (about 1,000 per word at 45,000 words; the 013 timing meeting has 108 million), and abandoned after 150 million search steps; either way the alignment is redone with difflib's own `autojunk` (a word making up more than 1% of the captions is not used to start a block, though blocks extend over it), ported and checked against Python's output like the exact search (`matching-blocks.test.ts`). The real calls never come near either bound, so their numbers in R7 are the exact search's.

**The panel while it builds**: the merge runs in the press handler, so the panel does not respond until it is done: under 0.2 s up to about 15,000 words, about 1 s at 45,000. 013 SC-008's "never unresponsive for more than 200 ms" is therefore kept for the meetings people actually hold (the six calls: at most 124 ms) but not for a 3-hour one, where the file still reaches Downloads inside SC-005's 2 s. Moving the merge to a worker would remove the pause; it is left open (not needed for the measured meetings, and a new entrypoint and message protocol for the panel).

**The 013 timing test**: `tests/e2e/captions-download.spec.ts` "a 3-hour meeting …" seeds that repeated-sentence meeting. It keeps timing the 013 zip, now through `Download originals`; the merged file of the same meeting is timed beside it (the fallback above), and the merged file of a speech-like meeting in the unit test above (`tests/support/synthetic-meeting.ts`).

## R6 — `Download originals`

**Decision**: the single-meeting view (`PastTranscript`) gains a second instance of the download button with the label `Download originals` and a `load` that calls `meetingDownload` (013, unchanged), present only when the meeting has a transcript line to write and `hasCaptions` (spec A3). The press logic of `DownloadTranscript` (build on press, save one file, nothing on failure) moves into a label-free `DownloadButton` that both use, so the two cannot differ in behaviour; the label strings stay in their own components (the 013 copy test pins which strings each source holds).

**Why there**: decision 97. The main view and the rows keep one button (FR-016).

## R7 — Parity with the reference, locally

**Decision**: `spikes/data/016-parity/parity.ts` (gitignored, never committed) reads each call's `transcript.txt` and `captions.txt` (the live downloads), turns them into stored-model records (one line per transcript line with its label as caption-sourced unless it is `Others`; one caption turn per captions line), runs `mergedTranscript`, and compares word by word with the reference merge's `merged.txt` (first names compared, as the reference's own comparison did, because the reference rewrote names through its list) and with the live labels. Reported per call and in total: words, words removed as repeats, `Others` share live and merged, agreement with the reference on words both name, agreement with live on words both name, and the time each merge took.

**Results** (T022, 2026-10-22; metrics only, calls named m1–m6). "Others" is the share of words without a name: live of all words, reference of all words (the reference does not remove repeats), merged of the words left after removal. Agreement is on words both sides name, compared by first name.

| Call | Words | Removed as repeats | Others live | Others reference | Others merged | Agreement with reference | Agreement with live | Time |
|---|---|---|---|---|---|---|---|---|
| m1 | 4,774 | 296 (6.2%) | 16.8% | 6.7% | 0.5% | 4,456 of 4,456 | 98.4% | 27 ms |
| m2 | 8,750 | 377 (4.3%) | 26.7% | 5.2% | 0.9% | 8,296 of 8,296 | 98.3% | 42 ms |
| m3 | 3,136 | 104 (3.3%) | 12.6% | 5.8% | 4.0% | 2,895 of 2,895 | 99.3% | 10 ms |
| m4 | 1,228 | 71 (5.8%) | 13.1% | 6.4% | 0.4% | 1,150 of 1,150 | 98.7% | 4 ms |
| m5 | 3,082 | 188 (6.1%) | 19.8% | 5.6% | 0.6% | 2,869 of 2,871 | 98.1% | 9 ms |
| m6 | 14,499 | 298 (2.1%) | 12.9% | 2.8% | 0.8% | 14,076 of 14,076 | 98.9% | 109 ms |
| All | 35,469 | 1,334 (3.8%) in 34 lines | 17.4% | 4.5% | 1.0% | 33,742 of 33,744 (99.99%) | 98.7% | |

The port gives the reference's names on every word both name except two (in m5, around a removed repeat, where the second alignment pass places them differently). The repeat rule removed the same 34 lines as the Python prototype of R3 and kept the same two candidates (m2's line said twice, m3's line the captions do not carry); with it the unnamed share falls from 4.5% to 1.0%, against SC-004's "about 1%, at most 2%". m3 stays at 4.0%: its captions match fewer of its words than the other calls' do (R3), and the 30-word line kept for lack of caption evidence is part of it.

## R8 — What stays the same, and how that is held

- No file under `src/core/session`, `src/core/speakers`, `src/core/transcript`, `src/offscreen` or `src/platforms` changes; their tests are not edited (FR-018, SC-003). The task list names the files that change; a check before the last commit diffs those folders against `main`.
- `meetingDownload` and everything it calls are unchanged, so the originals and every download without both records are byte for byte as before (SC-002); its existing tests stay as they are.
- The tests that encoded decision 67 for a stopped meeting (the zip from the main view after Stop and from the Transcripts screen) are changed to the merged file, and each gets a sibling for `Download originals`; the tests of a running meeting's zip stay.

## Open risks

| # | Unknown | What the design does | Check |
|---|---------|----------------------|-------|
| O1 | Meetings unlike the six measured (many speakers, a lecture, heavy crosstalk, captions in another language) | The rules fall back to `Others`, never to a guess; a correction by hand still wins | `manual-check.md` steps 1–3 |
| O2 | A repeat that is not whole lines (the replay starting mid-line) | Not removed; it stays, named or `Others` as the alignment gives it | Parity numbers per call (R7) |
| O3 | A person who says the same 8+ words twice while Meet captions only one of them | Removed as a repeat: the one case where the rule loses words. Not seen in the six calls | `manual-check.md` step 4 |
