import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHAT_SETTINGS,
  DEFAULT_SETTINGS,
  forgetMapping,
  isReadyToStart,
  MAX_SPEAKER_NAME_MAPPINGS,
  parseSettings,
  parseSpeakerNameMappings,
  rememberMapping,
  validateUserName,
} from '@/core/settings/schema';
import {
  MAX_KEYTERMS,
  MAX_KEYTERM_LENGTH,
  addKeyterms,
  insertKeytermList,
  normalizeKeyterms,
  planKeyterms,
  splitKeyterms,
} from '@/core/settings/keyterms';

describe('validateUserName', () => {
  it('trims and accepts 1–60 chars', () => {
    expect(validateUserName('  Alex  ')).toEqual({ ok: true, value: 'Alex' });
    expect(validateUserName('x'.repeat(60))).toEqual({ ok: true, value: 'x'.repeat(60) });
  });

  it('rejects empty and over-long names', () => {
    expect(validateUserName('   ')).toEqual({ ok: false, error: 'empty' });
    expect(validateUserName('x'.repeat(61))).toEqual({ ok: false, error: 'too-long' });
  });
});

describe('parseSettings', () => {
  it('returns defaults for missing or malformed input', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      schemaVersion: 1,
      userName: '',
      keyterms: [],
      consentReminder: true,
      firstRunComplete: false,
      headphonesNoticeDismissed: false,
      speakerNameMappings: [],
      chat: DEFAULT_CHAT_SETTINGS,
      cleanTranscript: true,
      showMeetCaptions: false,
    });
  });

  // Design decision 41 (001 FR-011b): clean transcript is on by default, existing installs included.
  it('clean transcript: on unless the user turned it off', () => {
    expect(parseSettings({ userName: 'Alex' }).cleanTranscript).toBe(true);
    expect(parseSettings({ cleanTranscript: 'no' }).cleanTranscript).toBe(true);
    expect(parseSettings({ cleanTranscript: false }).cleanTranscript).toBe(false);
  });

  // 002 FR-028 (design decision 61): Meet's captions stay hidden unless the user chose to show them.
  it('show Meet captions: off unless the user turned it on', () => {
    expect(parseSettings({ userName: 'Alex' }).showMeetCaptions).toBe(false);
    expect(parseSettings({ showMeetCaptions: 'yes' }).showMeetCaptions).toBe(false);
    expect(parseSettings({ showMeetCaptions: 1 }).showMeetCaptions).toBe(false);
    expect(parseSettings({ showMeetCaptions: true }).showMeetCaptions).toBe(true);
  });

  it('keeps valid fields and replaces invalid ones with defaults', () => {
    const parsed = parseSettings({
      schemaVersion: 1,
      userName: 'Alex',
      keyterms: ['Northwind', 42],
      consentReminder: false,
      firstRunComplete: 'yes',
      headphonesNoticeDismissed: true,
    });
    expect(parsed).toEqual({
      schemaVersion: 1,
      userName: 'Alex',
      keyterms: ['Northwind'],
      consentReminder: false,
      firstRunComplete: false,
      headphonesNoticeDismissed: true,
      speakerNameMappings: [],
      chat: DEFAULT_CHAT_SETTINGS,
      cleanTranscript: true,
      showMeetCaptions: false,
    });
  });

  it('never carries credential-like fields', () => {
    const parsed = parseSettings({ userName: 'Alex', elevenLabsApiKey: 'secret' }) as unknown as Record<
      string,
      unknown
    >;
    expect(parsed).not.toHaveProperty('elevenLabsApiKey');
  });
});

describe('isReadyToStart (FR-001)', () => {
  it('needs a name, first run complete and a key', () => {
    const ready = { ...DEFAULT_SETTINGS, userName: 'Alex', firstRunComplete: true };
    expect(isReadyToStart(ready, true)).toBe(true);
    expect(isReadyToStart(ready, false)).toBe(false);
    expect(isReadyToStart({ ...ready, userName: '' }, true)).toBe(false);
    expect(isReadyToStart({ ...ready, firstRunComplete: false }, true)).toBe(false);
  });
});

