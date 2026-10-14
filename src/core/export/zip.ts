// A zip archive of stored (uncompressed) entries, written here instead of taking a dependency (013 research R6). The
// exact bytes are in specs/013-captions-download/contracts/files-and-storage.md "The zip, byte for byte" and are
// checked against an archive made by Python's zipfile. Pure and synchronous. Not written: compression, data
// descriptors, extra fields, zip64, comments, directories. If any of those is ever needed, take a library instead of
// growing this.

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_RECORD = 0x06054b50;
const LOCAL_SIZE = 30;
const CENTRAL_SIZE = 46;
const END_SIZE = 22;
/** 2.0: the lowest version that reads a stored entry with a UTF-8 name. */
const VERSION_NEEDED = 20;
/** Made on Unix (3), version 2.0: with it the external attributes are read as a file mode. */
const VERSION_MADE_BY = 0x0314;
/** General-purpose bit 11: the name is UTF-8 (APPNOTE 4.4.4). Set for every entry, ASCII names included. */
const UTF8_NAMES = 0x0800;
/** A regular file, rw-r--r--. Without a mode `unzip` makes a Unix-made entry unreadable. */
const FILE_MODE = 0x81a40000;
const MAX_ENTRIES = 0xffff;
/** Sizes and offsets are 32-bit; this writer has no zip64. */
const MAX_BYTES = 0xffffffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 as zip uses it (APPNOTE 4.4.7), unsigned. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS time and date of a local date; a year before 1980 cannot be written and reads as 1980-01-01 00:00. */
function dosDateTime(at: Date): { time: number; date: number } {
  const year = at.getFullYear();
  if (year < 1980) return { time: 0, date: (1 << 5) | 1 };
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

/**
 * The archive holding `entries` in the given order, each stored as it is and stamped with `modifiedAt` (local time).
 * Names are used as given. Throws rather than write a wrong archive: on an empty name, a name with a path separator,
 * more than 65,535 entries, or 4 GiB or more.
 */
export function zipStored(
  entries: readonly { name: string; data: Uint8Array }[],
  modifiedAt: Date,
): Uint8Array<ArrayBuffer> {
  if (entries.length > MAX_ENTRIES) throw new Error('Too many files for one zip archive.');
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(modifiedAt);

  let dataSize = 0;
  let directorySize = 0;
  const prepared = entries.map(({ name, data }) => {
    if (name === '' || name.includes('/') || name.includes('\\'))
      throw new Error('A file name in a zip archive must not be empty or hold a path separator.');
    const nameBytes = encoder.encode(name);
    if (nameBytes.byteLength > 0xffff) throw new Error('A file name is too long for a zip archive.');
    const offset = dataSize;
    dataSize += LOCAL_SIZE + nameBytes.byteLength + data.byteLength;
    directorySize += CENTRAL_SIZE + nameBytes.byteLength;
    return { nameBytes, data, offset, crc: crc32(data) };
  });
  const total = dataSize + directorySize + END_SIZE;
  if (total > MAX_BYTES) throw new Error('The files are too large for one zip archive.');

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let at = 0;
  const u16 = (value: number) => {
    view.setUint16(at, value, true);
    at += 2;
  };
  const u32 = (value: number) => {
    view.setUint32(at, value, true);
    at += 4;
  };
  const raw = (bytes: Uint8Array) => {
    out.set(bytes, at);
    at += bytes.byteLength;
  };

  for (const e of prepared) {
    u32(LOCAL_HEADER);
    u16(VERSION_NEEDED);
    u16(UTF8_NAMES);
    u16(0); // method: stored
    u16(time);
    u16(date);
    u32(e.crc);
    u32(e.data.byteLength); // compressed size
    u32(e.data.byteLength); // uncompressed size
    u16(e.nameBytes.byteLength);
    u16(0); // extra length
    raw(e.nameBytes);
    raw(e.data);
  }
  for (const e of prepared) {
    u32(CENTRAL_HEADER);
    u16(VERSION_MADE_BY);
    u16(VERSION_NEEDED);
    u16(UTF8_NAMES);
    u16(0); // method: stored
    u16(time);
    u16(date);
    u32(e.crc);
    u32(e.data.byteLength);
    u32(e.data.byteLength);
    u16(e.nameBytes.byteLength);
    u16(0); // extra length
    u16(0); // comment length
    u16(0); // disk number
    u16(0); // internal attributes
    u32(FILE_MODE);
    u32(e.offset);
    raw(e.nameBytes);
  }
  u32(END_RECORD);
  u16(0); // this disk
  u16(0); // disk with the directory
  u16(prepared.length);
  u16(prepared.length);
  u32(directorySize);
  u32(dataSize);
  u16(0); // comment length
  return out;
}
