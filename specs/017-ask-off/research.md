# Research: Turn Ask off

## R1 — Where the setting lives

**Decision**: a top-level boolean `askEnabled` on `Settings` (`src/core/settings/schema.ts`), default `true`, read field by field with the existing `bool()` helper, so a stored settings object without it (every install before 017) reads as on (SC-005). Saved with `saveSettings({ askEnabled })`, the path the other tick boxes use.

**Rationale**: `saveChatSettings` rebuilds the `chat` object from three named fields, so a fourth field inside `chat` would be dropped by every provider or model change; a top-level field cannot be. The service worker never needs it (R4).

**Alternatives considered**: `chat.enabled` (dropped by `saveChatSettings`, and `parseChatSettings` deliberately keeps only three fields); deriving "off" from "no chat key" (the owner wants a switch that keeps a stored key, FR-005).

## R2 — How the main view hides Ask and notes

**Decision**: `MainView` treats `chat` and `notes` as absent while `loaded.settings.askEnabled` is false: `AskArea` (strip, box, `Ask`/`Stop`, missing-key line, model label, meeting notes) and the next-meeting `NotesControl` are not mounted. `Settings` publishes every change through `onChange`, so the hidden main view re-renders with the new value at once (FR-006).

**Rationale**: the same switch already exists (both props are optional and the main view is "as before" without them, 003 and 008), so off is exactly the pre-003 main view. Unmounting rather than hiding also drops what only that component holds: the unsent box text and the waiting question (spec edge cases, FR-007).

## R3 — An answer arriving when Ask is turned off (FR-007)

**Decision**: nothing new. Unmounting `AskArea` runs `useChat`'s cleanup from 014 (014 research R3), which sends `chat/stop` for the streaming turn; the service worker keeps what arrived as a stopped turn. The subscription is removed with the component, so the waiting question is never sent.

**Rationale**: the same rule 014 uses for `Close transcript`, already tested there; 017 adds a test that turning Ask off triggers it.

## R4 — Nothing sent while off (FR-004), and the service worker

**Decision**: the panel is the only sender of `chat/ask`; with no `AskArea` mounted it cannot send one. The service worker does not check the setting.

**Rationale**: the spec's second-window edge case says a question sent from a panel that has not yet re-read the setting is answered as today, which a service-worker refusal would contradict. Key checks (`replaceChatKey`) reach the provider only from the key fields, which are hidden while off.

## R5 — Setup with an empty chat key (FR-008, decision 102)

**Decision**: `Setup.submit` no longer refuses an empty chat key. When it is empty, no chat-key check is made and the save writes `chat.setupComplete: true` (so `App` stops sending the user to setup) and `askEnabled: false`; with a key, the save writes `askEnabled: true` as before. The confirmation step shows the existing line `Key saved on this computer only: <code>…</code>` with the ElevenLabs key when no chat key was saved. The chat-only setup (`mode="chat"`, installs from before 003) with an empty key completes at once, since there is no key to confirm. No new text (decision 102).

**Alternatives considered**: a `Skip` button (new text, against decision 102); keeping `chat.setupComplete` false and gating on `askEnabled` (changes 003's gating rule for no gain).

## R6 — Settings layout (FR-001, FR-003, decision 103)

**Decision**: `ChatSettings` renders `Questions`, then the tick box `Ask questions about the meeting`, then (only when on) the provider radios, the model select and both key sections. `App` renders `ChatRetention` on the Settings screen only when on. Nothing else in Settings moves (decision 104).

**Rationale**: the model select belongs to the provider choice (it lists that provider's models); a model with no provider would mean nothing.
