// 013 T040 (FR-012, FR-013, FR-017, FR-018, decisions 67–70, spec P5; data-model.md "Files" table): what one press of
// `Download transcript` saves. Nothing, the one file a meeting has as text, or a zip of both. Every caption sentence is
// invented.
import { describe, expect, it } from 'vitest';
import { meetingDownload } from '@/core/export/meeting-download';
import { meetingFiles } from '@/core/export/meeting-files';
import { zipStored } from '@/core/export/zip';
import { spokenBy, storedCaptionTurn, storedMeeting, storedSegment } from '../../../support/stored-meetings';

const utf8 = (text: string) => new TextEncoder().encode(text);
const AT = new Date(2026, 9, 12, 9, 41, 30);

const meeting = storedMeeting();
const segments = [storedSegment('m1', 0, { ...spokenBy('Jane'), text: 'Καλημέρα, let us start.' })];
const captionTurns = [
  storedCaptionTurn('m1', 1, { speakerName: 'Jane', text: 'Καλημέρα, ας ξεκινήσουμε — the harbour survey first.' }),
];

describe('meetingDownload', () => {
  it('neither a transcript line nor a caption turn: null', () => {
    expect(meetingDownload({ meeting, segments: [] }, AT)).toBeNull();
    expect(meetingDownload({ meeting, segments: [], captionTurns: [] }, AT)).toBeNull();
  });

  it('transcript only: the transcript as text under "— Transcript.txt"', () => {
    const [transcript] = meetingFiles({ meeting, segments });
    expect(meetingDownload({ meeting, segments }, AT)).toEqual({
      name: 'Meeting — 07-10-2026 at 14h30 — Transcript.txt',
      type: 'text/plain;charset=utf-8',
      data: transcript!.body,
    });
    expect(meetingDownload({ meeting, segments, captionTurns: [] }, AT)?.data).toBe(
      '[00:00] Jane: Καλημέρα, let us start.\n',
    );
  });

  it('captions only: the captions file as text under "— Meet captions.txt"', () => {
    expect(meetingDownload({ meeting, segments: [], captionTurns }, AT)).toEqual({
      name: 'Meeting — 07-10-2026 at 14h30 — Meet captions.txt',
      type: 'text/plain;charset=utf-8',
      data: '[00:04] Jane: Καλημέρα, ας ξεκινήσουμε — the harbour survey first.\n',
    });
  });

  it('both: a zip named after the meeting, holding the two UTF-8 bodies in order, stamped with the given moment', () => {
    const [transcript, captions] = meetingFiles({ meeting, segments, captionTurns });
    const download = meetingDownload({ meeting, segments, captionTurns }, AT);
    expect(download?.name).toBe('Meeting — 07-10-2026 at 14h30.zip');
    expect(download?.type).toBe('application/zip');
    expect(download?.data).toBeInstanceOf(Uint8Array);
    expect(download?.data).toEqual(
      zipStored(
        [
          { name: 'Meeting — 07-10-2026 at 14h30 — Transcript.txt', data: utf8(transcript!.body) },
          { name: 'Meeting — 07-10-2026 at 14h30 — Meet captions.txt', data: utf8(captions!.body) },
        ],
        AT,
      ),
    );
    // No byte-order mark in either body.
    const bytes = download!.data as Uint8Array;
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    expect(text).not.toContain('﻿');
  });

  it('is pure: the same source and moment give the same bytes, another moment other bytes of the same length', () => {
    const source = { meeting, segments, captionTurns };
    const before = structuredClone(source);
    const first = meetingDownload(source, AT)!.data as Uint8Array;
    const second = meetingDownload(source, new Date(AT.getTime()))!.data as Uint8Array;
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    const later = meetingDownload(source, new Date(2026, 9, 13, 18, 2, 10))!.data as Uint8Array;
    expect(later).toHaveLength(first.length);
    expect(later).not.toEqual(first);
    expect(source).toEqual(before);
  });
});
