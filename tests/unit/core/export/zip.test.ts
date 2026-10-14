// 013 T033 (FR-021, research R6; contracts/files-and-storage.md "The zip, byte for byte"): the stored-only zip writer
// against an archive made by an independent implementation (Python's zipfile, tests/fixtures/zip/make-known-good.py).
// Names and bodies are invented and are the same as in that script.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { crc32, zipStored } from '@/core/export/zip';

const utf8 = (text: string) => new TextEncoder().encode(text);

const KNOWN_GOOD = new Uint8Array(
  readFileSync(fileURLToPath(new URL('../../../fixtures/zip/known-good.zip', import.meta.url))),
);
/** 7 October 2026, 14:30:00 local time: the script's DATE_TIME. */
const KNOWN_GOOD_DATE = new Date(2026, 9, 7, 14, 30, 0);
const KNOWN_GOOD_ENTRIES = [
  {
    name: 'Σύσκεψη — 07-10-2026 at 14h30 — Transcript.txt',
    data: utf8(
      '[00:04] Sarah Brown: Καλημέρα σε όλους, βλέπετε τη διαφάνεια με τον οδικό χάρτη;\n\n' +
        "[00:11] Alex: Yes, it's up. The harbour survey moves to Thursday.\n",
    ),
  },
  {
    name: 'Σύσκεψη — 07-10-2026 at 14h30 — Meet captions.txt',
    data: utf8(
      '[00:04] Sarah Brown: Καλημέρα σε όλους, βλέπετε τη διαφάνεια;\n\n' +
        '[00:11] Alex: Yes, it is up. The harbour survey moves to Thursday — agreed.\n',
    ),
  },
];

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

interface ReadEntry {
  name: string;
  data: Uint8Array;
  localFlags: number;
  centralFlags: number;
  crc: number;
  offset: number;
  method: number;
  time: number;
  date: number;
  externalAttributes: number;
  versionMadeBy: number;
}

/** A reader written for this test alone: it walks the end record and the central directory, then each local header. */
function readZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endAt = bytes.byteLength - 22;
  expect(view.getUint32(endAt, true)).toBe(END);
  const end = {
    disk: view.getUint16(endAt + 4, true),
    directoryDisk: view.getUint16(endAt + 6, true),
    entriesHere: view.getUint16(endAt + 8, true),
    entries: view.getUint16(endAt + 10, true),
    directorySize: view.getUint32(endAt + 12, true),
    directoryOffset: view.getUint32(endAt + 16, true),
    commentLength: view.getUint16(endAt + 20, true),
  };
  const entries: ReadEntry[] = [];
  let at = end.directoryOffset;
  for (let i = 0; i < end.entries; i += 1) {
    expect(view.getUint32(at, true)).toBe(CENTRAL);
    const size = view.getUint32(at + 20, true);
    expect(view.getUint32(at + 24, true)).toBe(size);
    const nameLength = view.getUint16(at + 28, true);
    expect(view.getUint16(at + 30, true)).toBe(0);
    expect(view.getUint16(at + 32, true)).toBe(0);
    const offset = view.getUint32(at + 42, true);
    const nameBytes = bytes.subarray(at + 46, at + 46 + nameLength);

    expect(view.getUint32(offset, true)).toBe(LOCAL);
    expect(view.getUint16(offset + 4, true)).toBe(20);
    expect(view.getUint32(offset + 14, true)).toBe(view.getUint32(at + 16, true));
    expect(view.getUint32(offset + 18, true)).toBe(size);
    expect(view.getUint32(offset + 22, true)).toBe(size);
    expect(view.getUint16(offset + 26, true)).toBe(nameLength);
    expect(view.getUint16(offset + 28, true)).toBe(0);
    expect([...bytes.subarray(offset + 30, offset + 30 + nameLength)]).toEqual([...nameBytes]);
    const dataAt = offset + 30 + nameLength;

    entries.push({
      name: new TextDecoder('utf-8', { fatal: true }).decode(nameBytes),
      data: bytes.subarray(dataAt, dataAt + size),
      localFlags: view.getUint16(offset + 6, true),
      centralFlags: view.getUint16(at + 8, true),
      crc: view.getUint32(at + 16, true),
      offset,
      method: view.getUint16(at + 10, true),
      time: view.getUint16(at + 12, true),
      date: view.getUint16(at + 14, true),
      externalAttributes: view.getUint32(at + 38, true),
      versionMadeBy: view.getUint16(at + 4, true),
    });
    at += 46 + nameLength;
  }
  expect(at).toBe(end.directoryOffset + end.directorySize);
  expect(at).toBe(endAt);
  return { end, entries };
}

const entry = (name: string, body: string) => ({ name, data: utf8(body) });
const WHEN = new Date(2026, 9, 7, 14, 30, 58);

describe('crc32', () => {
  it('has the check value of APPNOTE 4.4.7', () => {
    expect(crc32(utf8('123456789'))).toBe(0xcbf43926);
  });

  it('is 0 for no bytes, and unsigned', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
    for (const text of ['a', 'Καλημέρα', 'The harbour survey moves to Thursday.']) {
      expect(crc32(utf8(text))).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(crc32(utf8(text)))).toBe(true);
    }
    expect(crc32(utf8('a'))).toBe(0xe8b7be43);
  });

  it('reads a view at its own offset', () => {
    const padded = utf8('xx123456789yy');
    expect(crc32(padded.subarray(2, 11))).toBe(0xcbf43926);
  });
});

