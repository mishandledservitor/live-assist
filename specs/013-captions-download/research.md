# Research: Captions download (013)

Evidence comes from the repo (code and earlier features' research, cited by path), from web documentation (linked) and from two live looks at Meet's page (working notes from those sessions, 2026-10-08 and 2026-10-12, not kept in the repo; what they found is quoted here). What none of them can settle is under "Open risks", each with the fallback the design uses and its step in `manual-check.md`.

## R1 — Reading a turn's text as it changes, and what its final text is

**Decision**: the existing caption observer (`src/platforms/meet/caption-observer.ts`) gains a second, separate output, `onText`. Its one `MutationObserver` on the captions region already receives every change (`childList`, `characterData`, `subtree`) and already maps each mutation record to the caption item it happened in (`itemOf`). The text path uses exactly that set of touched items:

1. A mutation batch marks each touched item's turn **dirty**. Nothing is read yet.
2. A per-turn trailing throttle (`CAPTION_TEXT_THROTTLE_MS` = 1,000) fires at most once a second per dirty turn. Only then is that one item's text read, by a new locator `captionTextOf(item)` (the text of the item's children after its header, whitespace collapsed). The region is never re-read: a mutation in one turn costs one `textContent` read of that turn per second at most, however many of the ~1,200 turns of a long call are on the page.
3. The text read is merged with what the turn held before (`mergeCaptionText`, below), and the difference from what was last sent is posted as `meet/caption-text` (R3).

There is no "final" event for a turn, because Meet gives none. **A turn's stored text is the latest text read for it while its element is on the page and the meeting runs; last write wins.** An older turn that Meet corrects after a newer one started is updated the same way (spec edge case), with no closing rule: the 4-second closing rule of 002 (`TURN_CLOSE_MS`) belongs to the activity path, which is not touched. A turn whose element leaves the page keeps what it had; removal sends nothing. On `stop()` the observer reads and sends every dirty turn once more before it disconnects.

**Evidence**:

- `caption-observer.ts` `onMutations`: `touched` is built from `records` via `itemOf`, and `captionItems(region)` is the only whole-region call, a child-list walk without text.
- `src/platforms/meet/locators.ts` `speakerNameOf` reads the header only; the text elements are `item.children` after the first (`snapshot.ts` overwrites exactly `[...item.children].slice(1)` when anonymising). `sanand0/tools meetcaptions` reads "text = last non-avatar `div` (`.ygicle`)" (002 research R1 sources).
- Meet rewrites the current turn several times a second (002 research R5; timeline fixtures show changes every 300–500 ms), so reading on every mutation would read a growing string three times a second per speaker for nothing.

