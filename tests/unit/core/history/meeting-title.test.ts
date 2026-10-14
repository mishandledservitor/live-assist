// 012 T053 (FR-029, design decision 76; spec Clarifications E2, data-model.md "Display title"): the title a
// Transcripts row shows, worked out from the tab title stored at Start. One case per form the spec lists.
import { describe, expect, it } from 'vitest';
import { displayTitle } from '@/core/history/meeting-title';
import type { Meeting } from '@/core/transcript/model';

const MEET_URL = 'https://meet.google.com/abc-defg-hij';

const onMeet = (title: string): Meeting['source'] => ({ url: MEET_URL, title, platform: 'meet' });
const elsewhere = (title: string, url = 'https://example.com/call'): Meeting['source'] => ({
  url,
  title,
  platform: 'generic',
});

describe('displayTitle on a Meet call', () => {
  it.each([
    ['Meet - Weekly sync', 'Weekly sync'],
    ['Meet – Budget review', 'Budget review'],
    ['Meet — Budget review', 'Budget review'],
    ['Meet - Εβδομαδιαία συνάντηση', 'Εβδομαδιαία συνάντηση'],
    ['Weekly sync', 'Weekly sync'],
    ['Meet-up planning', 'Meet-up planning'],
    ['Meeting notes - Q4', 'Meeting notes - Q4'],
    ['Meet - Plan - part 2', 'Plan - part 2'],
    ['Meet - Meet - retro', 'Meet - retro'],
  ])('%j reads %j', (stored, shown) => {
    expect(displayTitle(onMeet(stored))).toBe(shown);
  });

  it.each([
    'Meet - abc-defg-hij',
    'Meet – abc-defg-hij',
    'Meet – ABC-DEFG-HIJ',
    'abc-defg-hij',
    'Meet',
    'meet',
    'Google Meet',
    'Meet -',
    'Meet - ',
    'Meet - Meet',
    '',
    '   ',
  ])('%j has no title', (stored) => {
    expect(displayTitle(onMeet(stored))).toBeNull();
  });

  it('a code needs exactly three, four and three letters', () => {
    expect(displayTitle(onMeet('Meet - abc-defg-hijk'))).toBe('abc-defg-hijk');
    expect(displayTitle(onMeet('Meet - ab1-defg-hij'))).toBe('ab1-defg-hij');
    expect(displayTitle(onMeet('Meet - abc-defg-hij notes'))).toBe('abc-defg-hij notes');
  });

  it('is told by the address when the record does not say Meet', () => {
    const source: Meeting['source'] = { url: MEET_URL, title: 'Meet - Weekly sync', platform: 'generic' };
    expect(displayTitle(source)).toBe('Weekly sync');
    expect(displayTitle({ ...source, title: 'Meet - abc-defg-hij' })).toBeNull();
    expect(displayTitle({ ...source, url: 'https://meet.google.com', title: 'Meet - Retro' })).toBe('Retro');
  });
});

describe('displayTitle on any other site', () => {
  it.each([
    ['Quarterly planning - Zoom', 'Quarterly planning - Zoom'],
    ['Standup | Microsoft Teams', 'Standup | Microsoft Teams'],
    ['Meet - Weekly sync', 'Meet - Weekly sync'],
    ['abc-defg-hij', 'abc-defg-hij'],
    ['<b>Roadmap</b>', '<b>Roadmap</b>'],
  ])('%j is shown as stored', (stored, shown) => {
    expect(displayTitle(elsewhere(stored))).toBe(shown);
  });

  it.each(['', '  \n ', 'Zoom', 'zoom', 'Microsoft Teams', 'MICROSOFT TEAMS', 'Meet', 'Google Meet'])(
    '%j has no title',
    (stored) => {
      expect(displayTitle(elsewhere(stored))).toBeNull();
    },
  );

  it('an address that only looks like Meet is not Meet', () => {
    expect(displayTitle(elsewhere('Meet - Weekly sync', 'https://meet.google.com.example.org/x'))).toBe(
      'Meet - Weekly sync',
    );
    expect(displayTitle(elsewhere('Meet - Weekly sync', 'http://meet.google.com/x'))).toBe('Meet - Weekly sync');
  });
});

describe('displayTitle spacing', () => {
  it('trims the ends and reduces runs of white space to one space', () => {
    expect(displayTitle(elsewhere('  Design   review '))).toBe('Design review');
    expect(displayTitle(onMeet(' Meet  -  Design\n\treview  '))).toBe('Design review');
  });

  it('keeps a long title whole', () => {
    const long = 'Quarterly planning '.repeat(20).trim();
    expect(displayTitle(onMeet(`Meet - ${long}`))).toBe(long);
  });
});