describe('normalizeKeyterms', () => {
  it('trims, drops empties and de-duplicates case-insensitively keeping the first spelling', () => {
    expect(normalizeKeyterms([' Northwind ', '', 'northwind', 'Scribe', 'SCRIBE', '  '])).toEqual([
      'Northwind',
      'Scribe',
    ]);
  });

  it('keeps over-limit terms (they are flagged, not dropped)', () => {
    const long = 'a'.repeat(MAX_KEYTERM_LENGTH + 1);
    expect(normalizeKeyterms([long])).toEqual([long]);
  });
});

describe('planKeyterms (realtime limits: 50 × 20 chars)', () => {
  it('sends valid terms and flags too-long ones', () => {
    const long = 'x'.repeat(21);
    expect(planKeyterms(['Meet', long, 'y'.repeat(20)])).toEqual({
      send: ['Meet', 'y'.repeat(20)],
      flagged: [{ term: long, reason: 'too-long' }],
    });
  });

  it('flags terms beyond the 50th valid one as too-many', () => {
    const terms = Array.from({ length: MAX_KEYTERMS + 2 }, (_, i) => `term${i}`);
    const plan = planKeyterms(terms);
    expect(plan.send).toHaveLength(MAX_KEYTERMS);
    expect(plan.flagged).toEqual([
      { term: 'term50', reason: 'too-many' },
      { term: 'term51', reason: 'too-many' },
    ]);
  });

  it('normalizes before planning', () => {
    expect(planKeyterms([' a ', 'A']).send).toEqual(['a']);
  });
});

// T055: remembered caption name → display name mappings (002 FR-022, data-model.md Settings, decision 20).
describe('speakerNameMappings', () => {
  const m = (captionName: string, displayName: string, updatedAt = 1) => ({ captionName, displayName, updatedAt });

  it('defaults to [] and survives parseSettings', () => {
    expect(parseSettings({}).speakerNameMappings).toEqual([]);
    expect(parseSettings({ speakerNameMappings: [m('Jane D.', 'Jane')] }).speakerNameMappings).toEqual([
      m('Jane D.', 'Jane'),
    ]);
  });

  it('drops invalid entries', () => {
    expect(
      parseSpeakerNameMappings([
        m('Jane D.', 'Jane'),
        'nope',
        { captionName: 'X' },
        m('', 'Empty caption'),
        m('Long', 'x'.repeat(61)),
        m('Blank', '   '),
        { captionName: 'Bad time', displayName: 'B', updatedAt: Number.NaN },
        m('Line', 'two\nlines'),
      ]),
    ).toEqual([m('Jane D.', 'Jane')]);
    expect(parseSpeakerNameMappings('nope')).toEqual([]);
  });

  it('trims display names', () => {
    expect(parseSpeakerNameMappings([m('Bob K', '  Bob  ')])).toEqual([m('Bob K', 'Bob')]);
  });

  it('is unique by normalised caption name, keeping the newest', () => {
    expect(parseSpeakerNameMappings([m('Jane  D.', 'Jane', 1), m('jane d.', 'Mary', 2)])).toEqual([
      m('jane d.', 'Mary', 2),
    ]);
  });

  it('removes a mapping equal to its caption name', () => {
    expect(parseSpeakerNameMappings([m('Jane', ' jane ')])).toEqual([]);
  });

  it(`keeps at most ${MAX_SPEAKER_NAME_MAPPINGS}, dropping the oldest`, () => {
    const many = Array.from({ length: MAX_SPEAKER_NAME_MAPPINGS + 3 }, (_, i) => m(`P${i}`, `N${i}`, 1000 - i));
    const kept = parseSpeakerNameMappings(many);
    expect(kept).toHaveLength(MAX_SPEAKER_NAME_MAPPINGS);
    expect(kept.map((x) => x.captionName)).not.toContain(`P${MAX_SPEAKER_NAME_MAPPINGS + 2}`);
    expect(kept.map((x) => x.captionName)).toContain('P0');
  });

  it('rememberMapping adds or replaces by normalised caption name; equal names remove it', () => {
    let list = rememberMapping([], 'Jane D.', 'Jane', 10);
    expect(list).toEqual([m('Jane D.', 'Jane', 10)]);
    list = rememberMapping(list, 'jane  d.', 'Mary', 20);
    expect(list).toEqual([m('jane  d.', 'Mary', 20)]);
    expect(rememberMapping(list, 'Jane D.', 'JANE D.', 30)).toEqual([]);
  });

  it('rememberMapping rejects an invalid display name', () => {
    expect(() => rememberMapping([], 'Jane D.', '', 1)).toThrow();
    expect(() => rememberMapping([], 'Jane D.', 'x'.repeat(61), 1)).toThrow();
  });

  it('forgetMapping removes by normalised caption name', () => {
    expect(forgetMapping([m('Jane D.', 'Jane'), m('Bob', 'Tom')], ' jane d. ')).toEqual([m('Bob', 'Tom')]);
  });
});

