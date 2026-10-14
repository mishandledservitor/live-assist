// The Meet content script (002 research R2, contracts/meet-bridge.md): idle until the service worker attaches it to the
// running meeting, then the page agent opens the `platform:meet` port to the offscreen document. All page reading
// lives in src/platforms/meet; this file only wires it to chrome.runtime.
import { defineContentScript } from 'wxt/utils/define-content-script';
import { MEET_PORT_NAME, parseAttach, parseReadyReply } from '../../core/messaging/meet-bridge';
import { createPageAgent } from '../../platforms/meet/page-agent';
import { anonymiseMeetPage } from '../../platforms/meet/snapshot';

/** Spike builds only (002 T067): the spike recorder page asks for an anonymised copy of this page. */
const SPIKE = import.meta.env.MODE === 'spike';

function spikeSnapshotRequest(raw: unknown): { extraNames: string[] } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (m.type !== 'spike/meet-snapshot') return null;
  const names = Array.isArray(m.extraNames) ? m.extraNames.filter((n): n is string => typeof n === 'string') : [];
  return { extraNames: names };
}

export default defineContentScript({
  matches: ['https://meet.google.com/*'],
  runAt: 'document_idle',
  main() {
    const agent = createPageAgent({ doc: document, connect: () => chrome.runtime.connect({ name: MEET_PORT_NAME }) });

    chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
      if (SPIKE) {
        const request = spikeSnapshotRequest(raw);
        if (request) {
          sendResponse(anonymiseMeetPage(document, request));
          return false;
        }
      }
      const m = parseAttach(raw);
      if (m?.type === 'meet/attach') {
        // Show or hide is set before the port opens, so before captions can be enabled (002 FR-029).
        agent.showCaptions(m.showCaptions);
        agent.attach(m.meetingId);
      } else if (m?.type === 'meet/show-captions') agent.showCaptions(m.show);
      else if (m?.type === 'meet/detach') agent.detach();
      else return false;
      sendResponse({ ok: true });
      return false;
    });

    // After a reload mid-meeting, the service worker says whether this tab is the running meeting's.
    void chrome.runtime
      .sendMessage({ type: 'meet/ready' })
      .then((reply: unknown) => {
        const r = parseReadyReply(reply);
        if (!r?.attach) return;
        agent.showCaptions(r.showCaptions);
        agent.attach(r.meetingId);
      })
      .catch(() => undefined);
  },
});
