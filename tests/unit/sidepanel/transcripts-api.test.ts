// 012 T009 (contracts/internal-api.md "transcripts-api.ts"): what the Transcripts screen reads and deletes, over the
// meeting repository the panel already has.
import { describe, expect, it, vi } from 'vitest';
import type { StoredCaptionTurn } from '@/core/captions/model';
import { summariseMeeting } from '@/core/history/meeting-summary';
import type { Meeting, MeetingSummary, TranscriptSegment } from '@/core/transcript/model';
import { createTranscriptsApi } from '@/entrypoints/sidepanel/transcripts-api';
import { meetingWithCaptions, storedCaptionTurn, storedMeeting, storedSegment } from '../../support/stored-meetings';

function setup() {
  const a = storedMeeting({ id: 'a' });
  const b = storedMeeting({ id: 'b', startedAt: a.startedAt - 86_400_000 });
  const lines = [storedSegment('a', 0), storedSegment('a', 1)];
  const summary: MeetingSummary = { v: 1, names: ['Jane'], fileLines: 2, lastLineEndMs: 3_500 };
  const withCaptions = meetingWithCaptions({ id: 'cap' });
  const turns = [storedCaptionTurn('cap', 1), storedCaptionTurn('cap', 2)];
  const repo = {
    listMeetings: vi.fn(() => Promise.resolve([a, b])),
    summarise: vi.fn((_id: string, _compute: (m: Meeting, s: TranscriptSegment[]) => MeetingSummary) =>
      Promise.resolve<MeetingSummary | null>(summary),
    ),
    getMeeting: vi.fn((id: string) => Promise.resolve(id === 'a' ? a : id === 'cap' ? withCaptions : undefined)),
    listSegments: vi.fn((_id: string) => Promise.resolve(lines)),
    listCaptionTurns: vi.fn((_id: string) => Promise.resolve<StoredCaptionTurn[]>(turns)),
    deleteMeeting: vi.fn((_id: string) => Promise.resolve()),
  };
  const api = createTranscriptsApi({ repo: () => Promise.resolve(repo) });
  return { api, repo, a, b, lines, summary, withCaptions, turns };
}

describe('createTranscriptsApi', () => {
  it('list returns the repository list as it is, newest first', async () => {
    const { api, a, b } = setup();
    expect(await api.list()).toEqual([a, b]);
  });

  it('list rejects when the repository cannot be read, or cannot be opened', async () => {
    const { api, repo } = setup();
    repo.listMeetings.mockRejectedValueOnce(new Error('read failed'));
    await expect(api.list()).rejects.toThrow('read failed');
    const closed = createTranscriptsApi({ repo: () => Promise.reject(new Error('no database')) });
    await expect(closed.list()).rejects.toThrow('no database');
  });

  it('summarise has the repository work out and keep the row details with the core rule', async () => {
    const { api, repo, summary } = setup();
    expect(await api.summarise('a')).toEqual(summary);
    expect(repo.summarise).toHaveBeenCalledTimes(1);
    expect(repo.summarise).toHaveBeenCalledWith('a', summariseMeeting);
    repo.summarise.mockResolvedValueOnce(null);
    expect(await api.summarise('gone')).toBeNull();
  });

  it('open returns the meeting with every line, and null when the meeting is gone', async () => {
    const { api, repo, a, lines } = setup();
    expect(await api.open('a')).toEqual({ meeting: a, segments: lines, captionTurns: [] });
    expect(repo.listSegments).toHaveBeenCalledWith('a');
    expect(await api.open('gone')).toBeNull();
    expect(repo.listSegments).toHaveBeenCalledTimes(1);
  });

  // 013 T047 (contracts/files-and-storage.md "transcripts-api.ts").
  it('open returns the kept caption turns of a meeting that has them', async () => {
    const { api, repo, withCaptions, lines, turns } = setup();
    expect(await api.open('cap')).toEqual({ meeting: withCaptions, segments: lines, captionTurns: turns });
    expect(repo.listCaptionTurns.mock.calls).toEqual([['cap']]);
  });

  it('open never reads the caption store for a meeting without kept captions, nor for one that is gone', async () => {
    const { api, repo } = setup();
    await api.open('a');
    await api.open('gone');
    expect(repo.listCaptionTurns).not.toHaveBeenCalled();
  });

  it('open rejects when the caption turns cannot be read: a download then saves nothing', async () => {
    const { api, repo } = setup();
    repo.listCaptionTurns.mockRejectedValueOnce(new Error('read failed'));
    await expect(api.open('cap')).rejects.toThrow('read failed');
  });

  it('remove is one real deletion of that meeting', async () => {
    const { api, repo } = setup();
    await api.remove('b');
    expect(repo.deleteMeeting.mock.calls).toEqual([['b']]);
    repo.deleteMeeting.mockRejectedValueOnce(new Error('blocked'));
    await expect(api.remove('a')).rejects.toThrow('blocked');
  });
});
