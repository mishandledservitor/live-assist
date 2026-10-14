# Contract: capturing Meet's caption text (013)

Extends 002's `contracts/meet-dom.md`, `contracts/meet-bridge.md` and `contracts/platform-adapter.md` (each carries a dated pointer here). Everything those documents say about caption **activity**, the captions state, mute, call presence and show/hide is unchanged. Tests are written against this document.

## Constants

| Name | Value | Where | Meaning |
|---|---|---|---|
| `CAPTION_TEXT_THROTTLE_MS` | 1,000 | `src/platforms/meet/caption-observer.ts` | At most one text read and send per turn per this long; the last change is always sent. |
| `MAX_APPEND_CHARS` | 8,000 | `src/core/messaging/meet-bridge.ts` | Longest `append` in one message. |
| `MAX_CAPTION_TEXT_MESSAGE` | 16,384 | same | Longest `meet/caption-text` message, as JSON characters. |
| `MAX_TURN_CHARS` | 1,000,000 | same | Largest `keep`, and the longest text the adapter holds for one turn. |
| `MAX_TURN_AGE_MS` | 86,400,000 | same | How far behind the receiver's clock a turn's `firstSeenAt` may lie (added 2026-10-12, see "Bridge message"). |
| `REBIND_PREFIX_CHARS` | 16 | `caption-observer.ts` | Shared beginning that relates a re-created item to a kept turn. |
| `OVERLAP_PROBE_CHARS` | 24 | `src/platforms/meet/caption-text.ts` | Beginning of the new text looked for in the old. |
| `START_OVER_SHRINK_CHARS` | 250 | same | Shrink beyond which a text with no overlap is a restart of the item. |

## Meet page (DOM): added assumptions

| # | Assumption | Locator | Snapshots that must pass |
|---|---|---|---|
| D8 | A caption turn's text is the text of its children after the header (one text element on the real page, `div.ygicle`); the header's name is not part of it | `captionTextOf(item)` → `{ value: string; tier: Tier \| null }` (whitespace collapsed; `''` with tier `null` when the element is not a caption turn, has no text element or it is empty), reporting its tier like every locator: 1 by the turn's shape, 4 by the generated class when the avatar is gone | in-call-captions-on, greek-ui, real-dom-captions-on (invented sentences in each; the Greek snapshot's text holds Greek letters) |
| D9 | A changed page degrades, never throws: an item without a text element reads `''` | `captionTextOf` | changed-page |
| D10 | An item that is not a caption turn (the notifications chip, "Jump to bottom") is never read | `captionItems` (unchanged) decides what is an item | real-dom-captions-on |

Snapshots hold invented names and invented sentences only (FR-011). `src/platforms/meet/snapshot.ts` keeps overwriting every turn's text with `Caption text N` when it anonymises a real page; that rule is pinned by its existing test and is not relaxed.

## `mergeCaptionText` (`src/platforms/meet/caption-text.ts`, pure)

```ts
export interface TurnText { kept: string; shown: string }
/** The turn's text after the page shows `next`. `kept + shown` is what is stored. */
export function mergeCaptionText(previous: TurnText, next: string): TurnText;
export const fullText = (t: TurnText): string => t.kept + t.shown;
```

1. `next === ''` → `previous` (a turn never loses its text to an empty read).
2. `previous.shown === ''` → `{ kept: previous.kept, shown: next }`.
3. Let `probe = next.slice(0, OVERLAP_PROBE_CHARS)` and `k = previous.shown.indexOf(probe)`. `k > 0` → Meet dropped the beginning: `{ kept: previous.kept + previous.shown.slice(0, k), shown: next }`.
4. Else, `k === -1` and `previous.shown.length − next.length > START_OVER_SHRINK_CHARS` → the item started over: `{ kept: previous.kept + previous.shown + ' ', shown: next }`.
5. Else → `{ kept: previous.kept, shown: next }` (growth, rewrite, correction).

## Caption observer: the text path

