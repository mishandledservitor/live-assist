# Data model: Turn Ask off

## Settings (`chrome.storage.local`, `src/core/settings/schema.ts`) — one field added

| Field | Type | Default | Read from storage |
|-------|------|---------|-------------------|
| `askEnabled` | boolean | `true` | `bool(raw.askEnabled, true)`: absent or not a boolean reads as on |

Written by the side panel only: the Settings tick box (`saveSettings({ askEnabled })`) and setup (`false` when finished with an empty chat key, `true` otherwise).

Unchanged and never deleted by it: the stored chat keys, `chat.provider`, `chat.models`, `chat.setupComplete`, chat turns and notes in IndexedDB.

## Panel state

| State | While Ask is off |
|-------|------------------|
| `AskArea` (draft, waiting question, chat turns view) | not mounted; unsent text and the waiting question are dropped; a streaming answer is stopped on unmount |
| Next-meeting `NotesControl` (and its paste dialog) | not mounted |
| Settings → Questions | heading and tick box only |

## States

```text
on ──untick (Settings)──▶ off   (answer streaming → chat/stop; waiting question dropped)
off ──tick (Settings)──▶ on     (stored turns, notes and key shown again)
first run ──setup, chat key empty──▶ off
first run ──setup, chat key entered──▶ on
```
