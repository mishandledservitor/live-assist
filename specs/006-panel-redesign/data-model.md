# Data model: Side-panel redesign

No stored data changes. Three view-level shapes and one core type change.

## PanelScreen (panel state, not persisted)

`'setup' | 'main' | 'settings'`

- `setup` while `settings.firstRunComplete` is false (unchanged 001 flow).
- `main` on every panel open after setup.
- `main → settings`: gear, or credits badge (with `focus: 'account'`).
- `settings → main`: Back, or Escape outside a text field / select. Focus returns to the gear.
- Entering `settings` cancels an open consent reminder; it never sends a meeting command.

## StatusDot (derived, `statusDots(snapshot)`)

| Field | Type | Rule |
|-------|------|------|
| `key` | `'capture' \| 'transcription' \| 'speakerNames' \| 'mic'` | fixed order |
| `label` | string | `Capture`, `Transcription`, `Speaker names`, `Microphone` (K21) |
| `tone` | `'ok' \| 'busy' \| 'idle' \| 'error'` | as today's `StatusBar` rows |
| `text` | string | state text with ` — {reason}` when a reason exists; strings per copy review (K21, R5–R8, R11, R12) |
| `action` | `'allow-mic'` or absent | present only for mic `unavailable` |

`problems` = the dots in tone `error`, plus the speaker-names dot when its state is `unavailable` while a meeting is running (constitution IV: say why every line is "Others"), plus the mic dot when its reason is `MUTE_UNREADABLE_REASON` (design decision 34: say why the user's speech is not sent); the line expands iff `problems.length > 0`. `statusDots(snapshot, { running })` takes the running flag for this rule.

State → text (after 006):

- capture: idle `Not capturing`; starting `Starting…`; active `Capturing the meeting tab`; stopped `Stopped[ — reason]`; failed `Failed — reason` (error).
- transcription: idle `Not running`; connecting `Connecting…`; active `Transcribing[ — reason]`; reconnecting `Reconnecting…[ — reason]` (busy); failed `Stopped working[ — reason]` (error); stopped `Stopped`.
- speakerNames: idle `Not running`; starting `{reason}` (busy); active `On`; degraded `Unavailable — {reason}` (error); unavailable `Not available — {reason}` (idle).
- mic: active with mute followed and no reason `Live`; active otherwise `Live — {reason}` (`Live — sent even while muted` when mute cannot be read); muted `{reason}` or `Muted — not sent` (`Not sent — can't see Meet's mute button` on Meet when the mute button can't be read, K33, a problem); off `Off`; unavailable `Not available — {reason}` (error, action).

## Core type change

`StatusSnapshot['speakerNames']['state']` gains `'idle'`; `initialStatus()` returns `{ state: 'idle', reason: '' }`. The reducer's `adapter` and `captions` events move it out of idle exactly as they move it out of `unavailable` today. The message validator (`isStatus`) is unaffected.

## CreditsBadgeView (derived, `describeBadge(reply | null, now, opts)`)

| Reply | `text` | `mark` | `name` (accessible name and tooltip) |
|-------|--------|--------|------|
| `null` (fetching first time) | `Checking plan…` | `loading` | `ElevenLabs account` |
| ok, limit > 0 | `{pct}%` (same rounding as `describeAccount`) | `ok` | `describeAccount(...).line` |
| ok, limit = 0 | `–` | `neutral` | `describeAccount(...).line` |
| error kind | `!` | `problem` | `ACCOUNT_ERROR_MESSAGES[kind]` |

While a refresh is in flight after a first reply, the previous view stays and `aria-busy` is true (as 005).