`observeCaptions(deps)` gains two optional members; without `onText` it behaves exactly as today.

```ts
export interface CaptionObserverDeps {
  // … existing members
  /** A kept turn's text changed. Absent = no text is read at all. `CaptionTextUpdate` is exported beside the deps. */
  onText?(update: CaptionTextUpdate): void;   // { turnKey; speakerName; self: boolean | null; firstSeenAt: number; text: string }
  /** Hands out the next turn number for this page; the page agent owns it, so a later observer never reuses a key. */
  nextTurnNumber?(): number;
}
```

- **Kept or history.** An item present when a region is adopted (`attach()`), at any time, is history: registered for the activity path as today, never read, never sent. An item registered later is a kept turn, unless rule "re-binding" gives it an existing kept turn.
- **Dirty marking.** Every mutation record whose target lies in an item marks that item's kept turn dirty. A newly registered kept turn is dirty at once. No text is read in the mutation callback.
- **Throttle.** Per turn, trailing: the first change after a quiet second is read and sent immediately, in a task of its own (a zero-delay timer, so still not inside the mutation callback); further changes within `CAPTION_TEXT_THROTTLE_MS` of the last read are read and sent once at its end.
- **Read and merge.** At send time: `next = captionTextOf(item)`; `mergeCaptionText`; when `fullText` differs from what was last reported, `onText` is called with the whole text. A turn whose text is still `''` reports nothing.
- **Removal.** An item leaving the page reports nothing and cancels its timer after a last read is impossible; its kept turn stays in the observer's list for re-binding.
- **Re-binding** (research R3 rule 3). An unknown item that is not appended after the last known item, or that arrives in a batch in which a known item was removed, or that is found when a region is adopted on a page that already has kept turns, takes over the first kept turn K (in sequence order, each K used once) for which: K's element is not connected; `K.speakerName === name`; the texts are related (both non-empty, and either the item's text starts with the text K showed, or both are at least `REBIND_PREFIX_CHARS` long and share their first `REBIND_PREFIX_CHARS` characters; amended 2026-10-12, see the note under this list); every connected kept turn before the item on the page has `order < K.order` and every one after it `order > K.order`; and K's order is greater than the last take-over's higher up the page. K keeps `turnKey`, `firstSeenAt`, `kept`, `shown` and what was last reported, and is marked dirty, so a text that moved on while the element was re-created is reported and an unchanged one is not. The item's text is read for this comparison only when a kept turn of that speaker has left the page.
- **History re-created** (added with the implementation, 2026-10-12: the rule above covers kept turns only, and without this a re-render would turn what was on the page before Start into new kept turns, against FR-004). In a mutation batch, an unknown item in a re-binding situation that takes over no kept turn takes over the first history turn whose element is not connected, with the same speaker name and a consistent position (the position rule above, against every connected turn, kept or history), and stays history: never read, never sent. A history turn's text was never read, so it cannot be compared; the position rule alone tells a re-created history item from a new turn.
- **A turn's key.** A text turn takes the turn key the activity path gave its element when it was first registered, so both paths name a new turn alike. After a re-binding the text turn keeps its key while the activity path, as before, gives the new element a new one; nothing joins the two.
- **Activity path.** `onActivity`, `announced`, `latestBySpeaker`, `THROTTLE_MS` and `TURN_CLOSE_MS` are untouched; the existing `caption-observer.test.ts` and `page-timelines.test.ts` pass unchanged, with and without `onText` (FR-006).
- **`stop()`.** Takes the mutation records the page has not delivered yet (for the text path only), then reads and reports every dirty kept turn once, then disconnects.

