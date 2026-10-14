// 013: playing Meet's captions on the routed Meet page, reading what the extension kept, and watching that none of it
// leaves the machine. Every name and sentence a spec passes in is invented (FR-011).
import type { BrowserContext, Download, Locator, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StoredCaptionTurn } from '@/core/captions/model';
import type { Meeting } from '@/core/transcript/model';
import { holdsMarker } from '../support/caption-marker-text';

/**
 * A new caption turn by `name` whose text goes through `versions`, one every `stepMs` (the first at once), as Meet
 * rewrites a turn while someone talks. Resolves after the last version with the turn's place among the page's turns and
 * the page's clock when it appeared.
 */
export async function captionInMeet(
  page: Page,
  name: string,
  versions: readonly string[],
  stepMs = 400,
): Promise<{ index: number; appearedAt: number }> {
  return page.evaluate(
    async ({ name, versions, stepMs }) => {
      const region = document.querySelector('[role="region"][aria-label="Captions"]');
      if (!region) throw new Error('no captions region');
      const item = document.createElement('div');
      item.className = 'nMcdL bj4p3b';
      item.innerHTML =
        '<div class="adE6rb"><img class="Z6byG r6DyN" data-iml="9" src="https://lh3.googleusercontent.com/a/fixture-avatar-e2e=s48" alt="" />' +
        '<div class="KcIKyf jxFHg"><span class="NWpY1d"></span></div></div><div class="ygicle VbkSUe"></div>';
      item.querySelector('span')!.textContent = name;
      const text = item.querySelector('.ygicle')!;
      text.textContent = versions[0] ?? '';
      const turns = [...region.querySelectorAll(':scope > .nMcdL')];
      const last = turns.at(-1);
      if (last) last.after(item);
      else region.prepend(item);
      const appearedAt = Date.now();
      for (const version of versions.slice(1)) {
        await new Promise((r) => setTimeout(r, stepMs));
        text.textContent = version;
      }
      return { index: turns.length, appearedAt };
    },
    { name, versions: [...versions], stepMs },
  );
}

/** Replaces the text of the page's turn number `index` (from 0, turns from before Start included), as a correction. */
export async function rewriteCaption(page: Page, index: number, text: string): Promise<void> {
  await page.evaluate(
    ({ index, text }) => {
      const turn = document.querySelectorAll('[role="region"][aria-label="Captions"] > .nMcdL')[index];
      const body = turn?.querySelector('.ygicle');
      if (!body) throw new Error(`no caption turn ${index}`);
      body.textContent = text;
    },
    { index, text },
  );
}

async function readStore<T>(panel: Page, store: string): Promise<T[]> {
  return panel.evaluate(async (store) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('live-assist');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error(String(req.error)));
    });
    try {
      if (!db.objectStoreNames.contains(store)) return [];
      return await new Promise<unknown[]>((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result as unknown[]);
        req.onerror = () => reject(new Error(String(req.error)));
      });
    } finally {
      db.close();
    }
  }, store) as Promise<T[]>;
}

/** The meeting's kept caption turns, in `seq` order, straight from IndexedDB. */
export async function readCaptionTurns(panel: Page, meetingId: string): Promise<StoredCaptionTurn[]> {
  const all = await readStore<StoredCaptionTurn>(panel, 'captionTurns');
  return all.filter((t) => t.meetingId === meetingId).sort((a, b) => a.seq - b.seq);
}

/** The stored meeting started last; null when none is stored. */
export async function newestMeeting(panel: Page): Promise<Meeting | null> {
  const all = await readStore<Meeting>(panel, 'meetings');
  return all.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
}

/** Where requests may go in an e2e run: the extension itself, local blobs, and the routes the fixtures answer. */
const LOCAL = [
  'chrome-extension://',
  'blob:chrome-extension://',
  'data:',
  'about:',
  // The saved Meet page (routed in openMeetPage, never fetched) and the avatars it names (aborted below).
  'https://meet.google.com/',
  'https://lh3.googleusercontent.com/a/fixture-avatar',
  // Blocked in tests/e2e/fixtures.ts.
  'https://api.elevenlabs.io/v1/user/subscription',
];

