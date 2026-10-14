// The service worker's notes commands (008 contracts/notes-messages.md, research N1): the only writer of notes. It
// re-validates what the panel sent and replies with a version or an error kind, never the notes themselves.
import { NEXT_MEETING_KEY, validateNotes } from '../../core/chat/notes';
import type { Logger } from '../../core/log';
import type { Command, NotesRemoveReply, NotesSetReply, NotesTarget } from '../../core/messaging/protocol';
import type { ContextRepo } from '../../storage/context-repo';
import type { MeetingRepo } from '../../storage/meeting-repo';

export interface ContextCommandDeps {
  contexts: Pick<ContextRepo, 'get' | 'set' | 'remove'>;
  meetings: Pick<MeetingRepo, 'getMeeting'>;
  now(): number;
  /** Receives only the command and an outcome kind. */
  logger: Logger;
}

type ContextCommand = Extract<Command, { type: 'context/set' | 'context/remove' }>;

async function keyFor(target: NotesTarget, deps: ContextCommandDeps): Promise<string | null> {
  if (target.kind === 'next') return NEXT_MEETING_KEY;
  return (await deps.meetings.getMeeting(target.meetingId)) ? target.meetingId : null;
}

export async function handleContextCommand(
  command: Extract<ContextCommand, { type: 'context/set' }>,
  deps: ContextCommandDeps,
): Promise<NotesSetReply>;
export async function handleContextCommand(
  command: Extract<ContextCommand, { type: 'context/remove' }>,
  deps: ContextCommandDeps,
): Promise<NotesRemoveReply>;
export async function handleContextCommand(
  command: ContextCommand,
  deps: ContextCommandDeps,
): Promise<NotesSetReply | NotesRemoveReply>;
export async function handleContextCommand(
  command: ContextCommand,
  deps: ContextCommandDeps,
): Promise<NotesSetReply | NotesRemoveReply> {
  const key = await keyFor(command.target, deps).catch(() => null);
  if (key === null) return { ok: false, kind: 'unknown-meeting' };
  try {
    if (command.type === 'context/remove') {
      await deps.contexts.remove(key, deps.now());
      deps.logger.info('notes removed', { target: command.target.kind });
      return { ok: true };
    }
    const checked = validateNotes(command.notes);
    if (!checked.ok) return { ok: false, kind: checked.kind === 'unreadable' ? 'not-text' : checked.kind };
    const version = await deps.contexts.set(key, checked.notes, deps.now());
    // 012 FR-018: the meeting was deleted after the lookup above; the repo wrote nothing.
    if (version === null) return { ok: false, kind: 'unknown-meeting' };
    deps.logger.info('notes set', { target: command.target.kind, version });
    return { ok: true, version };
  } catch {
    deps.logger.warn('notes not saved', { command: command.type });
    return { ok: false, kind: 'save-failed' };
  }
}
