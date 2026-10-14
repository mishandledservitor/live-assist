# Internal API: Close transcript

## `LiveApi.latestStored` (`src/entrypoints/sidepanel/hooks/useLive.ts`)

```ts
latestStored(options?: { opening?: boolean }): Promise<{ meeting: Meeting; segments: TranscriptSegment[] } | null>;
```

- Without `opening` (or false): as 012 — the most recent stored meeting when `showsOnMain`, else null; an unreadable marker shows the meeting.
- With `opening: true`: finds the same meeting; if there is none, returns null and writes nothing. If there is one, writes the cleared moment (`now()`) and returns null; if the write rejects, returns the meeting with its segments. Its segments are not read when it is cleared.

## `useLive` (`src/entrypoints/sidepanel/hooks/useLive.ts`)

- On mount `opening` is true. In a current generation, the first `live/snapshot` sets it false; the first disconnect calls `latestStored({ opening: true })` and sets it false. Every later `latestStored` call passes no option.
- `refresh()` does not reset `opening`.

## `useChat` (`src/entrypoints/sidepanel/hooks/useChat.ts`)

- When `meetingId` changes while a turn of the previous meeting is streaming, `api.stop(turnId)` is called once for that turn.

## `CloseTranscript` (`src/entrypoints/sidepanel/components/CloseTranscript.tsx`)

```ts
interface CloseTranscriptProps {
  /** Clears the main view; rejects when it cannot be remembered. */
  close(): Promise<void>;
  /** The main view was cleared. */
  onClosed(): void;
}
```

- Renders `<button type="button" className="secondary">Close transcript</button>`; disabled while `close()` runs.
- Rejection: shows `<p role="alert">Couldn't close this transcript. Try again.</p>` beside the button; the next press clears it and tries again.
- Resolution: calls `onClosed()`.

## `App` / `MainView` (`src/entrypoints/sidepanel/App.tsx`)

- `MainView` gains `onClose: () => Promise<void>` and `onClosed: () => void`; the footer row is Download (when downloadable), Close and Delete when not running; Download only while running.
- `Panel` close: `await meetings.clearMainView()` (errors propagate to `CloseTranscript`), then `refresh()`; `onClosed` sets focus to the Transcripts control (or the gear).