/**
 * From now on, records every request of the browser context that holds a marker sentence (URL or body) or goes
 * anywhere but the extension and the fixture routes. `problems()` is empty when nothing did.
 */
export async function watchForMarker(context: BrowserContext): Promise<{ problems(): string[] }> {
  await context.route('https://lh3.googleusercontent.com/**', (route) => route.abort());
  const problems: string[] = [];
  context.on('request', (request) => {
    const url = request.url();
    if (!LOCAL.some((prefix) => url.startsWith(prefix))) problems.push(`request to ${url}`);
    let decoded = url;
    try {
      decoded = decodeURIComponent(url);
    } catch {
      // Not an encoded URL: searched as it is.
    }
    if (holdsMarker([url, decoded, request.postData() ?? ''])) problems.push(`caption text in a request to ${url}`);
  });
  return { problems: () => [...problems] };
}

/** `Meeting — DD-MM-YYYY at HHhMM` for a start, from the local clock (the browser shares the test's time zone). */
export function baseName(startedAt: number): string {
  const d = new Date(startedAt);
  const p = (n: number) => String(n).padStart(2, '0');
  return `Meeting — ${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} at ${p(d.getHours())}h${p(d.getMinutes())}`;
}

/** Presses a Download control and returns what Chrome saved. */
export async function saveFrom(panel: Page, button: Locator): Promise<{ download: Download; bytes: Buffer }> {
  const [download] = await Promise.all([panel.waitForEvent('download'), button.click()]);
  return { download, bytes: await readFile(await download.path()) };
}

/** The entry names of a zip in the order of its central directory, decoded as UTF-8 (the archive sets that flag). */
function entryNames(zip: Buffer): string[] {
  const end = zip.length - 22;
  if (end < 0 || zip.readUInt32LE(end) !== 0x06054b50) throw new Error('not a zip with a plain end record');
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i += 1) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('central directory entry expected');
    const nameLength = zip.readUInt16LE(at + 28);
    names.push(zip.subarray(at + 46, at + 46 + nameLength).toString('utf8'));
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return names;
}

/**
 * Unpacks a saved zip with the system's `unzip` into a new, empty temporary directory, after `unzip -t` has checked it.
 * Returns each extracted file's bytes by its name on disk, and the entry names in the archive's order. The order is
 * read from the archive's own directory: `unzip -Z1` lists the entries in that order too, but how it prints a character
 * outside ASCII differs by build (macOS's prints `?` per byte), so its listing is compared by count and by each name's
 * ASCII ending. Names are compared after NFC.
 */
export async function unzipDownload(download: Download): Promise<{ names: string[]; files: Map<string, Buffer> }> {
  const zip = await download.path();
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
  } catch {
    throw new Error('`unzip` is not on the PATH: the captions download specs unpack the saved zip with it.');
  }
  execFileSync('unzip', ['-t', zip], { stdio: 'ignore' });
  const names = entryNames(readFileSync(zip)).map((name) => name.normalize('NFC'));
  /** What follows the name's last character outside ASCII: ` Transcript.txt`, ` Meet captions.txt`. */
  const asciiEnding = (name: string) => /[\x20-\x7e]*$/.exec(name)?.[0] ?? '';
  const listed = execFileSync('unzip', ['-Z1', zip], { encoding: 'latin1' })
    .split('\n')
    .filter((line) => line !== '');
  if (listed.length !== names.length || names.some((name, i) => !listed[i]!.endsWith(asciiEnding(name))))
    throw new Error(`unzip -Z1 lists ${JSON.stringify(listed)}, the archive's directory ${JSON.stringify(names)}`);
  const dir = mkdtempSync(join(tmpdir(), 'live-assist-zip-'));
  execFileSync('unzip', ['-q', zip, '-d', dir], { stdio: 'ignore' });
  const files = new Map(readdirSync(dir).map((name) => [name.normalize('NFC'), readFileSync(join(dir, name))]));
  return { names, files };
}