describe('zipStored', () => {
  it('equals the known-good archive byte for byte', () => {
    const made = zipStored(KNOWN_GOOD_ENTRIES, KNOWN_GOOD_DATE);
    expect(made.byteLength).toBe(KNOWN_GOOD.byteLength);
    expect(Buffer.from(made).equals(Buffer.from(KNOWN_GOOD))).toBe(true);
  });

  it('the fixture is what the test thinks it is: two stored entries with these names', () => {
    const { entries, end } = readZip(KNOWN_GOOD);
    expect(entries.map((e) => e.name)).toEqual(KNOWN_GOOD_ENTRIES.map((e) => e.name));
    expect(end.entries).toBe(2);
    expect(entries.map((e) => e.method)).toEqual([0, 0]);
    expect(new TextDecoder().decode(entries[0]?.data)).toContain('Καλημέρα σε όλους');
  });

  it('sets the UTF-8 name flag in both records of each entry, also for an ASCII-only name', () => {
    const { entries } = readZip(zipStored([entry('plain.txt', 'a'), entry('Σύσκεψη — notes.txt', 'b')], WHEN));
    for (const e of entries) {
      expect(e.localFlags).toBe(0x0800);
      expect(e.centralFlags).toBe(0x0800);
    }
    expect(entries.map((e) => e.name)).toEqual(['plain.txt', 'Σύσκεψη — notes.txt']);
  });

  it.each([1, 2, 3])('writes offsets, sizes and counts for %i entries', (count) => {
    const input = Array.from({ length: count }, (_, i) => entry(`Entry ${i + 1} — é.txt`, 'body '.repeat(i * 7 + 1)));
    const bytes = zipStored(input, WHEN);
    const { end, entries } = readZip(bytes);
    expect(end).toMatchObject({ disk: 0, directoryDisk: 0, entriesHere: count, entries: count, commentLength: 0 });
    let expectedOffset = 0;
    entries.forEach((e, i) => {
      const source = input[i];
      expect(e.offset).toBe(expectedOffset);
      expect(e.name).toBe(source?.name);
      expect([...e.data]).toEqual([...(source?.data ?? [])]);
      expect(e.crc).toBe(crc32(source?.data ?? new Uint8Array()));
      expect(e.method).toBe(0);
      expect(e.versionMadeBy).toBe(0x0314);
      expect(e.externalAttributes).toBe(0x81a40000);
      expectedOffset += 30 + utf8(e.name).byteLength + e.data.byteLength;
    });
    expect(end.directoryOffset).toBe(expectedOffset);
    expect(bytes.byteLength).toBe(end.directoryOffset + end.directorySize + 22);
  });

  it('stamps every entry with the local date and time, two-second resolution', () => {
    const { entries } = readZip(
      zipStored([entry('a.txt', 'a'), entry('b.txt', 'b')], new Date(2026, 9, 7, 14, 30, 59)),
    );
    for (const e of entries) {
      expect(e.time).toBe((14 << 11) | (30 << 5) | 29);
      expect(e.date).toBe(((2026 - 1980) << 9) | (10 << 5) | 7);
    }
  });

  it('writes a year before 1980 as 1 January 1980, 00:00', () => {
    const { entries } = readZip(zipStored([entry('a.txt', 'a')], new Date(1975, 5, 15, 12, 0, 0)));
    expect(entries[0]).toMatchObject({ time: 0, date: (1 << 5) | 1 });
  });

  it('round-trips a 1 MB entry and an empty one', () => {
    const big = new Uint8Array(1024 * 1024);
    for (let i = 0; i < big.length; i += 1) big[i] = (i * 31 + (i >> 8)) & 0xff;
    const { entries } = readZip(
      zipStored(
        [
          { name: 'big.bin', data: big },
          { name: 'empty.txt', data: new Uint8Array(0) },
        ],
        WHEN,
      ),
    );
    expect(entries[0]?.data.byteLength).toBe(big.byteLength);
    expect(Buffer.from(entries[0]?.data ?? []).equals(Buffer.from(big))).toBe(true);
    expect(entries[0]?.crc).toBe(crc32(big));
    expect(entries[1]).toMatchObject({ name: 'empty.txt', crc: 0 });
    expect(entries[1]?.data.byteLength).toBe(0);
  });

  it('writes an archive with no entry as the end record alone', () => {
    const bytes = zipStored([], WHEN);
    expect(bytes.byteLength).toBe(22);
    expect(readZip(bytes).end).toMatchObject({ entries: 0, directorySize: 0, directoryOffset: 0 });
  });

  it.each([
    ['an empty name', ''],
    ['a name with /', 'folder/file.txt'],
    ['a name with \\', 'folder\\file.txt'],
  ])('throws on %s', (_what, name) => {
    expect(() => zipStored([entry(name, 'x')], WHEN)).toThrow();
    expect(() => zipStored([entry('fine.txt', 'x'), entry(name, 'x')], WHEN)).toThrow();
  });

  it('throws on more than 65,535 entries', () => {
    const one = { name: 'a.txt', data: new Uint8Array(0) };
    expect(() =>
      zipStored(
        Array.from({ length: 65_536 }, () => one),
        WHEN,
      ),
    ).toThrow();
  });

  it('does not mutate its inputs, and the same input gives the same bytes', () => {
    const data = utf8('The harbour survey moves to Thursday.');
    const before = [...data];
    const entries = Object.freeze([Object.freeze({ name: 'Meeting — a.txt', data })]);
    const when = new Date(WHEN.getTime());
    const first = zipStored(entries, when);
    const second = zipStored(entries, when);
    expect([...data]).toEqual(before);
    expect(when.getTime()).toBe(WHEN.getTime());
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    expect(first).not.toBe(second);
  });

  it('reads entry data given as a view into a larger buffer', () => {
    const padded = utf8('__inside__');
    const { entries } = readZip(zipStored([{ name: 'a.txt', data: padded.subarray(2, 8) }], WHEN));
    expect(new TextDecoder().decode(entries[0]?.data)).toBe('inside');
  });
});
