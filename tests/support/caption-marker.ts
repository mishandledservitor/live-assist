// 013: the marker sentences (tests/support/caption-marker-text.ts) with the Vitest assertion tests use to say "no
// caption text here".
import { expect } from 'vitest';
import { holdsMarker } from './caption-marker-text';

export { CAPTION_MARKER, CAPTION_MARKER_GREEK, holdsMarker } from './caption-marker-text';

/** Fails when the value holds a marker sentence anywhere. */
export function expectNoMarker(value: unknown): void {
  expect(holdsMarker(value), 'caption text found where it must never be').toBe(false);
}
