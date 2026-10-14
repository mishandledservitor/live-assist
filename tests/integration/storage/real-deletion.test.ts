// 012 T024 (FR-018, SC-003, constitution I; research R6): after deleteMeeting nothing of the meeting is in any object
// store. A pinning test: the deletion already existed before 012. It names no store, so a store added later is covered
// without an edit here, and fails until that store joins deleteMeeting's transaction.
// 013 T027 (FR-010, SC-005): each meeting also has caption turns carrying the marker sentence; none of the deleted
// meeting's is left in any store, and the other meeting keeps its turns and its `hasCaptions`.
import { beforeEach, describe, expect, it } from 'vitest';
import { NEXT_MEETING_KEY } from '@/core/chat/notes';
import { turnId, type ChatTurn } from '@/core/chat/turn';
import { speakerKey } from '@/core/transcript/labels';
import type { Meeting } from '@/core/transcript/model';
import { ChatRepo } from '@/storage/chat-repo';
import { ContextRepo } from '@/storage/context-repo';
import { openLiveAssistDb, type LiveAssistDb } from '@/storage/db';
import { MeetingRepo } from '@/storage/meeting-repo';
import { CAPTION_MARKER, CAPTION_MARKER_GREEK } from '../../support/caption-marker';
import { spokenBy, storedCaptionTurn, storedMeeting, storedSegment } from '../../support/stored-meetings';

let n = 0;
let db: LiveAssistDb;
let meetings: MeetingRepo;
let chats: ChatRepo;
let contexts: ContextRepo;

beforeEach(async () => {
  n += 1;
  db = await openLiveAssistDb(`real-deletion-test-${n}`);
  meetings = new MeetingRepo(db);
  chats = new ChatRepo(db);
  contexts = new ContextRepo(db);
});

/** Every string planted for one meeting: distinctive, so finding one anywhere means something was left behind. */
function sentinels(tag: string) {
  return {
    id: `meeting-${tag}-7f3c9e`,
    line: `LINE-SENTINEL-${tag}`,
    caption: `CAPTION-SENTINEL-${tag}`,
    override: `OVERRIDE-SENTINEL-${tag}`,
    rename: `RENAME-SENTINEL-${tag}`,
    summaryName: `SUMMARY-SENTINEL-${tag}`,
    title: `TITLE-SENTINEL-${tag}`,
    question: `QUESTION-SENTINEL-${tag}`,
    answer: `ANSWER-SENTINEL-${tag}`,
    context: `CONTEXT-SENTINEL-${tag}`,
    sent: `SENT-SENTINEL-${tag}`,
    captionText: `${CAPTION_MARKER} CAPTIONTEXT-SENTINEL-${tag}`,
    captionTextGreek: `${CAPTION_MARKER_GREEK} ΛΕΖΑΝΤΑ-${tag}`,
    captionSpeaker: `CAPTIONSPEAKER-SENTINEL-${tag}`,
    notes: `NOTES-SENTINEL-${tag}`,
    notesName: `NOTESNAME-SENTINEL-${tag}.md`,
  };
}

type Sentinels = ReturnType<typeof sentinels>;

/** A stopped meeting with everything a meeting can own, in every store that can hold it. */
async function plant(s: Sentinels, startedAt: number, notes: 'kept' | 'tombstone'): Promise<Meeting> {
  const speakerRenames: Meeting['speakerRenames'] = {};
  speakerRenames[speakerKey({ captionSelf: false, captionName: s.caption })] = { name: s.rename, origin: 'manual' };
  const meeting = storedMeeting({
    id: s.id,
    startedAt,
    endedAt: startedAt + 60_000,
    source: { url: `https://meet.google.com/${s.id}`, title: s.title, platform: 'meet' },
    speakerRenames,
  });
  // Caption turns are only written while the meeting is open (013), so it is stored open and ended afterwards.
  await meetings.createMeeting({ ...meeting, endedAt: null, endReason: null });
  await meetings.putCaptionTurns(s.id, [
    storedCaptionTurn(s.id, 1, { speakerName: s.captionSpeaker, text: s.captionText }),
    storedCaptionTurn(s.id, 2, { speakerName: 'You', self: true, text: s.captionTextGreek }),
    storedCaptionTurn(s.id, 3, { speakerName: s.captionSpeaker, text: `${s.captionText} again` }),
  ]);
  await meetings.endMeeting(s.id, startedAt + 60_000, 'user-stop');
  await meetings.appendSegment(storedSegment(s.id, 0, { ...spokenBy(s.caption), text: `${s.line} one` }));
  await meetings.appendSegment(storedSegment(s.id, 1, { text: `${s.line} two`, labelOverride: s.override }));
  await meetings.appendSegment(storedSegment(s.id, 2, { text: `${s.line} three` }));
  await meetings.summarise(s.id, () => ({ v: 1, names: [s.summaryName], fileLines: 3, lastLineEndMs: 5_500 }));
  for (let seq = 0; seq < 3; seq += 1) {
    const turn: ChatTurn = {
      id: turnId(s.id, seq),
      meetingId: s.id,
      seq,
      question: `${s.question} ${seq}`,
      askedAt: startedAt + seq,
      contextBlock: `${s.context} [00:00] ${s.caption}: ${s.line} one`,
      sentLines: { [`${s.id}:mixed:0`]: `${s.sent} ${s.line} one` },
      transcriptUntilMs: 1_500,
      provider: 'anthropic',
      requestedModel: 'claude-sonnet-5-5',
      answeredBy: 'claude-sonnet-5-5',
      answer: `${s.answer} ${seq}`,
      status: seq === 2 ? 'streaming' : 'complete',
      error: null,
      updatedAt: startedAt + seq,
      schemaVersion: 1,
      notesSent: { version: 1, kind: 'added' },
    };
    await chats.putTurn(turn);
  }
  await contexts.set(s.id, { name: s.notesName, source: 'file', text: s.notes }, startedAt);
  if (notes === 'tombstone') await contexts.remove(s.id, startedAt + 1);
  return meeting;
}

