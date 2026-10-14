# Contract: Meet bridge (content script ↔ service worker ↔ offscreen document)

All messages are a discriminated union in `src/core/messaging/meet-bridge.ts`, validated at every receiving end with `createReceiver` (001 pattern): unknown or malformed messages are dropped and counted. No message carries audio, keys or tokens.

**Caption text (amended 2026-10-12, feature 013, design decision 63)**: exactly one message, `meet/caption-text` (content script → offscreen), carries caption text, and only so that the offscreen document can store it locally with the meeting (`specs/013-captions-download/contracts/captions-capture.md` has its fields and rules). No other message may: any other message with a `text` or `append` field is dropped whole, as before. Naming is fed by `meet/caption` alone, which still carries names and timing only.

## Attach (service worker ↔ content script, one-shot messages)

| Direction | Message | Reply |
|-----------|---------|-------|
| SW → tab (`chrome.tabs.sendMessage`) | `meet/attach { meetingId; showCaptions: boolean }` — sent after `offscreen/begin` succeeds, only when the meeting's tab URL matches `BridgedMeetAdapter.matches`. `showCaptions` is Settings → `Show Meet captions` (FR-028); absent reads as `false`, a non-boolean drops the message | `{ ok: true }` (the script sets show/hide, then connects the port) |
| content script → SW (`chrome.runtime.sendMessage`) | `meet/ready {}` — on every content-script load | `{ attach: true; meetingId; showCaptions: boolean } \| { attach: false }` — `true` only when `sender.tab.id` is the running meeting's tab (`activeMeeting` in `chrome.storage.session`); `showCaptions` as in `meet/attach`, read from settings at that moment |
| SW → tab | `meet/detach {}` — on Stop / meeting end, after `offscreen/end` | `{ ok: true }` |
| SW → tab | `meet/show-captions { show: boolean }` — 2026-10-12 (FR-029, design decision 61): sent to the running meeting's Meet tab when the stored `showMeetCaptions` changes (`chrome.storage.onChanged`, area `local`, key `settings`, old and new value differ). Never sent without a running meeting on a Meet call tab. The page shows or hides the captions at once; nothing is clicked, no state is reported, the port is not touched | `{ ok: true }` |

## Port `platform:meet` (content script ⇄ offscreen document)

Opened by the content script with `chrome.runtime.connect({ name: 'platform:meet' })`; accepted only by the offscreen host (the service worker ignores the name). If the offscreen document cannot receive it (research R3, verified by the first e2e test), the service worker relays both directions unchanged.

Content script → offscreen:

| Message | Payload | When |
|---------|---------|------|
| `meet/hello` | `{ meetingId; pageId: string; inCall: boolean }` | First message on every new port. `pageId` prefixes `turnKey`s so a reloaded page never reuses one. |
| `meet/captions-state` | `CaptionsState` (platform-adapter.md) | On every change, and right after `hello`. |
| `meet/caption` | `{ turnKey; speakerName; self: boolean \| null; observedAt }` | Caption activity, ≤ 1 per turn per 250 ms (trailing event always sent). |
| `meet/mute` | `{ muted: boolean \| null; observedAt }` | On every change, and right after `hello`. |
| `meet/metadata` | `{ title?: string; meetingCode?: string }` | After `hello` and when the title changes. |
| `meet/caption-text` | `{ turnKey; speakerName; self: boolean \| null; firstSeenAt; keep; append }` | 013: a kept turn's text changed. `keep` is how many characters of the text sent so far for this turn stay, `append` what follows them. ≤ 1 per turn per 1,000 ms (trailing change always sent); never for a turn that was on the page when capture attached. For storage only. |
| `meet/call-ended` | `{ observedAt }` | Once, when the in-call controls have been gone for `CALL_GONE_MS` (4 s) after the page was in the call; `observedAt` is when they went (retest 2026-10-08, FR-024). Never in the lobby before joining. |

Offscreen → content script:

| Message | Effect |
|---------|--------|
| `meet/enable-captions` | Start the enable flow (wait for call, find button, turn on if off, hide unless the page was told to show captions). Idempotent. |
| `meet/restore-captions` | Unhide (nothing to undo when captions were shown); turn captions off only if they were off before the first enable and are still on. Idempotent. |
| `meet/detach` | Stop observers; does not restore by itself (the runtime sends `restore` first). |

## Validation limits

`speakerName` ≤ 200 chars, `turnKey` ≤ 64, `title` ≤ 300, `meetingId` UUID-shaped; numbers finite; `observedAt` within ±1 h of the receiver's clock (else dropped). Messages over 2 KB are dropped.

`meet/caption-text` (2026-10-12, 013) has its own limits, checked before anything else is done with it: the whole message ≤ 16,384 characters as JSON; `append` a string of at most 8,000 characters (it may be empty); `keep` an integer from 0 to 1,000,000; `firstSeenAt` finite and within ±1 h of the receiver's clock; `turnKey`, `speakerName` and `self` as for `meet/caption`; no secret-looking field. A longer change is sent as consecutive messages. A message that fails any check is dropped and counted, and its text is never logged.
