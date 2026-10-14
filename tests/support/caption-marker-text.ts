// 013: one invented sentence per language that tests put into caption turns and then look for where caption text must
// never be (logs, live events, provider calls, other stores, files that are not the captions file). Nothing here was
// ever said in a call (FR-011). No test-runner import here: Vitest tests use tests/support/caption-marker.ts, Playwright
// specs this file.
export const CAPTION_MARKER = 'The purple heron audits seventeen lighthouses.';
export const CAPTION_MARKER_GREEK = 'Ο μοβ ερωδιός ελέγχει δεκαεπτά φάρους.';

const MARKERS = [CAPTION_MARKER, CAPTION_MARKER_GREEK];
/** A distinctive piece of each marker: a cut or re-wrapped sentence is still found. */
const FRAGMENTS = ['purple heron', 'μοβ ερωδιός'];

const isBytes = (v: unknown): v is ArrayBuffer | ArrayBufferView => v instanceof ArrayBuffer || ArrayBuffer.isView(v);

function bytesOf(v: ArrayBuffer | ArrayBufferView): Uint8Array {
  return v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

function strings(value: unknown, seen: Set<unknown>, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (isBytes(value)) {
    const bytes = bytesOf(value);
    out.push(new TextDecoder('utf-8').decode(bytes));
    if (bytes.byteLength % 2 === 0) out.push(new TextDecoder('utf-16le').decode(bytes));
    return;
  }
  if (value instanceof Error) {
    out.push(value.name, value.message, value.stack ?? '');
    strings((value as { cause?: unknown }).cause, seen, out);
    return;
  }
  if (value instanceof Map) {
    for (const [k, v] of value) {
      strings(k, seen, out);
      strings(v, seen, out);
    }
    return;
  }
  if (value instanceof Set || Array.isArray(value)) {
    for (const v of value) strings(v, seen, out);
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    out.push(k);
    strings(v, seen, out);
  }
}

/** True when a marker sentence (or its distinctive piece) is anywhere in the value: strings, objects, byte arrays. */
export function holdsMarker(value: unknown): boolean {
  const found: string[] = [];
  strings(value, new Set(), found);
  const needles = [...MARKERS, ...FRAGMENTS].map((n) => n.normalize('NFC').toLowerCase());
  return found.some((s) => {
    const hay = s.normalize('NFC').toLowerCase();
    return needles.some((n) => hay.includes(n));
  });
}
