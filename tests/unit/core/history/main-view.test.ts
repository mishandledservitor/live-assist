// 012 T034 (FR-020, FR-026; research R5): whether the most recent stored meeting shows on the main view, given the
// moment the main view was last cleared.
import { describe, expect, it } from 'vitest';
import { showsOnMain } from '@/core/history/main-view';

describe('showsOnMain', () => {
  it('shows the meeting when the main view was never cleared', () => {
    expect(showsOnMain({ startedAt: 1_000 }, null)).toBe(true);
    expect(showsOnMain({ startedAt: 0 }, null)).toBe(true);
  });

  it('shows a meeting started after the main view was cleared', () => {
    expect(showsOnMain({ startedAt: 2_001 }, 2_000)).toBe(true);
  });

  it('does not show a meeting started when or before the main view was cleared', () => {
    expect(showsOnMain({ startedAt: 2_000 }, 2_000)).toBe(false);
    expect(showsOnMain({ startedAt: 1_999 }, 2_000)).toBe(false);
    expect(showsOnMain({ startedAt: 0 }, 2_000)).toBe(false);
  });
});
