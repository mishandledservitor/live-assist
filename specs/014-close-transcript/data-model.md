# Data model: Close transcript

No new entity, field, key or store.

## `mainViewClearedAt` (from 012, `chrome.storage.local`; `src/storage/main-view-store.ts`) — unchanged shape

| Value | Meaning |
|-------|---------|
| absent, or not a finite number | never cleared: the main view shows the most recent stored meeting (when no meeting runs and this is not an opening) |
| epoch ms | the moment the main view was last cleared |

Written by the side panel only, now in three cases:

| Case | Writer | Since |
|------|--------|-------|
| The meeting shown was deleted (main view or Transcripts screen) | `Panel.clearMainView` | 012 |
| `Close transcript` pressed | `Panel` close handler → `MeetingApi.clearMainView` | 014 |
| The panel opened, no meeting runs, and a stored meeting would show | `MeetingApi.latestStored({ opening: true })` | 014 |

Rule (012, unchanged): `showsOnMain(meeting, clearedAt)` → `clearedAt === null || meeting.startedAt > clearedAt`.

## Panel state

| State | Where | Lifetime |
|-------|-------|----------|
| `opening` (boolean ref) | `useLive` | true from mount until the live port's first answer in a current generation (snapshot or disconnect) |
| close failure (boolean) | `CloseTranscript` | set by a failed write, cleared by the next press |

## Main view states (014 additions)

```text
running ──Stop (panel open)──▶ stopped, shown (Download · Close · Delete, Ask works)
stopped, shown ──Close──▶ clean
stopped, shown ──panel reopened──▶ clean
stopped/interrupted, panel opened ──▶ clean (write fails → stopped, shown)
clean ──Start──▶ running
```