// 001 FR-004a (T118): the field for new key terms takes a list.
describe('splitKeyterms', () => {
  it('splits on line breaks (Windows ones too) and commas, trims, drops empty pieces and keeps the order', () => {
    expect(splitKeyterms(' Emma Jones \r\nJane D.\n\n Northwind, Scribe ,,\r\n ,Bluebird\n')).toEqual([
      'Emma Jones',
      'Jane D.',
      'Northwind',
      'Scribe',
      'Bluebird',
    ]);
  });

  it('leaves a single term whole, spaces and other punctuation included', () => {
    expect(splitKeyterms('  Scribe v2; beta\tone ')).toEqual(['Scribe v2; beta\tone']);
  });

  it('gives nothing for blank text', () => {
    expect(splitKeyterms(' \n , \r\n')).toEqual([]);
  });
});

describe('addKeyterms', () => {
  it('appends the new terms after the existing ones, in the order given', () => {
    expect(addKeyterms(['Northwind'], 'Scribe\nEmma, Jane')).toEqual(['Northwind', 'Scribe', 'Emma', 'Jane']);
  });

  it('collapses terms already in the list and repeats in the text, first spelling wins', () => {
    expect(addKeyterms(['Northwind'], 'northwind\nScribe\nSCRIBE, scribe')).toEqual(['Northwind', 'Scribe']);
  });

  it('keeps over-long terms and terms past the 50th, which the plan then flags', () => {
    const long = 'x'.repeat(MAX_KEYTERM_LENGTH + 1);
    const names = Array.from({ length: MAX_KEYTERMS + 1 }, (_, i) => `Name ${i}`);
    const terms = addKeyterms([], [long, ...names].join('\n'));
    expect(terms).toEqual([long, ...names]);
    expect(planKeyterms(terms)).toEqual({
      send: names.slice(0, MAX_KEYTERMS),
      flagged: [
        { term: long, reason: 'too-long' },
        { term: `Name ${MAX_KEYTERMS}`, reason: 'too-many' },
      ],
    });
  });
});

describe('insertKeytermList', () => {
  it('turns pasted lines into comma-separated text', () => {
    expect(insertKeytermList('', 0, 0, 'Emma Jones\r\nJane D.\n\nScribe\n')).toBe('Emma Jones, Jane D., Scribe');
  });

  it('puts them at the cursor, separated from what is already typed', () => {
    expect(insertKeytermList('Northwind', 9, 9, 'Emma\nJane')).toBe('Northwind, Emma, Jane');
    expect(insertKeytermList('Northwind', 0, 0, 'Emma\nJane')).toBe('Emma, Jane, Northwind');
    expect(insertKeytermList('Northwind, ', 11, 11, 'Emma\nJane')).toBe('Northwind, Emma, Jane');
  });

  it('replaces the selected text', () => {
    expect(insertKeytermList('Northwind, old, Scribe', 11, 14, 'Emma\nJane')).toBe('Northwind, Emma, Jane, Scribe');
  });
});
