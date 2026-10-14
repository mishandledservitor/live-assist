// "From your notes:" passages in an answer (008 research N5, fixes after the real call of 2026-10-10). Pure. The model
// writes the label in the answer's language; the labels below are the ones the app recognises (English and Greek, the
// languages it is used in). A recognised passage always starts its own paragraph, and a citation inside it is never a
// link: notes are never cited (constitution II). Other languages rely on the prompt alone.

export const NOTES_LABELS: readonly string[] = [
  'From your notes',
  'Από τις σημειώσεις σας',
  'Από τις σημειώσεις σου',
  'Στις σημειώσεις σας',
  'Στις σημειώσεις σου',
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LABEL = `(?:${NOTES_LABELS.map(escape).join('|')})[ \\t]*:`;

/** A label right after a sentence end or a citation, in the same paragraph (at most one line break between). */
const MID_PARAGRAPH = new RegExp(`([.!?;]["”»]?|\\])[ \\t]*\\n?[ \\t]*(?=${LABEL})`, 'giu');
/** A label at the start of a line. */
const AT_LINE_START = new RegExp(`^${LABEL}`, 'gimu');

/**
 * The Greek label with its first word left in English, "From τις σημειώσεις σου:" (eval run of 2026-10-12), where a
 * label can stand: at the start of a line, or after a sentence end or a citation.
 */
const HALF_TRANSLATED = /(^|[.!?;]["”»]?[ \t]*|\][ \t]*)From([ \t]+τις[ \t]+σημειώσεις[ \t]+(?:σου|σας)[ \t]*:)/gimu;

/** Writes a half-translated Greek notes label fully in Greek, so it is recognised and shown as the label it is. */
export function normaliseNotesLabels(answer: string): string {
  return answer.replace(HALF_TRANSLATED, '$1Από$2');
}

/** Puts every recognised notes label that follows other text in its paragraph at the start of a paragraph of its own. */
export function separateNotesPassages(answer: string): string {
  return answer.replace(MID_PARAGRAPH, '$1\n\n');
}

/**
 * The [start, end) ranges of the notes passages: from a label at the start of a line to the end of its paragraph. A
 * blank line ends it; so does a single line break, unless the next line is a list item or the label stood alone.
 */
export function notesPassages(answer: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const m of answer.matchAll(AT_LINE_START)) {
    const start = m.index;
    let end = answer.indexOf('\n', start);
    if (end === -1) end = answer.length;
    let labelOnly = answer.slice(start + m[0].length, end).trim() === '';
    while (end < answer.length) {
      const nextEnd = answer.indexOf('\n', end + 1) === -1 ? answer.length : answer.indexOf('\n', end + 1);
      const next = answer.slice(end + 1, nextEnd);
      if (next.trim() === '' || !(labelOnly || /^\s*- /.test(next))) break;
      labelOnly = false;
      end = nextEnd;
    }
    ranges.push([start, end]);
  }
  return ranges;
}
