# Contract: live port and label edits (additions to 001's extension messages)

Adds to [001's extension messages](../../001-capture-live-transcript/contracts/extension-messages.md). Validators in `src/core/messaging/protocol.ts`.

## Live updates (offscreen → side panel, `live` port)

| Event | Payload | Notes |
|-------|---------|-------|
| `live/segment-updated` | `{ segment: TranscriptSegment }` | A stored segment changed (attribution resolved, or override set/cleared). Sent after the `put`. The panel replaces the segment with the same id. |
| `live/segment` (split, real call 2026-10-09) | `{ segment: TranscriptSegment }` | Unchanged event, also sent for each new piece of a split line (FR-027), after its `put`; the first piece arrives as `live/segment-updated` on the original id. The panel already appends unknown ids and orders by start time. |
| `live/labels` | `{ meetingId; speakerRenames: Meeting['speakerRenames'] }` | After any rename (manual or remembered). The panel replaces its copy. |
| `live/snapshot` | unchanged shape; `meeting` now carries `speakerRenames` | |

## Label commands (side panel → offscreen, over the same `live` port)

| Message | Payload | Effect |
|---------|---------|--------|
| `labels/rename` | `{ meetingId; speakerKey: string; name: string }` | Validates name (1–60 trimmed); sets `speakerRenames[speakerKey] = { name, origin: 'manual' }` (renaming to the key's own original label removes the entry); stores the meeting; broadcasts `live/labels`. Ignored if `meetingId` is not the running meeting. |
| `labels/override` | `{ meetingId; segmentId: string; name: string \| null }` | Sets or clears `labelOverride` on that segment; stores it; broadcasts `live/segment-updated`. |

Replies are not needed: the broadcast is the acknowledgement. Invalid commands are dropped and counted.

## When no meeting is running

`MeetingApi` (side panel) gains `renameSpeaker(meetingId, speakerKey, name)` and `overrideLine(meetingId, segmentId, name | null)`, which call `MeetingRepo.setSpeakerRename` / `MeetingRepo.setLabelOverride` directly (the path 001's Delete uses), then refresh.

## Remembered names (side panel → `SettingsStore`)

`labels/rename` with `speakerKey: 'others'` is rejected by `parseLabelCommand` and ignored by the runtime (red-team 2026-10-08): "Others" is corrected one line at a time with `labels/override` only. After a rename of a `caption:` key (never `self`), the panel calls `SettingsApi.rememberSpeakerName(captionName, displayName)` (removes the mapping when they are equal after normalisation). Settings → Remembered names uses `listSpeakerNames()`, `rememberSpeakerName()`, `forgetSpeakerName(captionName)`. The offscreen document receives the current mappings in `offscreen/begin` (new field `speakerNameMappings`), because it cannot read `chrome.storage` (001 Phase 5 note); mappings added during the meeting reach it through the `labels/rename` it already handles.

## Repository additions (`MeetingRepo`)

- `updateSegment(segment)` — `put`, same as `appendSegment` but named for intent.
- `setSpeakerRename(meetingId, key, entry | null)` — one transaction on `meetings`.
- `setLabelOverride(meetingId, segmentId, name | null)` — one transaction on `segments`.
- Reads normalise v1 records (`captionName: null`, `labelOverride: null`, `speakerRenames: {}`).
- Segments may carry `labelPending: true` (real trace 2026-10-08, design decision 37) on `live/segment` and `live/segment-updated` while their name is not settled; the panel shows "…" for them. Reads from storage drop the flag.
