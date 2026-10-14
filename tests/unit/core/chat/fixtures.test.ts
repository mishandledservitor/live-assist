// 003 T002/T003: the chat fixtures are well-formed, so a later failure points at code, not at a broken fixture.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLive } from '@/core/messaging/protocol';
import { formatOffset } from '@/core/transcript/model';

const DIR = join(import.meta.dirname, '../../../fixtures/chat');
const read = (path: string): unknown => JSON.parse(readFileSync(join(DIR, path), 'utf8'));
const list = (sub: string) => readdirSync(join(DIR, sub)).filter((f) => f.endsWith('.json'));

const status = {
  capture: { state: 'idle' },
  transcription: { state: 'idle', reconnects: 0 },
  speakerNames: { state: 'inactive' },
  mic: { state: 'unknown' },
  retention: { state: 'ok' },
};

/** Meeting fixtures must pass the same validator the panel applies to stored meetings and segments. */
const validMeeting = (m: unknown, segments: unknown) =>
  parseLive({ type: 'live/snapshot', meeting: m, segments, partials: [], status }) !== null;

describe('chat meeting fixtures (T003)', () => {
  it.each(list('meetings'))('%s holds a stored-shape meeting and segments', (file) => {
    const f = read(`meetings/${file}`) as { meeting: unknown; segments: unknown; after?: typeof f };
    expect(validMeeting(f.meeting, f.segments)).toBe(true);
    if (f.after) expect(validMeeting(f.after.meeting, f.after.segments)).toBe(true);
  });

  it('standup-en has three named speakers, "Others" lines, the user\'s own lines and the cited times', () => {
    const { segments } = read('meetings/standup-en.json') as {
      segments: { speakerLabel: string; captionSelf: boolean; labelSource: string; startMs: number }[];
    };
    const named = new Set(
      segments.filter((s) => s.labelSource === 'caption' && !s.captionSelf).map((s) => s.speakerLabel),
    );
    expect(named.size).toBe(3);
    expect(segments.some((s) => s.labelSource === 'fallback')).toBe(true);
    expect(segments.some((s) => s.captionSelf)).toBe(true);
    const times = segments.map((s) => formatOffset(s.startMs));
    for (const t of ['00:12', '01:10', '02:00', '03:45', '04:02', '07:30', '12:40']) expect(times).toContain(t);
  });

  it('long-1h20 has lines past one hour', () => {
    const { segments } = read('meetings/long-1h20.json') as { segments: { startMs: number }[] };
    expect(segments.map((s) => formatOffset(s.startMs))).toEqual(expect.arrayContaining(['1:05:12', '1:15:12']));
  });

  it('empty has a meeting and no segments', () => {
    expect((read('meetings/empty.json') as { segments: unknown[] }).segments).toEqual([]);
  });
});

describe('chat provider fixtures (T002)', () => {
  const files = [...list('anthropic').map((f) => `anthropic/${f}`), ...list('openai').map((f) => `openai/${f}`)];

  it.each(files)('%s is { status, headers, body } with a description', (file) => {
    const f = read(file) as Record<string, unknown>;
    expect(typeof f.description).toBe('string');
    expect(typeof f.status).toBe('number');
    expect(typeof f.headers).toBe('object');
    expect(typeof f.body).toBe('string');
    if (f.reject === true) expect(f.status).toBe(0);
    else if (
      f.status === 200 &&
      String((f.headers as Record<string, string>)['content-type']).startsWith('text/event-stream')
    )
      for (const block of (f.body as string).split('\n\n').filter(Boolean)) {
        const [event, data] = block.split('\n');
        expect(event).toMatch(/^event: [\w.]+$/);
        expect(() => JSON.parse((data ?? '').replace(/^data: /, '')) as unknown).not.toThrow();
      }
    else expect(() => JSON.parse(f.body as string) as unknown).not.toThrow();
  });

  it.each(['anthropic', 'openai'])(
    '%s covers every contract case except C4 (Anthropic only) and C13 (all errors)',
    (p) => {
      const cases = new Set(list(p).map((f) => f.slice(0, 3)));
      const expected = ['c01', 'c02', 'c03', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10', 'c11', 'c12', 'c14'];
      if (p === 'anthropic') expected.push('c04');
      for (const c of expected) expect(cases, c).toContain(c);
    },
  );
});
