// The title a Transcripts row shows for a stored meeting (012 FR-029, design decision 76; spec Clarifications E2,
// data-model.md "Display title"). `source.title` is the meeting tab's title as Chrome reported it at Start, so on Meet
// it carries Meet's own decoration and, for a call without a name, only the meeting code. Pure; nothing is stored.
import type { Meeting } from '../transcript/model';

/** `Meet - `, `Meet – ` or `Meet — ` in front of a Meet tab's title, or all of it. */
const MEET_PREFIX = /^Meet\s+[-–—](\s+|$)/;
/** A Meet meeting code: three, four and three letters. */
const MEET_CODE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i;
const MEET_ADDRESS = /^https:\/\/meet\.google\.com(\/|$)/;
/** A tab that says only where it is has no title of its own. */
const SITE_NAMES = new Set(['meet', 'google meet', 'zoom', 'microsoft teams']);

/** The meeting's title as shown, or null when the stored title names no meeting. */
export function displayTitle(source: Meeting['source']): string | null {
  let title = source.title.replace(/\s+/g, ' ').trim();
  if (source.platform === 'meet' || MEET_ADDRESS.test(source.url)) {
    title = title.replace(MEET_PREFIX, '');
    if (MEET_CODE.test(title)) return null;
  }
  return title === '' || SITE_NAMES.has(title.toLowerCase()) ? null : title;
}
