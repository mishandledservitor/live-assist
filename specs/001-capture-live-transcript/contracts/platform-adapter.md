# Contract: Meeting-platform adapter

> **Superseded** by [002's revision 2 of this contract](../../002-meet-speaker-names/contracts/platform-adapter.md) (caption activity without text, captions state, timestamped mute readings, `subscribeState`). Kept as 001's record.

Constitution V: core logic never references a platform's DOM. 001 ships only `GenericAdapter` (no DOM access, no content script). 002 adds `MeetAdapter`, implemented in a content script and exposed to core through the same interface over a message bridge.

```ts
export type PlatformId = 'generic' | 'meet'; // 'zoom' | 'teams' added by their own features

export interface Unsupported { supported: false; reason: string } // reason is shown in the status area

export interface CaptionEvent {
  speakerName: string;
  text: string;
  observedAt: number; // epoch ms when the caption text was observed/updated
}

export interface PlatformAdapter {
  readonly id: PlatformId;
  /** Pure URL check; no DOM. */
  matches(url: URL): boolean;

  /** Captions: turn on and hide the overlay; restore on stop. */
  captions: Unsupported | {
    supported: true;
    enable(): Promise<void>;
    restore(): Promise<void>;
    subscribe(listener: (e: CaptionEvent) => void): () => void;
  };

  /** Mute state of the user's mic in the meeting. */
  mute: Unsupported | {
    supported: true;
    current(): boolean | null;                         // null = unknown right now
    subscribe(listener: (muted: boolean | null) => void): () => void;
  };

  /** Meeting metadata, best effort. */
  metadata(): Promise<{ title?: string; meetingCode?: string }>;

  dispose(): void;
}

export interface PlatformRegistry {
  /** First adapter whose matches() is true; GenericAdapter always matches last. */
  forUrl(url: URL): PlatformAdapter;
}
```

## `GenericAdapter` (001)

- `id: 'generic'`, `matches` → always `true` (registered last).
- `captions` → `{ supported: false, reason: 'No speaker-name support for this site yet — every line is labelled "Others".' }` (revised 2026-10-08 for the single mixed stream).
- `mute` → `{ supported: false, reason: 'This site\'s mute state cannot be read.' }`.
- `metadata()` → `{}` (title comes from the tab).

## Core consumers

- Status: `speakerNames` = `unavailable` + `captions.reason` when unsupported (FR-020, Principle IV).
- Mic status: with `mute` unsupported (all sites in 001) the mic is mixed in continuously and the status shows `muteFollowed: false` with the adapter's reason (FR-021). 002 subscribes to `mute` and drives 002's mute gate (`src/core/session/mute-gate.ts`): the capture delivers paired tab/mic frames, the gate holds both 500 ms and silences mic frames overlapping a muted span (on Meet also while the mute state can't be read — decision 34), and `mixFrames` sums the pair in JS before the session; 001's `MixedSourceHandle.setMicGate` GainNode gate was removed in 002 T049.

## Tests

A shared adapter contract suite (`tests/contract/platform-adapter.contract.ts`) that every adapter runs: `matches` purity, unsupported capabilities carry a non-empty reason, `dispose` idempotent, subscribe returns a working unsubscribe. DOM adapters (002+) additionally run against saved page snapshots (Constitution III).
