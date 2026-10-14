// The store the offscreen document's meeting runs on: every write goes to the one MeetingRepo (IndexedDB), opened
// once. Spike builds watch the meeting, its lines and its end go by for the alignment trace; they are never handed a
// caption turn (013 FR-009).
import type { MeetingStore } from '../../core/session/meeting-runtime';
import type { Meeting, TranscriptSegment } from '../../core/transcript/model';
import type { MeetingRepo } from '../../storage/meeting-repo';
import type { CrashRecovery } from './host';

export type OffscreenRepo = Pick<
  MeetingRepo,
  | 'createMeeting'
  | 'appendSegment'
  | 'updateSegment'
  | 'setSpeakerRename'
  | 'endMeeting'
  | 'markOrphanedCrashed'
  | 'putCaptionTurns'
>;

/** Spike builds only (002 T067, T100). */
export interface StoreHooks {
  /** Before the meeting is created: the trace recorder must learn the meeting start (real trace 2026-10-08). */
  onCreate?(meeting: Meeting): void | Promise<void>;
  onSegment?(segment: TranscriptSegment): void;
  onEnd?(): void;
}

export function offscreenStore(repo: Promise<OffscreenRepo>, hooks: StoreHooks = {}): MeetingStore & CrashRecovery {
  return {
    createMeeting: async (m) => {
      await hooks.onCreate?.(m);
      await (await repo).createMeeting(m);
    },
    appendSegment: async (s) => {
      hooks.onSegment?.(s);
      await (await repo).appendSegment(s);
    },
    updateSegment: async (s) => {
      hooks.onSegment?.(s);
      await (await repo).updateSegment(s);
    },
    setSpeakerRename: async (id, key, entry) => (await repo).setSpeakerRename(id, key, entry),
    endMeeting: async (id, at, reason) => {
      hooks.onEnd?.();
      await (await repo).endMeeting(id, at, reason);
    },
    markOrphanedCrashed: async (liveId, now) => (await repo).markOrphanedCrashed(liveId, now),
    // 013: with this method the runtime keeps the text of a Meet call's captions (contracts/captions-capture.md
    // "Runtime"). The pre-Start reminder says so on a Meet call (ConsentDialog); the two ship together.
    putCaptionTurns: async (id, turns) => (await repo).putCaptionTurns(id, turns),
  };
}
