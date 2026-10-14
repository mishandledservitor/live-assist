// T069 (prepared before the user's snapshots exist): every real, anonymised Meet snapshot in tests/fixtures/meet/real/
// must have an entry in real/expected.json, and the locators must read exactly that from it — values and tiers. Adding
// a real snapshot is then: drop the file in, add its expected reading, fix the locator if this test fails.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  captionItems,
  captionsButton,
  captionsOn,
  captionsRegion,
  inCall,
  isMuted,
  isSelfName,
  micButton,
  speakerNameOf,
} from '@/platforms/meet/locators';
import { loadMeetSnapshot } from '../../../support/meet-snapshot';

const REAL_DIR = join(import.meta.dirname, '../../../fixtures/meet/real');

/** What the locators read off a page; the shape of each entry in real/expected.json. */
export function readMeetPage(doc: Document) {
  const button = captionsButton(doc);
  const region = captionsRegion(doc);
  const items = region.value ? captionItems(region.value) : { value: [], tier: null };
  const mic = micButton(doc);
  return {
    inCall: inCall(doc),
    captionsButtonTier: button.tier,
    captionsOn: button.value ? captionsOn(button.value) : null,
    captionsRegionTier: region.tier,
    captionItemsTier: items.tier,
    speakers: items.value.map((i) => {
      const name = speakerNameOf(i);
      return { name: name.value, tier: name.tier, self: name.value ? isSelfName(name.value, doc) : null };
    }),
    micButtonTier: mic.tier,
    muted: mic.value ? isMuted(mic.value) : null,
  };
}

const files = existsSync(REAL_DIR) ? readdirSync(REAL_DIR).filter((f) => f.endsWith('.html')) : [];
const expected: Record<string, unknown> = existsSync(join(REAL_DIR, 'expected.json'))
  ? (JSON.parse(readFileSync(join(REAL_DIR, 'expected.json'), 'utf8')) as Record<string, unknown>)
  : {};

describe('real Meet snapshots (tests/fixtures/meet/real/)', () => {
  it('every snapshot has an expected reading and every expected reading has a snapshot', () => {
    expect(Object.keys(expected).sort()).toEqual([...files].sort());
  });

  it.each(files)('%s is marked as a real anonymised snapshot and has no avatar URL', (file) => {
    const html = readFileSync(join(REAL_DIR, file), 'utf8');
    expect(html).toMatch(/<meta name="live-assist-fixture" content="real, anonymised/);
    expect(html).not.toContain('googleusercontent.com');
  });

  it.each(files)('%s: the locators read the expected values on the expected tiers', (file) => {
    const doc = loadMeetSnapshot(`real/${file.replace(/\.html$/, '')}`);
    expect(readMeetPage(doc)).toEqual(expected[file]);
  });
});