/** Every record and every key of every object store, by store name, as text. */
async function dump(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(name);
    const [records, keys] = await Promise.all([tx.store.getAll(), tx.store.getAllKeys()]);
    await tx.done;
    out[name] = JSON.stringify({ keys, records });
  }
  return out;
}

const PENDING = { name: 'next-agenda.md', source: 'file' as const, text: 'PENDING-NOTES-SENTINEL' };

describe.each([
  { deleted: 'kept', other: 'tombstone' },
  { deleted: 'tombstone', other: 'kept' },
] as const)('deleteMeeting of a meeting whose notes are $deleted', ({ deleted, other }) => {
  const a = sentinels('A');
  const b = sentinels('B');

  beforeEach(async () => {
    await plant(a, 1_000_000, deleted);
    await plant(b, 2_000_000, other);
    await contexts.set(NEXT_MEETING_KEY, PENDING, 5);
  });

  it('plants every sentinel somewhere before the delete, so the scan below can fail', async () => {
    const before = Object.values(await dump()).join('\n');
    const { notes, notesName, ...always } = a;
    for (const value of Object.values(always)) expect(before).toContain(value);
    if (deleted === 'kept') for (const value of [notes, notesName]) expect(before).toContain(value);
  });

  it('leaves nothing of the meeting in any object store', async () => {
    await meetings.deleteMeeting(a.id);
    const stores = await dump();
    expect(Object.keys(stores).length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(stores)).toContain('captionTurns');
    for (const [store, text] of Object.entries(stores)) {
      for (const [what, value] of Object.entries(a)) {
        expect(text.includes(value), `${what} of the deleted meeting found in "${store}"`).toBe(false);
      }
    }
  });

  it('leaves the other meeting and the notes for the next meeting complete', async () => {
    const before = await dump();
    await meetings.deleteMeeting(a.id);
    const after = await dump();

    expect(await meetings.getMeeting(b.id)).toMatchObject({ id: b.id, summary: { names: [b.summaryName] } });
    expect((await meetings.listSegments(b.id)).map((s) => s.text)).toEqual([
      `${b.line} one`,
      `${b.line} two`,
      `${b.line} three`,
    ]);
    expect((await chats.listTurns(b.id)).map((t) => t.answer)).toEqual([0, 1, 2].map((i) => `${b.answer} ${i}`));
    expect(await contexts.get(b.id)).toMatchObject({ notes: other === 'kept' ? { text: b.notes } : null });
    expect((await meetings.listCaptionTurns(b.id)).map((t) => t.text)).toEqual([
      b.captionText,
      b.captionTextGreek,
      `${b.captionText} again`,
    ]);
    expect(await meetings.getMeeting(b.id)).toMatchObject({ hasCaptions: true });
    expect(await meetings.listCaptionTurns(a.id)).toEqual([]);
    expect(await contexts.get(NEXT_MEETING_KEY)).toMatchObject({ notes: { text: 'PENDING-NOTES-SENTINEL' } });

    // Nothing of B changed: every one of its records is byte for byte what it was.
    for (const name of Object.keys(before)) {
      const keep = (text: string) =>
        (JSON.parse(text) as { records: unknown[] }).records.filter((r) => !JSON.stringify(r).includes(a.id));
      expect(keep(after[name] ?? ''), name).toEqual(keep(before[name] ?? ''));
    }
  });
});
