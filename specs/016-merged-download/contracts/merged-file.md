# Contract: the merged file (016)

Platform-free, in `src/core/export/`. Pure and synchronous; no clock, no I/O.

## `matchingBlocks(a, b)` — `src/core/export/matching-blocks.ts`

`matchingBlocks(a: ArrayLike<number>, b: ArrayLike<number>): Array<[i: number, j: number, size: number]>`

Exactly Python's `difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks()` for sequences of integers: non-overlapping blocks `a[i:i+size] == b[j:j+size]`, increasing in `i` and `j`, adjacent blocks joined, ending with `[a.length, b.length, 0]`. Tie-breaks as difflib's `find_longest_match`: the longest block; of equally long ones, the one starting first in `a`, then first in `b`.

## `mergedTranscript(meeting, segments, captionTurns)` — `src/core/export/merged-transcript.ts`

```ts
mergedTranscript(
  meeting: Pick<Meeting, 'userName' | 'speakerRenames'>,
  segments: readonly TranscriptSegment[],
  captionTurns: readonly StoredCaptionTurn[],
): MergedTranscript

interface MergedTranscript {
  lines: { startMs: number; speaker: string; text: string }[];  // speaker is a display name or 'Others'
  removedSegmentIds: string[];                                    // written lines left out as repeats
}
```

- Written lines are 007's: `labelPending !== true` and non-empty one-line text, in `sortSegments` order. Caption turns: non-empty one-line text, by `startMs` then `seq`.
- Steps and constants: research R2 (alignment, gaps, sentences, corrections, joining) and R3 (repeats: `K = 8`, `WINDOW = 400`, `CARRIED = 0.5`, two passes).
- With no caption word at all, every line is still merged by the rules (every word unplaced unless corrected); callers do not call it then (`mergedMeetingDownload`).

## `mergedTranscriptFile(meeting, segments, captionTurns)`

`{ name: transcriptDownloadName(meeting.startedAt), body }`. `body` is `lines.map(l => `[${exportTimestamp(l.startMs)}] ${oneLine(l.speaker)}: ${l.text}`).join('\n\n') + '\n'`, or `''` with no line. UTF-8 when saved, `\n` only, no header or footer.

Example (invented): the written lines

```text
[00:04] Others: Good morning, can everyone see the roadmap slide? Yes, it's up.
[00:11] Others: Great, so the first item is the launch date.
[00:31] Jane: Great, so the first item is the launch date.
```

with captions `Sarah Brown: Good morning can everyone see the roadmap slide`, `Alex: Yes it's up`, `Sarah Brown: Great so the first item is the launch date` (Alex being the user, Meet's "You"), give

```text
[00:04] Sarah Brown: Good morning, can everyone see the roadmap slide?

[00:04] Alex: Yes, it's up.

[00:11] Sarah Brown: Great, so the first item is the launch date.
```

(the `[00:31]` line repeats the `[00:11]` one, which the captions carry once: removed; `Yes, it's up.` is cut from Sarah's line at the sentence end and keeps the line's time.)

## `mergedMeetingDownload(source, at)` — `src/core/export/meeting-download.ts`

Same input as 013's `meetingDownload`. When `meetingFiles(source)` holds both a transcript and a captions file: `{ name: … — Transcript.txt, type: 'text/plain;charset=utf-8', data: mergedTranscriptFile(…).body }`. Otherwise: exactly `meetingDownload(source, at)` (the transcript alone, the captions alone, or null).

## Guarantees the tests hold

1. Words: the merged tokens equal the written tokens minus removed lines (every fixture, and 50 generated meetings).
2. Times: every merged time is a written line's start time.
3. Determinism: the same input gives the same lines.
4. Corrections: a corrected line is never removed and all its tokens are under its correction.
5. No caption text: a marker word present only in the captions never appears in the body.
6. Speed: a generated 15,000-word meeting merges in under 1 s, 45,000 words under 2 s (node, the development machine; research R5).
