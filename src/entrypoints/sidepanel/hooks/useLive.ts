// Live meeting state for the side panel (contracts/extension-messages.md "Live updates"): follows the offscreen
// runtime over the `live` port; when no runtime answers (nothing running, or it just ended), shows the most recent
// stored meeting read straight from IndexedDB with status idle.
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseLive, type PartialLine } from '../../../core/messaging/protocol';
import { initialStatus, type StatusSnapshot } from '../../../core/status/status';
import type { Meeting, StreamId, TranscriptSegment } from '../../../core/transcript/model';

export interface LiveApi {
  /** Opens the live port. onDisconnect fires when the other end goes away (or never existed). Returns a closer. */
  connect(onEvent: (raw: unknown) => void, onDisconnect: () => void): () => void;
  latestStored(): Promise<{ meeting: Meeting; segments: TranscriptSegment[] } | null>;
}

export interface LiveState {
  meeting: Meeting | null;
  segments: TranscriptSegment[];
  partials: PartialLine[];
  status: StatusSnapshot;
  /** True while a running meeting is feeding this panel. */
  connected: boolean;
}

const EMPTY: LiveState = { meeting: null, segments: [], partials: [], status: initialStatus(), connected: false };

function setPartial(partials: PartialLine[], stream: StreamId, text: string): PartialLine[] {
  const rest = partials.filter((p) => p.stream !== stream);
  return text === '' ? rest : [...rest, { stream, text }];
}

export function useLive(api: LiveApi): LiveState & { refresh: () => void } {
  const [state, setState] = useState<LiveState>(EMPTY);
  const generation = useRef(0);
  const close = useRef<(() => void) | null>(null);

  const open = useCallback(() => {
    close.current?.();
    const gen = ++generation.current;
    const current = () => gen === generation.current;

    close.current = api.connect(
      (raw) => {
        if (!current()) return;
        const e = parseLive(raw);
        if (!e) return;
        setState((s) => {
          switch (e.type) {
            case 'live/snapshot':
              return {
                meeting: e.meeting,
                segments: e.segments,
                partials: e.partials,
                status: e.status,
                connected: true,
              };
            case 'live/segment':
              if (s.segments.some((x) => x.id === e.segment.id)) return s;
              return { ...s, segments: [...s.segments, e.segment] };
            case 'live/partial':
              return { ...s, partials: setPartial(s.partials, e.stream, e.text) };
            case 'live/status':
              return { ...s, status: e.status };
            case 'live/segment-updated': {
              // Replace in place; every other line keeps its object so memoised lines do not re-render.
              const i = s.segments.findIndex((x) => x.id === e.segment.id);
              if (i < 0) return s;
              const segments = [...s.segments];
              segments[i] = e.segment;
              return { ...s, segments };
            }
            case 'live/labels':
              if (s.meeting?.id !== e.meetingId) return s;
              return { ...s, meeting: { ...s.meeting, speakerRenames: e.speakerRenames } };
            case 'live/captions-kept':
              // 013: the running meeting has kept captions. The panel learns that much and never their text.
              if (s.meeting?.id !== e.meetingId || s.meeting.hasCaptions === true) return s;
              return { ...s, meeting: { ...s.meeting, hasCaptions: true } };
          }
        });
      },
      () => {
        if (!current()) return;
        setState((s) => ({ ...s, connected: false, partials: [] }));
        void api.latestStored().then((stored) => {
          if (!current()) return;
          // The same meeting just ended: keep its last status so the reason it stopped stays visible (FR-022).
          setState((s) => ({
            ...EMPTY,
            meeting: stored?.meeting ?? null,
            segments: stored?.segments ?? [],
            status: stored && s.meeting?.id === stored.meeting.id ? s.status : EMPTY.status,
          }));
        });
      },
    );
  }, [api]);

  useEffect(() => {
    open();
    return () => {
      generation.current += 1;
      close.current?.();
      close.current = null;
    };
  }, [open]);

  return { ...state, refresh: open };
}
