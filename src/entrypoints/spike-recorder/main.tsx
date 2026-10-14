// DEV-ONLY Spike A recorder page (pnpm build:spike; excluded from production builds in wxt.config.ts).
// Thin glue around recorder.ts (tested) and the real capture code; the user exercises it during Spike A.
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browserCaptureDeps } from '../../audio/browser-deps';
import { captureMic, captureTab } from '../../audio/capture';
import type { EchoCondition } from '../../../spikes/lib/echo-runs';
import { keyFileText, meetDownloadPath, parseNameList } from './meet-helpers';
import { buildRunPlan, runFolderName, startRun, type RecorderCapture, type RunningRecording } from './recorder';

const capture: RecorderCapture = {
  tab: (streamId, onFrame) => captureTab(streamId, browserCaptureDeps(), onFrame),
  mic: (constraints, onFrame) => captureMic(constraints, browserCaptureDeps(), onFrame),
};

type RunState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'recording'; since: number }
  | { kind: 'saved'; folder: string }
  | { kind: 'error'; message: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function explain(error: string): string {
  if (/not been invoked/i.test(error)) {
    return 'Chrome has not granted capture of that tab. Go to the meeting tab, click the live-assist toolbar icon there, come back and press Record again.';
  }
  return error;
}

async function download(folder: string, name: string, bytes: Uint8Array): Promise<void> {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>]));
  try {
    await chrome.downloads.download({ url, filename: `live-assist-echo/${folder}/${name}`, saveAs: false });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/** Saves text into Downloads/live-assist-meet/ (002 T067). */
async function downloadText(path: string, text: string, type: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([text], { type }));
  try {
    await chrome.downloads.download({ url, filename: path, saveAs: false });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null;
const keyOf = (v: Rec) => (isRec(v.key) ? (v.key as Record<string, string>) : null);

/**
 * 002 Phase 7 helpers: an anonymised snapshot of the chosen Meet tab (asked from the content script) and the running
 * meeting's alignment trace (asked from the offscreen document). Each also saves its placeholder key, never to commit.
 */
function MeetHelpers({ target }: { target: number | null }) {
  const [label, setLabel] = useState('in-call-captions-on');
  const [names, setNames] = useState('');
  const [result, setResult] = useState<string | null>(null);

  async function saveSnapshot() {
    setResult(null);
    if (target === null) return setResult('Pick the Meet tab in step 1 first.');
    try {
      const reply: unknown = await chrome.tabs.sendMessage(target, {
        type: 'spike/meet-snapshot',
        extraNames: parseNameList(names),
      });
      const key = isRec(reply) ? keyOf(reply) : null;
      if (!isRec(reply) || typeof reply.html !== 'string' || !key)
        return setResult('No answer from that tab. Is it a Meet call? Reload it after loading the spike build.');
      const at = new Date();
      await downloadText(meetDownloadPath('snapshot', label, at), reply.html, 'text/html');
      await downloadText(meetDownloadPath('key', label, at), keyFileText(key), 'text/plain');
      setResult(`Saved ${meetDownloadPath('snapshot', label, at)} and its names key.`);
    } catch (e) {
      setResult(`Couldn't save the snapshot: ${message(e)}`);
    }
  }

  async function saveTrace() {
    setResult(null);
    try {
      const reply: unknown = await chrome.runtime.sendMessage({ type: 'spike/alignment-trace' });
      const key = isRec(reply) ? keyOf(reply) : null;
      if (!isRec(reply) || !key) return setResult('No meeting is running. Save the trace before pressing Stop.');
      const at = new Date();
      await downloadText(
        meetDownloadPath('trace', '', at),
        `${JSON.stringify(reply.trace, null, 2)}\n`,
        'application/json',
      );
      await downloadText(meetDownloadPath('key', 'trace', at), keyFileText(key), 'text/plain');
      setResult(`Saved ${meetDownloadPath('trace', '', at)} and its names key.`);
    } catch (e) {
      setResult(`Couldn't save the trace: ${message(e)}`);
    }
  }

  return (
    <>
      <h2>Meet helpers (feature 002)</h2>
      <p>
        Saves into <code>Downloads/live-assist-meet/</code>. Names become <code>Participant A</code>…; each save also
        writes a <code>…names-key-DO-NOT-COMMIT.txt</code> so you can tell who is who. Full steps:{' '}
        <code>specs/002-meet-speaker-names/manual-check.md</code>.
      </p>
      <label>
        What the page shows{' '}
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="in-call-captions-on" />
      </label>
      <br />
      <label>
        Extra names to scrub (yours, attendees who never spoke; one per line)
        <br />
        <textarea rows={3} cols={50} value={names} onChange={(e) => setNames(e.target.value)} />
      </label>
      <br />
      <button type="button" onClick={() => void saveSnapshot()}>
        Save Meet snapshot
      </button>{' '}
      <button type="button" onClick={() => void saveTrace()}>
        Save alignment trace
      </button>
      {result && <p role="status">{result}</p>}
    </>
  );
}

async function otherTabs(): Promise<chrome.tabs.Tab[]> {
  const self = await chrome.tabs.getCurrent();
  return (await chrome.tabs.query({})).filter((t) => t.id !== undefined && t.id !== self?.id);
}

function Recorder() {
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  const [plan, setPlan] = useState<EchoCondition[] | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, RunState>>({});
  const active = useRef<{ id: string; rec: RunningRecording } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refreshTabs = () => void otherTabs().then(setTabs);

  useEffect(() => {
    void otherTabs().then(setTabs);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function checkMic() {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      const caps = track?.getCapabilities() as { echoCancellation?: unknown[] } | undefined;
      stream.getTracks().forEach((t) => t.stop());
      setPlan(buildRunPlan(caps?.echoCancellation));
    } catch (e) {
      setMicError(message(e));
    }
  }

  const setState = (id: string, s: RunState) => setStates((all) => ({ ...all, [id]: s }));

  async function record(condition: EchoCondition) {
    if (target === null || active.current) return;
    setBusy(true);
    setState(condition.id, { kind: 'starting' });
    try {
      const self = await chrome.tabs.getCurrent();
      const tabStreamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: target,
        ...(self?.id !== undefined ? { consumerTabId: self.id } : {}),
      });
      const rec = await startRun({ condition, tabStreamId, capture });
      active.current = { id: condition.id, rec };
      setState(condition.id, { kind: 'recording', since: now });
    } catch (e) {
      setBusy(false);
      setState(condition.id, { kind: 'error', message: explain(message(e)) });
    }
  }

  async function stop(condition: EchoCondition) {
    const current = active.current;
    if (current?.id !== condition.id) return;
    active.current = null;
    setBusy(false);
    try {
      const { files } = await current.rec.stop();
      const folder = runFolderName(condition, new Date());
      for (const f of files) await download(folder, f.name, f.bytes);
      setState(condition.id, { kind: 'saved', folder });
    } catch (e) {
      setState(condition.id, { kind: 'error', message: message(e) });
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '0 auto', padding: 16 }}>
      <h1>Spike A: echo recorder (dev only)</h1>
      <p>
        Records the meeting tab and your microphone at the same time, through the same capture code the extension uses,
        and saves each run to <code>Downloads/live-assist-echo/run-…/</code> as <code>tab.wav</code>,{' '}
        <code>mic.wav</code> and <code>run.json</code>. Nothing is sent anywhere. Full steps:{' '}
        <code>spikes/README.md</code>.
      </p>
      <h2>1. Meeting tab</h2>
      <p>
        Join the call in another tab and click the live-assist toolbar icon on that tab once (this lets Chrome capture
        it). Then pick it here.
      </p>
      <label>
        Meeting tab{' '}
        <select value={target ?? ''} onChange={(e) => setTarget(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">Choose…</option>
          {tabs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title ?? `Tab ${t.id}`}
              {t.audible ? ' (playing sound)' : ''}
            </option>
          ))}
        </select>
      </label>{' '}
      <button type="button" onClick={refreshTabs}>
        Refresh list
      </button>
      <MeetHelpers target={target} />
      <h2>2. Microphone</h2>
      <button type="button" onClick={() => void checkMic()}>
        Check microphone
      </button>
      {micError && <p role="alert">Microphone unavailable: {micError}</p>}
      {plan && (
        <p>
          Microphone ready.{' '}
          {plan.some((c) => c.run === 4)
            ? 'This Chrome supports echoCancellation "all": 4 runs.'
            : '3 runs (this Chrome does not offer echoCancellation "all").'}
        </p>
      )}
      <h2>3. Runs</h2>
      {!plan && <p>Check the microphone first.</p>}
      {plan?.map((c) => {
        const s = states[c.id] ?? { kind: 'idle' };
        const recording = s.kind === 'recording';
        return (
          <section key={c.id} style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <h3>
              Run {c.run}: {c.title}
            </h3>
            <p>{c.instructions}</p>
            {recording ? (
              <button type="button" onClick={() => void stop(c)}>
                Stop and save
              </button>
            ) : (
              <button type="button" disabled={target === null || busy} onClick={() => void record(c)}>
                Record
              </button>
            )}
            {s.kind === 'starting' && <span> Starting…</span>}
            {recording && <span> Recording… {Math.max(0, Math.round((now - s.since) / 1000))} s</span>}
            {s.kind === 'saved' && <span> Saved to live-assist-echo/{s.folder}/</span>}
            {s.kind === 'error' && <p role="alert">{s.message}</p>}
          </section>
        );
      })}
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('recorder root element missing');
createRoot(root).render(
  <StrictMode>
    <Recorder />
  </StrictMode>,
);
