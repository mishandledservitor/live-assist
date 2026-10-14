import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatRepo } from '../../storage/chat-repo';
import { ContextRepo } from '../../storage/context-repo';
import { openLiveAssistDb } from '../../storage/db';
import { MainViewStore } from '../../storage/main-view-store';
import { MeetingRepo } from '../../storage/meeting-repo';
import { PanelSettingsStore } from '../../storage/panel-settings-store';
import { chromeAccountApi } from './account-api';
import { App } from './App';
import { createChatApi } from './chat-api';
import { createMeetingApi, type LivePort } from './meeting-api';
import { createNotesApi } from './notes-api';
import { chromeSettingsApi } from './settings-api';
import { createTranscriptsApi } from './transcripts-api';
import './style.css';

// The panel's store cannot read the API key (001 FR-003a); the hint comes from the service worker.
const api = chromeSettingsApi(PanelSettingsStore.fromChrome());

let repo: Promise<MeetingRepo> | null = null;
const meetingRepo = () => (repo ??= openLiveAssistDb().then((db) => new MeetingRepo(db)));

/**
 * e2e builds open the panel as an ordinary tab, where "the active tab" would be the panel itself; the test names the
 * meeting tab instead. Production builds compile this to undefined.
 */
const e2eTabId =
  import.meta.env.MODE === 'e2e'
    ? Number(new URLSearchParams(location.search).get('e2eTabId')) || undefined
    : undefined;

// 012: when the main view was last cleared, beside the settings; a change made by another window's panel arrives
// through chrome.storage.onChanged.
const mainView = new MainViewStore(chrome.storage.local, {
  subscribe(listener) {
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local') for (const key of Object.keys(changes)) listener(key);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  },
});

const meetings = createMeetingApi({
  activeTabId: async () => e2eTabId ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id,
  sendCommand: (command) => chrome.runtime.sendMessage(command),
  // Same extension origin as the offscreen document, so the panel reads the stored meeting directly when nothing
  // is running; deletion happens only when nothing is running (FR-029).
  repo: meetingRepo,
  connect: (name): LivePort => {
    const port = chrome.runtime.connect({ name });
    return {
      onMessage: { addListener: (l) => port.onMessage.addListener((m: unknown) => l(m)) },
      onDisconnect: {
        addListener: (l) =>
          port.onDisconnect.addListener(() => {
            // Reading lastError marks it handled: no offscreen document simply means nothing is running.
            void chrome.runtime.lastError;
            l();
          }),
      },
      disconnect: () => port.disconnect(),
      postMessage: (m) => port.postMessage(m),
    };
  },
  rememberSpeakerName: (captionName, displayName) => api.rememberSpeakerName(captionName, displayName),
  mainView,
  now: () => Date.now(),
});

/** The `chat` port to the service worker (003 contracts/chat-messages.md); the same shape as the live port. */
const connectPort = (name: string): LivePort => {
  const port = chrome.runtime.connect({ name });
  return {
    onMessage: { addListener: (l) => port.onMessage.addListener((m: unknown) => l(m)) },
    onDisconnect: {
      addListener: (l) =>
        port.onDisconnect.addListener(() => {
          void chrome.runtime.lastError;
          l();
        }),
    },
    disconnect: () => port.disconnect(),
    postMessage: (m) => port.postMessage(m),
  };
};

// 003: questions go to the service worker; the panel reads the stored chat for the meeting it shows.
let chatRepo: Promise<ChatRepo> | null = null;
const chat = createChatApi({
  connect: connectPort,
  repo: () => (chatRepo ??= openLiveAssistDb().then((db) => new ChatRepo(db))),
});

// 008: the panel reads notes from IndexedDB; every change goes through the service worker.
let contextRepo: Promise<ContextRepo> | null = null;
const notes = createNotesApi({
  sendCommand: (command) => chrome.runtime.sendMessage(command),
  repo: () => (contextRepo ??= openLiveAssistDb().then((db) => new ContextRepo(db))),
});

// 012: the Transcripts screen reads and deletes stored meetings through the same repository.
const transcripts = createTranscriptsApi({ repo: meetingRepo });

const root = document.getElementById('root');
if (!root) throw new Error('side panel root element missing');

createRoot(root).render(
  <StrictMode>
    <App
      api={api}
      meetings={meetings}
      account={chromeAccountApi()}
      chat={chat}
      notes={notes}
      transcripts={transcripts}
    />
  </StrictMode>,
);