**Amended 2026-10-12, the relation of texts in re-binding.** Before: "the texts are related (`a.startsWith(b)`, `b.startsWith(a)`, or equal first `min(REBIND_PREFIX_CHARS, shorter length)` characters, both non-empty)". That let an item showing two letters take over any kept turn of the same speaker that began with them. When no other kept turn was on the page to hold the position rule (the only turn re-created; the band back after captions were off), a new turn opening with "So" took over an earlier "So the harbour survey starts on Monday." and its text replaced the kept one: words lost, against FR-002. Now a text shorter than `REBIND_PREFIX_CHARS` relates to a kept turn only by carrying on from all of it. The cost: a re-created turn that shows less than `REBIND_PREFIX_CHARS` characters and less than it held before is kept as a second turn, so a line may appear twice; never a line lost. Tests: `caption-text-observer.test.ts` ("opens with the same word", "a short kept turn re-created"), `captions-off-on.test.ts`.

**Captions off and on, and `Show Meet captions`** (settled 2026-10-12, research R11). Both go through the rules above and add none. `Show Meet captions` only adds or removes the hiding tag on the region: no element changes, the observer keeps its region, nothing is adopted again and nothing is sent. When the user turns captions off the observer keeps running; a band that leaves the page and comes back is a region adopted again, so what it holds at that moment is history or re-binds a kept turn, and a band that is emptied in place keeps the turns that left it with their last text. Timelines for each: `tests/unit/platforms/meet/captions-off-on.test.ts`, through page agent, bridge, adapter, caption log and the captions file.

## Page agent (`src/platforms/meet/page-agent.ts`)

- Owns the turn counter for the page's life and passes `nextTurnNumber` to every observer it creates.
- Turns `onText` into `meet/caption-text` messages: per turn it remembers `sent`; `keep` is the length of the common prefix of `sent` and the new text (moved back by one when it would split a surrogate pair); `append` is the rest, cut into pieces of at most `MAX_APPEND_CHARS` (never splitting a surrogate pair), each its own message with `keep` advanced. A piece whose message would exceed `MAX_CAPTION_TEXT_MESSAGE` as JSON (text full of quotes or control characters) is halved until it fits, so every message the agent posts passes `parseFromPage`. Nothing is sent when nothing changed; a text cut back to a prefix of what was sent goes out as one message with an empty `append`.
- A new port (`attach` after the old port closed) forgets every `sent`, so each kept turn's next message has `keep: 0`. As the agent stands, a port only closes with `detach` or when the offscreen document goes away, and both stop the observer: the observer created for the new port adopts what is on the page as history, so in practice no kept turn continues across ports on the page side (what attaches next may be another meeting).
- `restore` and `detach` stop the observer, which flushes first (best effort: the offscreen side may already have ended the meeting and drops them).

## Bridge message (`src/core/messaging/meet-bridge.ts`)

```ts
| { type: 'meet/caption-text'; turnKey: string; speakerName: string; self: boolean | null; firstSeenAt: number; keep: number; append: string }
```

`parseFromPage` handles it on its own path, before the common envelope:

