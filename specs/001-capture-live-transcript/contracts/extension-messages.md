# Contract: Extension messages (side panel ↔ service worker ↔ offscreen)

All cross-context messages are a discriminated union in `src/core/messaging/protocol.ts`, validated at the receiving boundary (unknown or malformed messages are dropped and counted, never thrown into the UI). Keys never appear in any message. Tokens appear in exactly one place: the reply to the offscreen document's `credentials/transcription-token` request (below), which goes only to that document and is never broadcast or logged.

## Commands (side panel → service worker)

| Message | Payload | Result |
|---------|---------|--------|
| `meeting/start` | `{ tabId: number; language: LanguageMode }` | `{ ok: true; meetingId } \| { ok: false; error: StartError }` |
| `meeting/stop` | `{}` | `{ ok: true }` |
| `settings/validate-key` | `{}` — the panel first writes the candidate to the top-level `chrome.storage.local` key `pendingCredential` via `PanelSettingsStore.writePendingKey` (a single `set`, no read; revised red-team 2026-10-08 — it used to merge into `credentials`, which read the saved key); the service worker reads it, validates it with `LocalKeyCredentialSource`, promotes it into `credentials.elevenLabsApiKey` on success, and removes `pendingCredential` either way, so an invalid key is never kept and no key travels in a message | `{ ok: true; hint: string } \| { ok: false; kind: CredentialErrorKind }` |
| `settings/key-hint` | `{}` — added red-team 2026-10-08: the panel never reads credentials; the service worker reads the saved key and returns only its last four characters | `{ hint: string \| null }` (the panel treats any other reply as `null`) |

**The panel never reads the key** (FR-003a, decision 31): side-panel code gets settings through `PanelSettingsStore`, which can read `settings` and write (never read) `pendingCredential`, and remove `credentials` (a delete, no read). It has no method that reads `credentials` or `pendingCredential`; ESLint forbids side-panel code importing `src/storage/settings-store` (the full store), and `tests/unit/sidepanel/settings-api.test.ts` runs every panel path against a storage fake that throws on any read of those keys.
| `account/usage` | `{}` — added by 005: the service worker fetches the ElevenLabs account status with the saved key; see `specs/005-account-usage/contracts/account-messages.md` | `{ ok: true; usage: { tier; creditsUsed; creditsLimit; resetAt } } \| { ok: false; kind: AccountErrorKind }` |

| `settings/chat-key-hints`, `settings/validate-chat-key` | added by 003: the chat-key counterparts of `settings/key-hint` and `settings/validate-key`, per provider; see `specs/003-ask-the-transcript/contracts/chat-messages.md` | last four characters, or a check result |

Questions and answers (003) travel over a separate port named `chat` (side panel ↔ service worker, one port per question); see `specs/003-ask-the-transcript/contracts/chat-messages.md`.

`StartError` = `'settings-incomplete' | 'not-invoked' | 'tab-not-capturable' | 'already-running' | 'offscreen-failed'`, each with a user-facing message in the panel (edge cases in spec). `already-running` includes the running tab's title.

## Credential requests (offscreen → service worker)

Added 2026-10-08 (Phase 5): offscreen documents get only `chrome.runtime` — no `chrome.storage` — so they cannot read the key. The service worker answers only its own offscreen document (sender id and URL checked).

| Message | Reply |
|---------|-------|
| `credentials/transcription-token` | `{ ok: true; credential: { token; expiresAt } } \| { ok: false; kind: CredentialErrorKind }` — a fresh single-use token minted by `LocalKeyCredentialSource` in the service worker |
| `credentials/status` | `{ configured: boolean; hint?: string }` |

Added 2026-10-08 (Phase 6): when the meeting ends without the service worker asking (the tab stream failed for good, FR-022), the offscreen document tells it so the document is closed and the running meeting forgotten; otherwise the next Start would be refused as `already-running`.

| Message | Reply |
|---------|-------|
| `offscreen/ended` `{ reason: EndReason }` | `{ ok: true }` — accepted only from the offscreen document |

The service worker forgets the running meeting at once but closes the document only after 30 s (`OFFSCREEN_LINGER_MS`), so a panel that connects late still receives the final `live/snapshot` with the failure reason; a Start in that window reuses the document.

## Internal (service worker → offscreen)

| Message | Payload |
|---------|---------|
| `offscreen/begin` | `{ meetingId; tabStreamId: string; language; keyterms; userName; source: { url; title } }` — the offscreen document opens the tab with `tabStreamId` and the mic, mixes them and runs one session; `userName` is snapshotted into the meeting for 002 → `{ ok: true } \| { ok: false; message }` (`source` added 2026-10-08 in Phase 5: the meeting record needs the tab's title and address, and only the service worker can read them) |
| `offscreen/end` | `{ reason: EndReason }` → `{ ok: true }` |

The service worker creates the offscreen document on Start (if missing), forwards `tabStreamId` immediately (it expires within seconds), and closes the document after `offscreen/end` completes. The running meeting (id, tab id, title, origin) is kept in `chrome.storage.session` so a suspended service worker still knows it on wake. It also listens to `tabs.onRemoved` / `tabs.onUpdated` (URL origin change) for the captured tab and sends `offscreen/end` with `tab-closed` / `tab-navigated` (FR-023).

## Live updates (offscreen → side panel, over a `runtime.connect` port named `live`)

| Event | Payload |
|-------|---------|
| `live/snapshot` | `{ meeting: Meeting \| null; segments: TranscriptSegment[]; partials: Partial[]; status: StatusSnapshot }` — sent on connect, and again to every connected panel when the meeting ends (carries `endedAt`/`endReason`; added 2026-10-08 after an auth error ending the meeting during begin left a connected panel offering Stop) |
| `live/segment` | `{ segment: TranscriptSegment }` — after it is stored |
| `live/partial` | `{ stream; text }` — `stream` is always `mixed` (one session, revised 2026-10-08) |
| `live/status` | `{ status: StatusSnapshot }` |

When no offscreen document exists (no meeting running), the panel reads the most recent meeting from IndexedDB directly and shows status `idle`.