**Long turns: Meet drops the beginning (spec P3).** In the real call of 2026-10-08, "Meet keeps writing an ongoing turn into the same item through pauses, rewrites and older lines dropping off" (002 research R5, R6; fixture `dropped-older-text`, a 40-second turn). TranscripTonic, which scrapes the same region, handles a related case: "When the same person speaks for more than 30 min (approx) Meet drops very long transcript for current person and starts over", detected by the text getting more than 250 characters shorter ([source](https://raw.githubusercontent.com/vivek-nexus/transcriptonic/main/extension/content-scripts/google-meet/index.js), marked "TO VERIFY" by its author). "Latest text replaces earlier" alone would therefore lose the start of every long turn, against FR-002. `mergeCaptionText(kept, shown, next)` in `src/platforms/meet/caption-text.ts` (pure, no DOM) keeps a turn as `kept` (text that has left the page) plus `shown` (the page's text at the last read):

- `next` begins inside `shown` at offset k > 0 (the first 24 characters of `next`, or all of it when shorter, found in `shown`): Meet dropped `shown[0..k)`. `kept += shown.slice(0, k)`; `shown = next`.
- otherwise, `next` is more than 250 characters shorter than `shown` and shares no such overlap: Meet started the item over. `kept += shown + ' '`; `shown = next`.
- otherwise (growth, a rewrite of recent words, a correction): `shown = next`.

The turn's text is `kept + shown`. A wrong guess errs towards keeping words Meet removed, never towards losing words. Whether the DOM text really is cut (and not only scrolled) is Open risk O3.

**Alternatives considered**: reading every item's text on each mutation (O(turns) work several times a second); a second `MutationObserver` in its own module (two observers disagreeing about the region and about which element is which turn); a polling read of the newest item only (misses Meet's corrections to older turns, which the spec keeps); reading the page once at Stop (ruled out by FR-003).

## R2 — A turn's time: when live-assist first saw it, not Meet's `data-iml`

**Decision**: a turn's time is the content script's `Date.now()` when the turn is first registered as a kept turn (`firstSeenAt`, epoch ms). Core stores `startMs = max(0, firstSeenAt − meeting.startedAt)`, the same conversion 002 uses for caption activity ("content script and offscreen document share the machine clock", `src/core/speakers/caption-turns.ts`). The bridge drops a `firstSeenAt` more than an hour from the receiver's clock, like every other timestamp it carries. Order in the file is `startMs`, then `seq`, a per-meeting counter core assigns in arrival order; the content script emits turns of one batch in page order, so ties keep Meet's order (FR-014).

**Why not `data-iml`**: each turn's avatar `img` carries `data-iml`, "milliseconds since page load when the turn appeared, ascending" (working notes from one look at one call on 2026-10-12). It is not used because (1) it is an undocumented attribute of an image, whose meaning is inferred from a single observation and which Meet may re-stamp when it re-creates a node; (2) it is relative to the page's load, so it needs a second clock conversion and restarts at a reload, exactly where continuity matters; (3) the observation time is the clock every naming decision already rests on, validated against real traces (002 research R6), so the two files' times are on one clock by construction; (4) the difference is the time between Meet inserting the node and the observer callback, far below the one-second resolution of `[mm:ss]`. The cost of the choice: a turn first seen late (after a re-attach) would carry the later time, but such turns are not kept at all (R3). `data-iml` stays what it is today, one of the two ways a caption avatar is recognised (`locators.ts` `AVATAR`).

## R3 — Turn identity: re-renders, a re-attached script, a reloaded page

Three different things can break "this element is that turn".

**Decision**:

1. **Within one page, the element is the turn.** `turnKey` stays `"{pageId}:{n}"`, held in the observer's `WeakMap<Element, Turn>`, as today. A turn is kept (its text sent) only if it was registered as new: appended while the observer was watching.
2. **What is on the page when the observer adopts a region is history and is never kept**, at Start (decision 73, FR-004) and at every later adoption: a region that appears again after captions were off, and a reloaded page. A reloaded page is a new content script with a new `pageId` and no memory, so anything Meet shows again there is history by this rule: not stored twice, no new time (FR-005). The price is stated in the spec: a turn that is on the page at adoption and still growing is not continued.
3. **A re-render (Meet re-creating item elements on the same page) re-binds, it does not duplicate.** The observer keeps its kept turns in order (strong references, with their last text). When an unknown item appears that is not a plain append, it may take over a kept turn K whose element is no longer connected, if all of: the speaker name is equal; the texts are related (one starts with the other, or they share their first 16 characters, or all of the shorter); and the position is consistent: every still-connected kept turn before the item on the page has a lower sequence than K, every one after it a higher, and take-overs run in increasing sequence down the page. A taken-over turn keeps its `turnKey` and `firstSeenAt`. The position rule is what stops a new turn that happens to start with the same words ("Yes, …") from being merged into an old turn Meet has pruned: the pruned turn lies before turns that are still there, the new one after them.
4. **An unknown item that takes over nothing** and was not there at adoption is a new turn and is kept, wherever it stands.
5. **A second observer on the same page must not reuse keys.** Today the counter lives inside `observeCaptions`, so an observer created after a `restore` (the page agent's `captionObserver ??= observeCaptions(…)`) starts again at `{pageId}:1`. The page agent now owns the counter and passes it in. Stored rows are keyed by meeting and `seq`, not by `turnKey`, so even a reused key could not cross meetings; within a meeting the shared counter removes the case.
6. **A new port on the same page** (the offscreen document adopts the newest port): the page sends each kept turn's next change as a whole (`keep: 0`), because the receiver's copy is not known.

**Evidence**: `caption-observer.ts` (`register`, `replaced`, `attach`: "Turns already on the page are history: known, but not announced"); `page-agent.ts` (`pageId` per agent; `captionObserver ??=`; `restore()` on port loss); `meet.content/index.ts` (`meet/ready` → re-attach after a reload); an observation from development ("Reloading the extension orphans the Meet content script: the user must reload the Meet tab", so a content script is never re-injected into a live page); 002 research R5 "Revised by the retest 2026-10-08" (Meet does re-create item nodes).

**Alternatives considered**: reconciling in core by speaker and text across pages (needs the history's text sent to core just to be thrown away, and guesses where rule 2 is certain); keying turns by `data-iml` (R2's objections); keying by speaker plus first words (merges repeated phrases).

## R4 — Getting the text across the bridge

**Decision**: one new message, content script → offscreen, on the existing `platform:meet` port:

```ts
{ type: 'meet/caption-text'; turnKey: string; speakerName: string; self: boolean | null; firstSeenAt: number; keep: number; append: string }
```

The receiver's text for the turn becomes `text.slice(0, keep) + append`. The sender computes `keep` as the common prefix of what it last sent and the turn's text now, so a typical message carries only the rewritten tail. `append` is at most 8,000 characters; a longer change goes out as consecutive messages (never splitting a surrogate pair). Limits and validation are in `contracts/captions-capture.md`; the message is the only one allowed to carry caption text, and every other message keeps failing on a `text` or `append` field and on 2 KB.

**Why a difference and not the whole text each second**: FR-002 keeps a turn whole "whatever its length". A ten-minute monologue is about 9,000 characters and R1 lets a turn grow past what the page shows; whole-text messages would either need a limit that truncates long turns or grow without bound. With `keep`/`append` every message is bounded and a turn is not. Ports deliver in order without loss while connected, and a new port resets the sender (R3 rule 6), so the two ends cannot drift; a `keep` larger than the receiver's text is dropped and counted, and the turn waits for its next `keep: 0`.

**Where it is reassembled**: `BridgedMeetAdapter` (core) holds each turn's text for the meeting and hands core a whole-text event through a new capability method, `captions.subscribeText` (adapter contract revision 3). The delta is a transport detail of the Meet bridge; nothing above the adapter sees it. `CaptionActivity` and `captions.subscribe` are unchanged.

**The dev-only listeners on the same port** (`src/entrypoints/offscreen/spike-trace.ts`, `e2e-bridge-stats.ts`) parse with `parseFromPage` and act only on `meet/caption` and `meet/hello`; a test pins that a trace exported after caption-text messages contains none of their text (FR-009).

## R5 — Storage: shape, size, migration

**Decision**: a new object store `captionTurns` in IndexedDB `live-assist`, `DB_VERSION` 3 → 4.

```ts
interface StoredCaptionTurn {
  meetingId: string;
  seq: number;         // per meeting, from 1, arrival order
  startMs: number;     // meeting clock, when the turn first appeared
  speakerName: string; // as Meet showed it, whitespace-collapsed, ≤ 200
  self: boolean;       // Meet's label for the user
  text: string;        // whitespace-collapsed, never empty
  schemaVersion: 1;
}
```

Key path `['meetingId', 'seq']`, no index: one key range `[id, -∞] … [id, +∞]` reads a meeting's turns in order and deletes them in one call. `Meeting` gains `hasCaptions?: true`, set in the same transaction as the meeting's first stored turn, so the main view, a Transcripts row and the delete confirmation know without counting rows (FR-018, FR-022).

**Writer**: the offscreen document, like every other meeting write. A platform-free `CaptionLog` (`src/core/captions/caption-log.ts`) receives whole-text events from the adapter, assigns `seq`, and every `CAPTION_STORE_FLUSH_MS` (2,000) writes the turns that changed in one transaction through `MeetingStore.putCaptionTurns`. A turn with empty text is not stored. **Reader**: the side panel, straight from IndexedDB at the moment of a download, as it already reads stored meetings (012). Caption text never travels over the `live` port and never enters panel state; the panel learns only that a meeting has captions (`Meeting.hasCaptions`, and a text-free `live/captions-kept` event for the running meeting).

**Bounds**: worst-case loss on a crash is the bridge throttle plus the flush interval plus one write, about 3 seconds, inside the spec's 10 (FR-003, SC-004), and the same figure is how far a download or Stop can lag the page (spec P1: at most 5 seconds). On `end()` the log is flushed before the meeting is marked ended.

**Size for a 3-hour call**: about 1,200 turns (spec) and roughly 27,000 spoken words, 160,000–200,000 characters of text; with keys and names well under 1 MB stored. The active turn's row is rewritten at most every 2 seconds: at most 5,400 writes in 3 hours, each the size of one turn (typically a few hundred bytes, a few KB for a monologue). For comparison the transcript writes one row per line and rewrites it when its label settles.

**Migration**: `if (oldVersion < 4) db.createObjectStore('captionTurns', { keyPath: ['meetingId', 'seq'] })`. Additive: no existing store or record is touched, old meetings simply have no rows and no `hasCaptions`. Every context opens the same version and `openLiveAssistDb` already closes an older connection on `versionchange` (`src/storage/db.ts`), so an open panel does not block the upgrade. Tests seed version 3 with meetings, lines, chat and notes, open version 4, and compare every pre-existing record.

**Alternatives considered**: captions inside the `meetings` record (rewrites the whole meeting, text included, every 2 seconds, and every list read would load the text); one row per meeting holding all turns (same rewrite cost); a row per text version (unbounded, and FR-002 wants one row per turn); a count of turns in 012's `Meeting.summary` (needs a version bump of the summary and still does not serve the running meeting).

## R6 — The zip: written here, about 100 lines, no dependency

**Decision**: a minimal zip writer in `src/core/export/zip.ts`: `zipStored(entries: { name: string; data: Uint8Array }[], modifiedAt: Date): Uint8Array`. Method 0 (stored, no compression), CRC-32, general-purpose bit 11 set so names are UTF-8, no extra fields, no data descriptors, no zip64, no comment. The exact bytes are in `contracts/files-and-storage.md`.

**Why this is enough**:

- The two files are plain text, together well under 1 MB for a 3-hour meeting. Compression would save a few hundred KB once, on a local disk, and would need either a deflate implementation or the asynchronous `CompressionStream` plus the same container code.
- Stored entries need exactly three record types from the format ([APPNOTE.TXT](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) 4.3.7 local file header, 4.3.12 central directory header, 4.3.16 end of central directory) and CRC-32 (4.4.7: register preset to `0xFFFFFFFF`, final value complemented; check value of `"123456789"` is `0xCBF43926`).
- Names: APPNOTE 4.4.4 bit 11, "Language encoding flag (EFS)": when set, "the filename and comment fields for this file MUST be encoded using UTF-8"; Appendix D adds that UTF-8 names carry no byte-order mark. The names here are ASCII plus the em dash (U+2014), with no combining characters, so macOS's decomposed-name handling does not come into it. Reader support, as far as documentation goes: Info-ZIP `unzip` 6.0 honours the flag; macOS Archive Utility treats names as UTF-8 since 10.15 ([Bandisoft's note on Catalina](https://be.bandisoft.com/bandizip/help/catalina-error22)); Windows Explorer honours the flag from Windows 8, not on Windows 7 ([rubyzip wiki](https://github.com/rubyzip/rubyzip/wiki/Files-with-non-ascii-filenames/acfb02ae73dff2f1e77950471002da7470c5e346)). Current Windows 10/11 Explorer was not verified from a source: Open risk O5.
- "Version made by" is Unix (3) with external attributes `0o100644 << 16`: `unzip` gives a Unix-made entry with zero attributes the mode `000`, an unreadable file.

**How it is known to be right** (the task's "fully unit-tested against a known-good archive"): `tests/fixtures/zip/known-good.zip` is produced by an independent implementation, Python's standard `zipfile`, from fixed inputs (two entries whose names hold an em dash and Greek letters, bodies with Greek text, a fixed date) by a committed script that is run by hand, never in CI. The writer's output for the same inputs must equal that file byte for byte. Further unit tests pin the CRC check value, the offsets and counts in the directory, the UTF-8 flag on both records of each entry, and a 1 MB entry. The e2e test then unpacks the zip the built extension actually saved with the system's `unzip` and compares both names and both bodies byte for byte; the manual check opens it in Archive Utility.

**Own code or a dependency (Principle VI)**: decision 67 needs a zip, so either is justified by a current requirement; the question is which is smaller. `fflate` (about 8 KB for its sync zip path, MIT) and `client-zip` (about 2.6 KB, streams) would work; `JSZip` is about 100 KB. A dependency adds a supply-chain entry to an extension whose whole promise is that meeting text goes nowhere, a lockfile entry to keep current, and code paths (deflate, streams, zip64) that would never run. The own writer is about 100 lines of pure, synchronous TypeScript in `src/core/`, with no API surface beyond one function, checked against an independent implementation's bytes. **Own writer.** If a second archive format, compression or files over 4 GB were ever needed, this decision should be revisited rather than the writer grown.

**Saving it**: the panel saves a `Blob` of type `application/zip` through the same anchor download as 007 (research R1 there): one download, so Chrome's multiple-downloads prompt never arises, and no `downloads` permission.

## R7 — Real deletion and late writers

**Decision**:

- `MeetingRepo.deleteMeeting` adds `captionTurns` to its one transaction and deletes the meeting's key range there, with the record (and with it `hasCaptions`), the lines, the chat and the notes. 012's every-store scan test (`tests/integration/storage/real-deletion.test.ts`) is extended to seed caption turns with a recognisable text and to find none of it afterwards, in any store, and to find another meeting's turns intact (SC-005).
- **Late writer**: `putCaptionTurns(meetingId, turns)` runs in one transaction over `meetings` and `captionTurns`. It reads the meeting first and writes nothing, resolving `false`, when the meeting does not exist or has ended; otherwise it writes the rows, sets `hasCaptions` if it is not set, and resolves `true`. This is 012's guard for chat turns and notes (`ChatRepo.putTurn`, `ContextRepo.set`; 012 research R6) applied to the third writer. On `false` the `CaptionLog` closes and writes nothing more.
- Why it can matter although "a meeting cannot be deleted while it runs" (012 FR-018): the log flushes on a timer, and the meeting can end by itself (`call-ended`, a failed session) or be marked crashed and then deleted from another panel window while a flush is queued. The guard makes the order irrelevant.
- `end()` sets `ended` first, so no later text event is accepted (FR-004), then flushes the log, then marks the meeting ended.

## R8 — Names in the captions file (decision 66)

**Decision**: one pure function, `captionSpeaker(turn, meeting)` in `src/core/export/captions-file.ts`: for Meet's own label for the user, `meeting.speakerRenames.self?.name ?? meeting.userName`; otherwise `meeting.speakerRenames['caption:' + normaliseName(turn.speakerName)]?.name ?? turn.speakerName`. This is `displayLabel`'s rule for a line attributed to that caption name (`src/core/transcript/labels.ts`) without the two things that belong to a line: a single-line override and the pending placeholder.

**Remembered names (spec P2)**: today a remembered mapping becomes a meeting rename "the first time their caption key resolves" for a transcript line (`speaker-attributor.ts` `applyRemembered`). A person Meet captioned but after whom no line was ever named would then keep Meet's name in the captions file. So the runtime also applies the mapping when the `CaptionLog` keeps the first turn of a caption name, through the same `rename()` (origin `remembered`, never over an existing rename). The attributor then finds the rename present and does nothing. Line labels cannot differ: a rename only changes what `displayLabel` shows for lines of that key, and those lines would have received the same rename at their first resolution. SC-006 replays the 002 timeline fixtures and the real traces with and without the caption log to prove it.

**Alternative considered**: passing the current Settings mappings to the formatter at download time. Rejected: two sources of names, the panel's settings read at every download, and a mismatch after the user renames a remembered speaker back to Meet's name in one meeting.

## R9 — The reminder knows the platform (decision 71; withdrawn 2026-10-13, decision 79)

**Withdrawn 2026-10-13 (decision 79)**: the reminder has one text on every platform, so the panel no longer asks for the tab's platform. `MeetingApi.startPlatform`, `MeetingApiDeps.activeTabUrl` and the `platform` prop of `ConsentDialog` are removed, and Start shows the reminder at once, as before 013. Whether captions are kept is still decided by `isMeetCallUrl` in the service worker and the offscreen registry, which this never touched.

**Decision as built on 2026-10-12, for the record**: `MeetingApi` gains `startPlatform(): Promise<PlatformId>`, implemented in `main.tsx` by reading the active tab and applying `isMeetCallUrl` (`src/core/platform/meet-url.ts`), the same pure rule by which the service worker decides the tab is bridged (`meeting-control.ts`) and the offscreen registry picks the Meet adapter. The tab's address is readable through the `activeTab` grant of the toolbar click that Start already depends on (and the `tabs` permission of e2e builds). `StartControls` asks before it shows the reminder and passes the answer to `ConsentDialog`; an address that cannot be read, or a rejection, reads as `generic`, and then no Meet adapter is chosen either, so the reminder and the capture cannot disagree (spec P4). No message type is added.

## R10 — Privacy proofs (FR-008, FR-009)

Each is a test, not an argument:

- 003's context builder: `buildContext` takes a meeting, its segments and earlier turns; a test gives it a meeting whose caption store is full of a marker sentence and asserts the request holds none of it, and a type-level check pins that nothing in `src/core/chat/` imports from `src/core/captions/`.
- ElevenLabs: the integration run of `MeetingRuntime` with a fake provider records everything passed to the session; none contains the marker.
- Network: the e2e test fails on any request to a non-local origin while captions are scripted, and asserts no request body or URL holds the marker.
- Logs: `CaptionLog` and the bridge parser are run with failing stores and malformed messages under a recording log sink; no log argument contains the marker. Errors name counts and kinds only.
- Panel: the rendered main view and Transcripts screen never contain the marker; the `live` port events are scanned for it.
- Spike trace: R4.

## R11 — Two points settled with the second build (2026-10-12)

**A turn older than an hour.** The first build validated `meet/caption-text` like every other bridge message: its time within an hour of the receiver's clock (`MAX_CLOCK_SKEW_MS`). But the time it carries is `firstSeenAt`, when the turn appeared, repeated unchanged with every later change of the turn's text. Can a turn's text still change more than an hour after it appeared? Yes. Meet starts a new turn when another person is captioned; while one person goes on talking it "keeps writing an ongoing turn into the same item through pauses, rewrites and older lines dropping off" (002 research R5, R6), and the "starts over" TranscripTonic reports after about thirty minutes happens inside the same item (R1). So in a call where only one person is captioned for more than an hour (the user alone, a lecture, a muted audience) every update after minute 60 was dropped by the parser, counted as an invalid message, and the stored line stopped at the hour. Corrections Meet makes to an old turn, and a re-bound turn whose text moved on, were dropped the same way. **Fix**: `firstSeenAt` may lie up to `MAX_TURN_AGE_MS` (24 hours) behind the receiver's clock and, as before, at most an hour ahead of it. A day is longer than any meeting; it still rejects a time in seconds, a zero and a clock that was never set. Memory stays bounded by what bounded it before: `MAX_TURN_CHARS` per turn in the adapter, `MAX_CAPTION_TURNS` per meeting in the log. Core clamps `startMs` at 0, so an old time cannot put a line before the meeting. Tests: `meet-bridge.test.ts` (61 minutes, three hours, exactly a day; a day and a millisecond, seconds, zero), `page-agent.test.ts` ("a turn Meet keeps writing into for more than an hour"), `meet-bridge-adapter.test.ts` ("a turn first seen hours ago still takes text").

**Captions turned off and on, and `Show Meet captions`.** What Meet's page does to its caption history when the user turns captions off and on again is not known. The one observation (a live look at the page, 2026-10-12: "the region kept every caption turn since captions were turned on") suggests the band starts empty. The design has to be right either way, and it is checked as a timeline through the whole path, page agent to captions file (`tests/unit/platforms/meet/captions-off-on.test.ts`):

- The band leaves the page and comes back **showing earlier turns again**: the observer adopts a region, so every turn in it is history or re-binds a kept turn (R3 rules 2 and 3). No line twice, none from before Start, and a kept turn that goes on in its new element stays one line with its first time.
- The band comes back **empty**, or stays and is **emptied in place**: the turns kept before keep their last text (removal sends nothing), and turns that appear afterwards are new turns.
- `Show Meet captions` switched during the meeting: only the hiding tag on the region changes. No element is replaced, nothing is adopted again, and no text is sent again; a kept turn goes on as the same line.

Writing these found a loss in the re-binding rule, fixed in the same change: with no other kept turn on the page to hold the position rule, an item showing a couple of letters took over an earlier kept turn of the same speaker that began with them, and its text replaced the kept one. A text shorter than `REBIND_PREFIX_CHARS` now relates to a kept turn only by carrying on from all of it (contracts/captions-capture.md, amendment under "Caption observer"). The wrong guess is now a line twice, never a line lost.

What stays open is O7 below: a band adopted empty into which Meet renders earlier turns afterwards.

## Open risks (need a live Meet look; not learnable from the repo)

| # | Unknown | Fallback the design uses | Manual check |
|---|---------|--------------------------|--------------|
| O1 | Does Meet remove old turns from the page in calls longer than 30 minutes (only "none pruned in ~30 min, ~200 turns" is known)? | Removal changes nothing: a stored turn keeps its last text (R1), and the position rule keeps a new turn from being merged into a pruned one (R3). | Step 9: a call over 60 minutes; first turns still in the file. |
| O2 | What does a reload of the Meet tab do to the caption history: an empty region, or earlier turns shown again? | Whatever is on the page when capture attaches is not kept (R3 rule 2): no duplicate either way; a gap for the reload. If Meet restores a turn that is still growing, its continuation is lost until that speaker's next turn. | Step 10: reload mid-call; no turn twice, capture resumes, the gap is the reload. |
| O3 | In a long single turn, does Meet cut the beginning out of the DOM text, at what length, and does it "start over"? | `mergeCaptionText` keeps what was cut (R1). If Meet never cuts, the rule never fires. | Step 8: one person talks for 5 minutes; the line begins with their first words. |
| O4 | Does Meet re-create caption elements during an ordinary call (it did during the retest of 2026-10-08), and are a re-created turn's speaker and first words unchanged? | Re-binding by speaker, related text and position (R3 rule 3); if a re-created turn's text was rewritten from its first word, it becomes a second line with a later time. | Step 7: no doubled lines in a 30-minute, three-person call (SC-007). |
| O5 | Windows 10/11 Explorer and the UTF-8 name flag (documented for Windows 8; the user works on macOS). | Bit 11 is the format's own mechanism; `unzip` and Archive Utility are tested. | Step 14 (optional): open the zip on a Windows machine if one is at hand. |
| O6 | Greek interface: Meet's word for the user in captions is still unverified (002 research R5). | Unrecognised, the turns carry Meet's word until the user renames it once; the rename applies to the captions file. | Step 15 (optional), with the 002 follow-up. |
| O7 | When captions are turned off and on again, does Meet show the earlier turns again, and if so are they in the band when it appears or rendered into it afterwards? | In the band when it appears: history or re-bound, no line twice (R11). Rendered into an already adopted, empty band afterwards: they cannot be told from new turns (a new turn also arrives as an element appended to the band), so they would be kept again, each a second line with a later time, turns from before Start included. Nothing is lost in either case. Not guarded against, because each guard considered (treating the first elements after an empty band as history, or matching them to earlier turns by a short beginning) loses real new turns or real text when Meet does not re-render, which is what the one observation suggests. | Step 11: captions off for a minute, then on; no line twice; note what Meet's captions showed when they came back. If lines are doubled, this is the cause and the fix is a rule for the first batch after the band was empty. |