1. A record, `type === 'meet/caption-text'`, no secret-looking field (`containsSecretField`), JSON length ≤ `MAX_CAPTION_TEXT_MESSAGE`.
2. `turnKey` and `speakerName` as for `meet/caption`; `self` is `null` or a boolean; `firstSeenAt` finite, at most `MAX_CLOCK_SKEW_MS` ahead of `now` and at most `MAX_TURN_AGE_MS` behind it. (Amended 2026-10-12. Before: "`firstSeenAt` finite and within `MAX_CLOCK_SKEW_MS` of `now`", the rule for the time of an event. A turn's `firstSeenAt` is fixed when the turn appears and travels with every later change of its text, so that rule dropped every update of a turn first seen more than an hour before: everything one person said after the first hour of an unbroken turn, research R11. What the adapter and the log hold stays bounded by `MAX_TURN_CHARS` per turn and `MAX_CAPTION_TURNS` per meeting, not by this time. Every other time on the bridge keeps the one-hour rule.)
3. `keep` is an integer, `0 ≤ keep ≤ MAX_TURN_CHARS`; `append` is a string (may be empty) of at most `MAX_APPEND_CHARS` characters; no `text` field.
4. The parsed message is rebuilt from exactly these seven fields.

Every other message type still goes through `envelope`: an object with a `text` field, or (new) an `append` field, or over 2,048 characters, is dropped whole. `parseToPage`, `parseAttach` and `parseReadyReply` are unchanged; nothing sent **to** the page can carry text. The existing tests "a message with a `text` field is dropped" stay as they are; new tests cover the seven-field message and each rejection.

## Adapter contract, revision 3 (`src/core/platform/adapter.ts`)

```ts
/** A kept caption turn and its whole text. For storage only; naming never sees it. */
export interface CaptionText {
  turnKey: string;
  speakerName: string;
  self: boolean | null;
  /** Epoch ms when the turn first appeared. */
  firstSeenAt: number;
  text: string;
}

export type CaptionsCapability =
  | Unsupported
  | {
      supported: true;
      // … enable, restore, subscribe, subscribeState unchanged
      /** Kept turns with their text, each time it changes. Never replays; never fires for turns from before it could see them. */
      subscribeText(listener: (t: CaptionText) => void): () => void;
    };
```

`CaptionActivity` is unchanged and still has no text. `GenericAdapter` stays `Unsupported`.

`BridgedMeetAdapter`: on `meet/caption-text`, `current = texts.get(turnKey) ?? ''`; `keep > current.length` → dropped and counted (`droppedCaptionTexts(): number` on the adapter, for tests and diagnosis; not part of the platform contract), the turn untouched; else `next = current.slice(0, keep) + append`, cut to `MAX_TURN_CHARS`; stored; listeners called with the whole text. The map lives for the adapter's life and is cleared on `dispose()`. A new port changes nothing on this side. The shared contract suite (`tests/contract/platform-adapter.contract.ts`) gains: `subscribeText` returns an unsubscriber, never replays, and is absent from an unsupported capability; `tests/support/fake-meet-adapter.ts` gains a way to emit text.

## Runtime (`src/core/session/meeting-runtime.ts`)

- `followCaptions` creates a `CaptionLog` and subscribes it to `captions.subscribeText`. Events are passed on while the meeting has not ended, whatever the captions state (the page only sends while it has caption turns). They never reach the attributor, the watchdog, the segment builder, the session or a `LiveEvent`.
- `CaptionLog.onSpeaker(name)` (first kept turn of a non-self caption name): when Settings has a remembered name for it and the meeting has no rename for its key, `rename(key, { name, origin: 'remembered' })` (spec P2).
- When the store first answers a flush with `true`, the runtime sets `meeting.hasCaptions` and emits `live/captions-kept { meetingId }` once.
- `end()`: after `ended = true`, `await captionLog.close()` before `store.endMeeting`, waiting at most `CAPTIONS_CLOSE_TIMEOUT_MS` (2,000): a store that never answers does not hold up the end of the meeting, and a write that lands later is refused by the storage guard.
- `MeetingStore` gains `putCaptionTurns?(meetingId, turns: readonly StoredCaptionTurn[]): Promise<boolean>`. **Optional** (changed with the implementation, 2026-10-12; the plan had it required): a store without it keeps no captions, and the runtime then creates no `CaptionLog`, never calls `subscribeText`, applies no remembered name from captions and emits no `live/captions-kept`. This is what let the runtime merge before the offscreen wiring (T026): until the offscreen document supplied the method, a Meet meeting ran exactly as before 013. T026 added it in `src/entrypoints/offscreen/store.ts` (`offscreenStore`, the store object `main.ts` passes, split out so a test can run the host on it); nothing else in the runtime changed. It shipped in the same change as the reminder's Meet sentence (plan "Dependency on 012").

## Live port (`src/core/messaging/protocol.ts`)

```ts
| { type: 'live/captions-kept'; meetingId: string }
```

No caption text, name or count: the parser rebuilds the event from its meeting id alone. `live/snapshot` carries `meeting.hasCaptions` because it carries the meeting; the parser accepts it only as `true` or absent. Nothing else on the port changes.
