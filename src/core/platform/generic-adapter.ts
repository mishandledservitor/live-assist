import type { CaptionsCapability, MuteCapability, PlatformAdapter } from './adapter';

/** Fallback for every site without a dedicated adapter (every site but Google Meet calls, 002 FR-012). */
export class GenericAdapter implements PlatformAdapter {
  readonly id = 'generic' as const;

  readonly captions: CaptionsCapability = {
    supported: false,
    reason: 'Speaker names work on Google Meet only.',
  };

  readonly mute: MuteCapability = { supported: false, reason: "This site's mute state cannot be read." };

  matches(_url: URL): boolean {
    return true;
  }

  metadata(): Promise<{ title?: string; meetingCode?: string }> {
    return Promise.resolve({});
  }

  dispose(): void {
    // Nothing to release.
  }
}
