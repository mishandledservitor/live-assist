# Contract: Meeting-platform adapter (revision 2, feature 002)

Revises [001's contract](../../001-capture-live-transcript/contracts/platform-adapter.md). Constitution V: core never references a platform's DOM. Changes from revision 1:

- `CaptionEvent` loses `text` and gains `turnKey` and `self` — the caption text is never read or transported (FR-004, research R5). Renamed `CaptionActivity`. (Amended 2026-10-12, feature 013: revision 3 of the contract adds `captions.subscribeText`, a separate stream of kept turns with their text, for storage only; `CaptionActivity` is unchanged and still has no text. `specs/013-captions-download/contracts/captions-capture.md`.)
- `captions` gains `subscribeState` — a supported capability can still fail at runtime, and core must show why (FR-010, FR-013).
- `mute` readings carry `observedAt`, so the mute gate can silence frames captured after the real mute moment (FR-014, research R8).
- `enable()` resolves when the request is under way, not when captions are on; the outcome arrives through `subscribeState` (the user may still be in the lobby).

```ts
export type PlatformId = 'generic' | 'meet';

export interface Unsupported { supported: false; reason: string }

/** One caption turn showed activity. Names and timing only — never text. */
export interface CaptionActivity {
  turnKey: string;          // stable per caption item for the page's life
  speakerName: string;      // whitespace-normalised, as the platform shows it
  self: boolean | null;     // the platform labels this turn as the user's own (how the user's lines are named, decision 29); null = cannot tell
  observedAt: number;       // epoch ms
}

export type CaptionsState =
  | { state: 'starting'; reason: string }      // e.g. "Turning on Meet captions…", "Join the call to get speaker names"
  | { state: 'on' }
  | { state: 'unavailable'; reason: string }   // couldn't turn on / can't read / page not connected
  | { state: 'off-by-user'; reason: string };  // "Captions were turned off"

export interface MuteReading {
  muted: boolean | null;    // null = cannot be read right now
  observedAt: number;       // epoch ms when the page state was observed
}

export interface PlatformAdapter {
  readonly id: PlatformId;
  matches(url: URL): boolean;   // pure; no DOM

  captions: Unsupported | {
    supported: true;
    enable(): Promise<void>;    // turn on if off, hide the overlay (Meet: unless Settings → Show Meet captions is on, which the page is told directly — see below); remembers the prior state
    restore(): Promise<void>;   // put captions and overlay back as they were before enable(); idempotent
    subscribe(listener: (e: CaptionActivity) => void): () => void;
    subscribeState(listener: (s: CaptionsState) => void): () => void;   // replays the current state on subscribe
  };

  mute: Unsupported | {
    supported: true;
    current(): MuteReading;
    subscribe(listener: (r: MuteReading) => void): () => void;
  };

  // Retest 2026-10-08 (FR-024, design decision 36). Absent on platforms that cannot tell (GenericAdapter).
  call?: {
    subscribeEnded(listener: (observedAt: number) => void): () => void;   // called once: the user left the call
  };

  metadata(): Promise<{ title?: string; meetingCode?: string }>;
  dispose(): void;              // idempotent; detaches from the page, restores nothing by itself
}
```

`MeetingRuntime` ends the meeting with `call-ended` when `call` reports the call ended: as Stop, the transcript is kept and captions are restored; the capture status reads "Stopped — the call ended".

## `GenericAdapter`

Unchanged behaviour; the unsupported `captions` reason becomes "Speaker names are available on Google Meet only — every line is labelled \"Others\"." (FR-012).

## `BridgedMeetAdapter` (core, `src/core/platform/meet-bridge-adapter.ts`)

- `id: 'meet'`; `matches(url)` → `url.protocol === 'https:' && url.hostname === 'meet.google.com' && /^\/(meet\/)?[a-z]{3}-[a-z]{4}-[a-z]{3}(\/|$)/.test(url.pathname)` (a call URL, `/abc-defg-hij` or, since October 2026, `/meet/abc-defg-hij`, decision 101; the Meet landing page does not match and gets the generic adapter).
- Built with a `BridgeConnector` (injected; the offscreen host supplies ports named `platform:meet`). Implements the capabilities by sending and receiving [meet-bridge](meet-bridge.md) messages; validates every inbound message and drops unknown ones.
- Before a port arrives: `captions` state `starting` ("Connecting to the Meet page…"), `mute.current()` = `{ muted: null }`. No port within `ATTACH_TIMEOUT_MS` (5 s) → `unavailable`, "Couldn't connect to the Meet page — reload the Meet tab".
- Deadline: if captions are neither `on` nor in the lobby (`starting` with the lobby reason) by `NAMES_DEADLINE_MS` (9 s) after `enable()`, the state becomes `unavailable` with the latest reason ("Couldn't connect to the Meet page — reload the Meet tab" or "Couldn't turn on Meet captions"); a later `on` still recovers (SC-003).
- Port lost: captions `unavailable` ("The Meet page reloaded — reconnecting…"), mute reading `null`; a new port replaces it and the content script replays its state; `enable()` is re-sent automatically if it had been requested.
- `restore()` and `dispose()` send `meet/restore-captions` / `meet/detach` if a port is open; they never throw.

## Meet content script (`src/entrypoints/meet.content/`, `src/platforms/meet/`)

The DOM half. Its contract is the bridge protocol plus [meet-dom.md](meet-dom.md). It is idle until attached and never sends anything off the machine. Until 2026-10-12 it never read caption text; from feature 013 it reads it for the stored captions only.

Show or hide (2026-10-12, FR-028–FR-030, design decision 61) is not part of the adapter contract: the TypeScript interface above is unchanged, core never learns the value, and `BridgedMeetAdapter` sends the same messages in both modes. The service worker tells the content script (meet-bridge.md "Attach"), and `enable()` / `restore()` mean the same thing either way.

## Tests

- The shared contract suite (`tests/contract/platform-adapter.contract.ts`) runs on `GenericAdapter` and on `BridgedMeetAdapter` over a fake port; it gains: `subscribeState` replays current state, `restore` idempotent, `mute.current()` returns a reading with `observedAt`.
- The Meet DOM half runs against saved page snapshots (meet-dom.md).
