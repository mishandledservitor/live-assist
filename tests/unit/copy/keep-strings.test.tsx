// 006 T046 (FR-017, US5-3): every copy-review Keep string (K1–K46) still reads exactly as before. Strings the panel
// shows are checked on the rendered screen in the state that shows them; reasons produced deeper down (Meet, runtime,
// provider) and the manifest are checked as the literals that produce them.
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_ERROR_MESSAGES, describeAccount } from '@/core/account/usage';
import { MEET_REASONS } from '@/core/messaging/meet-bridge';
import {
  MUTE_CHECKING_REASON,
  MUTE_UNREADABLE_REASON,
  MUTED_REASON,
  initialStatus,
  reduceStatus,
} from '@/core/status/status';
import type { Meeting, TranscriptSegment } from '@/core/transcript/model';
import { segmentId } from '@/core/transcript/model';
import { MIC_PERMISSION_TEXT } from '@/entrypoints/mic-permission/permission';
import { App } from '@/entrypoints/sidepanel/App';
import { Transcript } from '@/entrypoints/sidepanel/components/Transcript';
import { TranscriptsScreen } from '@/entrypoints/sidepanel/components/TranscriptsScreen';
import { KEY_ERROR_MESSAGES } from '@/entrypoints/sidepanel/key-messages';
import { startErrorMessage } from '@/entrypoints/sidepanel/start-messages';
import { statusDots } from '@/entrypoints/sidepanel/status-view';
import { captionsFileName, downloadZipName, transcriptDownloadName } from '@/core/export/download-names';
import { collectProjectStrings } from '../../support/copy-scan';
import { meetingWithCaptions } from '../../support/stored-meetings';
import {
  spokenBy,
  spokenBySelf,
  storedMeeting,
  storedSegment,
  STORED_START,
  titled,
} from '../../support/stored-meetings';
import { fakeChatApi } from '../sidepanel/fake-chat-api';
import { fakeMeetingApi } from '../sidepanel/fake-meeting-api';
import { fakeNotesApi } from '../sidepanel/fake-notes-api';
import { notesErrorText } from '@/core/chat/notes-messages';
import type { ChatTurnView } from '@/core/chat/turn';
import { fakeSettingsApi } from '../sidepanel/fake-settings-api';
import { fakeTranscriptsApi, summarised, type FakeStoredMeeting } from '../sidepanel/fake-transcripts-api';

afterEach(cleanup);

const ROOT = join(import.meta.dirname, '../../..');
const body = () => document.body.textContent ?? '';
const shown = (text: string) => expect(body()).toContain(text);

const meeting = (endedAt: number | null): Meeting => ({
  id: 'm1',
  startedAt: 1,
  endedAt,
  endReason: endedAt === null ? null : 'user-stop',
  source: { url: 'https://meet.google.com/x', title: 'Standup', platform: 'meet' },
  languageMode: { kind: 'auto' },
  userName: 'Alex',
  speakerRenames: {},
  schemaVersion: 1,
});

const seg = (seq: number, speakerLabel = 'Others', labelSource: TranscriptSegment['labelSource'] = 'fallback') =>
  ({
    id: segmentId('m1', 'mixed', seq),
    meetingId: 'm1',
    stream: 'mixed',
    seq,
    startMs: seq * 1000,
    endMs: seq * 1000 + 500,
    text: `line ${seq}`,
    language: null,
    speakerLabel,
    labelSource,
    captionName: labelSource === 'caption' ? speakerLabel : null,
    captionSelf: false,
    labelOverride: null,
    schemaVersion: 2,
    words: [],
    timing: 'words',
    sessionId: 's',
    createdAt: 0,
  }) satisfies TranscriptSegment;

const RETENTION_SUMMARY =
  "Audio is sent to ElevenLabs for transcription. ElevenLabs may keep audio and transcripts under your account's settings and may use them to improve its models.";
const K15 =
  'To stop your audio being used for training, sign in to ElevenLabs, open your account settings and turn off “Improve the models for everyone”. Details: ElevenLabs privacy policy.';

describe('Keep strings: setup (K8–K11, K14–K16, K29)', () => {
  it('first-run screen', async () => {
    const { api } = fakeSettingsApi();
    render(<App api={api} meetings={fakeMeetingApi().api} />);
    shown('Loading…');
    await screen.findByRole('region', { name: 'Set up live-assist' });
    for (const text of [
      'Set up live-assist',
      'Your name',
      'ElevenLabs API key',
      'Check keys and save', // 006 R28
      'Your own lines are labelled with this name.',
      'Stored only in this browser on this computer (never synced). It needs Speech to Text access.',
      'What ElevenLabs keeps',
      RETENTION_SUMMARY,
      'ElevenLabs bills about the length of each meeting.',
      K15,
    ])
      shown(text);
    expect(screen.getByRole('heading', { level: 1, name: 'live-assist' })).toBeTruthy();
  });

  it('after the key is saved', async () => {
    const { api } = fakeSettingsApi();
    render(<App api={api} meetings={fakeMeetingApi().api} />);
    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Alex' } });
    fireEvent.change(screen.getByLabelText('ElevenLabs API key'), { target: { value: 'sk_test_fixture_keep_0001' } });
    fireEvent.change(screen.getByLabelText('OpenAI API key'), { target: { value: 'test-fixture-keep-0002' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check keys and save' }));
    await screen.findByRole('button', { name: 'Done' });
    shown(
      'live-assist also transcribes your microphone. Chrome asks for microphone access once, in a separate tab; after that it is used only while you transcribe.',
    );
    expect(screen.getByRole('button', { name: 'Allow microphone' })).toBeTruthy();
  });

  it('key errors (K12)', () => {
    expect(Object.values(KEY_ERROR_MESSAGES)).toEqual(
      expect.arrayContaining([
        'Enter your ElevenLabs API key.',
        'ElevenLabs rejected this key. Check that you copied the whole key, or create a new one in your ElevenLabs account.',
        'This key is not allowed to use speech-to-text. In your ElevenLabs account, edit the key and enable Speech to Text, then try again.',
        'Could not reach ElevenLabs. Check your internet connection and try again.',
        'ElevenLabs is limiting requests right now. Wait a minute and try again.',
        'ElevenLabs returned an unexpected response. Try again in a moment.',
      ]),
    );
  });
});

describe('Keep strings: main view (K1–K7, K27, K32)', () => {
  const ready = (consentReminder = true, keyHint: string | null = 'a1b2') =>
    fakeSettingsApi({ userName: 'Alex', firstRunComplete: true, consentReminder }, keyHint).api;

  it('idle, with the consent reminder', async () => {
    render(<App api={ready()} meetings={fakeMeetingApi().api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Consent reminder' });
    expect(dialog.textContent).toContain(
      'Tell everyone in the meeting that it is being transcribed before you start. Their voices are sent to ElevenLabs and the transcript is kept on this computer. You can turn this reminder off in Settings.',
    );
    expect(within(dialog).getByRole('button', { name: "I've told them — start" })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeTruthy();
    shown('No transcript yet.');
  });

  it('not ready (K3)', async () => {
    render(<App api={ready(true, null)} meetings={fakeMeetingApi().api} />);
    expect(await screen.findByText('Add your ElevenLabs API key in Settings to start.')).toBeTruthy();
  });

  it('start errors (K4, K5)', async () => {
    expect(startErrorMessage('settings-incomplete')).toBe(
      'Finish setup first: add your name and a working ElevenLabs key in Settings.',
    );
    expect(startErrorMessage('not-invoked')).toBe(
      'live-assist cannot hear this tab yet. Click the live-assist icon in the Chrome toolbar while you are on the meeting tab, then press Start again.',
    );
    expect(startErrorMessage('offscreen-failed')).toBe(
      "Transcription couldn't start because the audio capture failed. Press Start to try again; if it keeps failing, reload live-assist in chrome://extensions.",
    );
    const meetings = fakeMeetingApi();
    meetings.failNextStart({ ok: false, error: 'already-running', runningTabTitle: 'Weekly sync' });
    render(<App api={ready(false)} meetings={meetings.api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('button', { name: 'Stop that one' })).toBeTruthy();
  });

  it('a stopped meeting with its delete confirmation (K6)', async () => {
    render(<App api={ready()} meetings={fakeMeetingApi({ meeting: meeting(5), segments: [seg(1)] }).api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete transcript' }));
    const confirm = screen.getByRole('group', { name: 'Confirm delete' });
    expect(confirm.textContent).toContain('Delete this transcript permanently? It cannot be recovered.');
    expect(within(confirm).getByRole('button', { name: 'Delete permanently' })).toBeTruthy();
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('the transcript footer of a stopped meeting: Download, Close, then Delete, nothing else (K40, 007; K46, 014)', async () => {
    render(<App api={ready()} meetings={fakeMeetingApi({ meeting: meeting(5), segments: [seg(1)] }).api} />);
    const download = await screen.findByRole('button', { name: 'Download transcript' });
    expect(download.textContent).toBe('Download transcript');
    expect(document.querySelector('.transcript-footer')!.textContent).toBe(
      'Download transcriptClose transcriptDelete transcript',
    );
  });
});

// 014 T008 (FR-010; copy-review K46, spec "Proposed copy" X1, X2): `Close transcript` and its failure, and nothing
// else: the clean main view it leaves shows only K27.
describe('Keep strings: Close transcript (K46, 014)', () => {
  const ready = () => fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2').api;

  it('X1 under a stopped meeting; afterwards the main view shows only K27', async () => {
    render(<App api={ready()} meetings={fakeMeetingApi({ meeting: meeting(5), segments: [seg(1)] }).api} />);
    const close = await screen.findByRole('button', { name: 'Close transcript' });
    expect(close.textContent).toBe('Close transcript');
    fireEvent.click(close);
    await waitFor(() =>
      expect(screen.getByRole('log', { name: 'Transcript lines' }).textContent).toBe('No transcript yet.'),
    );
    expect(document.querySelector('.transcript-footer')).toBeNull();
    expect(screen.queryByRole('status', { name: /closed/i })).toBeNull();
  });

  it('X2 after a close that cannot be remembered', async () => {
    const meetings = fakeMeetingApi({ meeting: meeting(5), segments: [seg(1)] });
    meetings.api.clearMainView.mockImplementationOnce(() => Promise.reject(new Error('quota')));
    render(<App api={ready()} meetings={meetings.api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Close transcript' }));
    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't close this transcript. Try again.");
  });
});

describe('Keep strings: Settings screen (K13, K14–K20, K24–K26)', () => {
  it('shows every Keep string of the screen', async () => {
    const usage = { tier: 'creator', creditsUsed: 19_360, creditsLimit: 121_000, resetAt: null };
    const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2');
    render(
      <App
        api={api}
        meetings={fakeMeetingApi().api}
        account={{ usage: () => Promise.resolve({ ok: true as const, usage }) }}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    await screen.findByText(describeAccount(usage, Date.now()).line);
    for (const text of [
      'Settings',
      'ElevenLabs API key',
      'Saved key: ••••a1b2',
      'Check and replace key',
      'Remove key',
      'Save name',
      'ElevenLabs account',
      '19,360 of 121,000 credits used · 101,640 left',
      'The percentage is of your plan’s credits, shared by everything you use ElevenLabs for, not only live-assist.',
      'Key terms',
      'Names and words that should be recognised correctly (at most 50, each up to 20 characters). Used from the next Start.',
      // K17a (001 FR-004a): the field takes a list.
      'New key terms, separated by commas or one per line',
      'Add terms',
      'Consent reminder',
      // K39 (design decision 41).
      'Clean transcript',
      'Leave out fillers and false starts',
      // K42 (design decision 61, 002 FR-028).
      'Show Meet captions',
      'Remembered names',
      "When you rename someone Meet's captions named, the new name is used for them in later meetings too. Changes here apply from the next meeting.",
      'Microphone',
      'Allow microphone',
      'What ElevenLabs keeps',
      RETENTION_SUMMARY,
      K15,
    ])
      shown(text);
    await waitFor(() => shown('No remembered names yet. Rename a speaker in a Meet transcript to add one.'));
    expect(screen.getByRole('button', { name: 'Refresh account status' }).textContent).toBe('↻');
    fireEvent.click(
      within(screen.getByRole('region', { name: 'ElevenLabs API key' })).getByRole('button', { name: 'Remove key' }),
    );
    shown('Remove the saved key? Transcription cannot start without one.');
    expect(screen.getByRole('button', { name: 'Yes, remove' })).toBeTruthy();
  });

  it('account errors (K26)', () => {
    expect(Object.values(ACCOUNT_ERROR_MESSAGES)).toEqual([
      'No ElevenLabs API key is saved, so your plan cannot be checked.',
      "API key lacks the 'User: Read' permission — enable it on the key at elevenlabs.io",
      'ElevenLabs rejected the API key, so your plan cannot be checked.',
      'Could not reach ElevenLabs to check your plan.',
      'ElevenLabs is rate-limiting requests; refresh again in a minute.',
      'ElevenLabs gave an unexpected answer about your plan.',
    ]);
  });
});

describe('Keep strings: transcript and label editor (K28)', () => {
  it('labels and the editor', () => {
    render(
      <Transcript
        segments={[seg(1, 'Emma Jones', 'caption'), seg(2)]}
        partials={[]}
        meeting={{ speakerRenames: {} }}
        onRenameSpeaker={vi.fn()}
        onOverrideLine={vi.fn()}
      />,
    );
    const emma = screen.getByRole('button', { name: /^Emma Jones/ });
    expect(emma.getAttribute('title')).toBe('Confirmed speaker — change the name');
    fireEvent.click(emma);
    const editor = screen.getByRole('dialog', { name: 'Edit speaker name' });
    expect(within(editor).getByRole('combobox', { name: 'Speaker name' })).toBeTruthy();
    expect(within(editor).getByRole('button', { name: 'Rename “Emma Jones” everywhere' })).toBeTruthy();
    expect(within(editor).getByRole('button', { name: 'Just this line' })).toBeTruthy();
    expect(within(editor).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Transcript' })).toBeTruthy();
    expect(screen.getByRole('log', { name: 'Transcript lines' })).toBeTruthy();
    expect(body()).toContain('Others');
  });
});

// T112 (design decision 37, 002 FR-026): the pending placeholder and its accessible name.
describe('Keep strings: pending placeholder (K35)', () => {
  it('a line whose name is not settled and the in-progress line show "…", read as "Speaker pending"', () => {
    render(
      <Transcript
        segments={[{ ...seg(1), labelPending: true }]}
        partials={[{ stream: 'mixed', text: 'and then' }]}
        meeting={{ speakerRenames: {} }}
      />,
    );
    const marks = document.querySelectorAll('[data-label-pending]');
    expect(marks).toHaveLength(2);
    for (const mark of marks) {
      expect(mark.querySelector('[aria-hidden="true"]')?.textContent).toBe('…');
      expect(mark.textContent).toBe('…Speaker pending');
      expect(mark.getAttribute('title')).toBe('Speaker pending');
    }
  });
});

describe('Keep strings: status (K21, K22, K23, K33)', () => {
  it('state words and labels', () => {
    const words = new Set<string>();
    const add = (s = initialStatus(), running = true) =>
      statusDots(s, { running }).dots.forEach((d) => {
        words.add(d.label);
        words.add(d.text);
      });
    add(initialStatus(), false);
    add(reduceStatus(initialStatus(), { type: 'capture', state: 'starting' }));
    expect([...words]).toEqual(
      expect.arrayContaining([
        'Capture',
        'Transcription',
        'Speaker names',
        'Microphone',
        'Not capturing',
        'Starting…',
        'Not running',
        'Off',
      ]),
    );
    expect([MUTED_REASON, MUTE_CHECKING_REASON, MUTE_UNREADABLE_REASON]).toEqual([
      'Muted in Meet — not sent',
      "Checking Meet's mute state — not sent",
      "Not sent — can't see Meet's mute button",
    ]);
  });

  it('Meet reasons (K22)', () => {
    expect(Object.values(MEET_REASONS)).toEqual([
      'Turning on Meet captions…',
      'Join the call to get speaker names',
      "Couldn't turn on Meet captions",
      'Captions were turned off',
      'Connecting to the Meet page…',
      "Couldn't connect to the Meet page — reload the Meet tab",
      'The Meet page reloaded — reconnecting…',
    ]);
  });

  it('state words, runtime and provider reasons are still literals in src (K21, K23)', () => {
    const all = [...collectProjectStrings(ROOT).values()].flat();
    for (const literal of [
      'Capturing the meeting tab',
      'Connecting…',
      'Reconnecting…',
      'Stopped working',
      'Muted — not sent',
      'Not available',
      'Failed',
      'Stopped',
      'The meeting tab could not be transcribed: ',
      'Could not reach ElevenLabs: ',
      'No microphone found — connect one and press Start again. ',
      'Only the meeting tab is being transcribed; your own speech is not.',
      'About ',
      ' s of audio during the reconnect could not be transcribed.',
      'Connection closed (code ',
      'Could not connect to ElevenLabs (code ',
    ])
      expect(
        all.some((s) => s.includes(literal)),
        literal,
      ).toBe(true);
  });
});

describe('Keep strings: microphone page and manifest (K30, K31)', () => {
  it('mic page', () => {
    expect(MIC_PERMISSION_TEXT.title).toBe('Microphone access for live-assist');
    expect(MIC_PERMISSION_TEXT.result).toEqual({
      granted: 'Microphone allowed. You can close this tab and go back to the side panel.',
      denied:
        'Microphone blocked. Click the icon at the left of the address bar, open Site settings, set Microphone to Allow, then press "Ask again". Until then only the meeting audio is transcribed.',
      'no-device':
        'No microphone was found. Connect one (or check System Settings → Sound → Input), then press "Ask again".',
      busy: 'The microphone is in use by another app or could not be started. Close the other app, then press "Ask again".',
      error: 'Chrome could not open the microphone. Try again; if it keeps failing, restart Chrome.',
    });
    const all = [...collectProjectStrings(ROOT).values()].flat();
    for (const literal of ['live-assist: microphone access', 'Asking Chrome for microphone access…', 'Ask again'])
      expect(
        all.some((s) => s.includes(literal)),
        literal,
      ).toBe(true);
  });

  it('manifest name and action title', () => {
    const config = collectProjectStrings(ROOT).get(join(ROOT, 'wxt.config.ts')) ?? [];
    expect(config).toEqual(expect.arrayContaining(['live-assist', 'Open live-assist']));
  });
});

describe('Keep strings: Ask the transcript (003, K36–K38)', () => {
  const ANTHROPIC_KEEPS =
    'Each question sends the transcript so far, any notes you added to the meeting and this meeting’s questions and answers to Anthropic. Anthropic deletes API requests and answers within 30 days, keeps content its safety systems flag for up to 2 years, and does not train its models on API data by default.';
  const OPENAI_KEEPS =
    'Each question sends the transcript so far, any notes you added to the meeting and this meeting’s questions and answers to OpenAI, with storage turned off. OpenAI keeps API requests for abuse monitoring for up to 30 days and does not train its models on API data by default.';

  it('the setup chat step (K36, K37)', async () => {
    render(<App api={fakeSettingsApi().api} meetings={fakeMeetingApi().api} />);
    await screen.findByRole('region', { name: 'Set up live-assist' });
    for (const text of [
      'Answers from',
      'Claude',
      'OpenAI',
      'OpenAI API key',
      'Stored only in this browser on this computer (never synced).',
      'What OpenAI keeps',
      OPENAI_KEEPS,
      'OpenAI data controls',
    ])
      shown(text);
    fireEvent.click(screen.getByRole('radio', { name: 'Claude' }));
    for (const text of ['Claude API key', 'What Anthropic keeps', ANTHROPIC_KEEPS, 'Anthropic privacy policy'])
      shown(text);
  });

  it('Settings → Questions and the key sections (K37)', async () => {
    const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2', {
      anthropic: null,
      openai: 'abcd',
    });
    render(<App api={api} meetings={fakeMeetingApi().api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    for (const text of ['Questions', 'Answers from', 'Model', 'Claude API key', 'OpenAI API key', 'No key saved.'])
      shown(text);
    shown('What OpenAI keeps');
    shown(OPENAI_KEEPS);
  });

  it('the Ask area (K38)', async () => {
    const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2', {
      anthropic: null,
      openai: null,
    });
    render(
      <App
        api={api}
        meetings={fakeMeetingApi({ meeting: meeting(5), segments: [seg(1)] }).api}
        chat={fakeChatApi({ m1: [] }).api}
      />,
    );
    const box = await screen.findByRole('textbox', { name: 'Question' });
    expect(box.getAttribute('placeholder')).toBe('Ask about this meeting');
    expect(screen.getByRole('button', { name: 'Ask' })).toBeTruthy();
    shown('GPT-6 Luna');
    shown('Add a Claude or OpenAI key in Settings to ask questions.');
  });

  it('waiting for the answer, and no answer (K45, 003 FR-003a and FR-018a, design decision 80)', async () => {
    const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2', {
      anthropic: null,
      openai: 'abcd',
    });
    const turn = (seq: number, over: Partial<ChatTurnView>): ChatTurnView => ({
      id: `m1:chat:${seq}`,
      meetingId: 'm1',
      seq,
      question: `Question ${seq}?`,
      askedAt: 1,
      transcriptUntilMs: 1,
      provider: 'openai',
      requestedModel: 'gpt-6-luna',
      answeredBy: null,
      answer: '',
      status: 'streaming',
      error: null,
      updatedAt: 1,
      schemaVersion: 1,
      ...over,
    });
    render(
      <App
        api={api}
        meetings={fakeMeetingApi({ meeting: meeting(5), segments: [seg(1)] }).api}
        chat={fakeChatApi({ m1: [turn(0, { status: 'failed', error: 'no-answer' }), turn(1, {})] }).api}
      />,
    );
    const strip = await screen.findByRole('region', { name: 'Questions and answers' });
    expect(within(strip).getByRole('alert').textContent).toBe('No answer came back. Ask again.Try again');
    const waiting = within(strip).getByRole('article', { name: 'Question 1?' });
    // The mark is its accessible name and nothing else: no sentence is shown while waiting.
    expect(within(waiting).getByRole('img', { name: 'Waiting for the answer' }).textContent).toBe('');
    expect(waiting.textContent).toBe('');
    expect(
      within(document.querySelector<HTMLElement>('.ask-area')!)
        .getAllByRole('status')
        .map((s) => s.textContent),
    ).toEqual(['Waiting for the answer']);
  });

  it('notes beside Start and in the Ask area (K41, 008)', async () => {
    const { api } = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true }, 'a1b2', {
      anthropic: null,
      openai: 'abcd',
    });
    const notes = fakeNotesApi({ m1: { name: 'agenda.md', source: 'file' } });
    render(
      <App
        api={api}
        meetings={fakeMeetingApi({ meeting: meeting(5), segments: [seg(1)] }).api}
        chat={fakeChatApi({ m1: [] }).api}
        notes={notes.api}
      />,
    );
    const add = await screen.findByRole('button', { name: 'Add notes for the next meeting' });
    expect(add.textContent).toBe('Add notes');
    const chip = await screen.findByRole('button', { name: 'Notes: agenda.md' });
    expect(chip.textContent).toBe('agenda.md');
    expect(screen.getByRole('button', { name: 'Remove notes' }).textContent).toBe('×');
    fireEvent.click(chip);
    expect(
      within(screen.getByRole('menu'))
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['Choose file…', 'Paste text', 'Remove notes']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Paste text' }));
    const dialog = screen.getByRole('dialog', { name: 'Notes' });
    expect(within(dialog).getByRole('textbox', { name: 'Notes' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Save notes' }).textContent).toBe('Save notes');
    expect(within(dialog).getByRole('button', { name: 'Cancel' }).textContent).toBe('Cancel');
  });

  it('the notes errors (K41, 008) read exactly', () => {
    expect(notesErrorText('empty', 'file', 'a.md')).toBe('a.md is empty.');
    expect(notesErrorText('too-long', 'file', 'a.md')).toBe(
      'a.md has more than 100,000 characters. Shorten it and add it again.',
    );
    expect(notesErrorText('too-long', 'paste', '')).toBe(
      'These notes have more than 100,000 characters. Shorten them and save again.',
    );
    expect(notesErrorText('not-text', 'file', 'a.md')).toBe(
      "a.md isn't UTF-8 text. Save it as UTF-8 and add it again.",
    );
    expect(notesErrorText('wrong-type', 'file', 'a.pdf')).toBe('Only .txt and .md files can be added.');
    expect(notesErrorText('unreadable', 'file', 'a.md')).toBe("Couldn't read a.md. Try again.");
    expect(notesErrorText('save-failed', 'file', 'a.md')).toBe("Couldn't save the notes. Try again.");
  });
});

// 012 T047 (FR-025): the Transcripts screen shows the eighteen strings of K43 (spec "Proposed copy" P1–P18) and no
// other text of its own.
describe('Keep strings: Transcripts screen (K43, 012)', () => {
  const DAY = 86_400_000;
  const MIN = 60_000;
  const P13 =
    'Delete the transcript of 7 Oct 2026, 14:30 permanently? Its questions, answers and notes are deleted too. It cannot be recovered.';
  const P17 = "Couldn't delete this transcript. Try again.";
  const P18 = "Couldn't read the stored transcripts. Close the panel and open it again.";

  /** One meeting per row state: running, stopped with six names, interrupted, silent, and three durations. */
  function history(): FakeStoredMeeting[] {
    const names = ['Jane', 'Mike', 'Tom', 'Bob', 'Sarah', 'Mary'];
    const ended = (id: string, daysAgo: number, minutes: number) =>
      storedMeeting({
        id,
        startedAt: STORED_START - daysAgo * DAY,
        endedAt: STORED_START - daysAgo * DAY + minutes * MIN,
      });
    return [
      { meeting: storedMeeting({ id: 'live', startedAt: STORED_START + DAY, endedAt: null, endReason: null }) },
      summarised(storedMeeting({ id: 'tue' }), [
        storedSegment('tue', 0, spokenBy('Jane')),
        storedSegment('tue', 1, spokenBySelf()),
        storedSegment('tue', 2),
      ]),
      summarised(
        ended('six', 1, 75),
        names.map((n, i) => storedSegment('six', i, spokenBy(n))),
      ),
      {
        meeting: storedMeeting({ id: 'cut', startedAt: STORED_START - 2 * DAY, endedAt: null, endReason: null }),
        segments: [storedSegment('cut', 0, { startMs: 12 * MIN - 1_500 })],
      },
      summarised(ended('silent', 3, 0.5)),
      summarised(ended('hours', 4, 120), [storedSegment('hours', 0)]),
    ];
  }

  function open(stored: FakeStoredMeeting[] = history(), runningId: string | null = 'live') {
    const fake = fakeTranscriptsApi(stored);
    render(
      <TranscriptsScreen
        api={fake.api}
        runningId={runningId}
        onBack={vi.fn()}
        onGoToRunning={vi.fn()}
        onDeleted={vi.fn()}
        headingRef={createRef()}
        save={vi.fn()}
      />,
    );
    return fake;
  }

  const rowText = (id: string) => document.querySelector(`[data-meeting-id="${id}"]`)!.textContent;
  const rowsReady = () => waitFor(() => expect(rowText('cut')).toContain('12 min'));

  it('the list: title, Back, date lines, durations, names, markers and the row actions (P1–P9, P11, P12)', async () => {
    open();
    await rowsReady();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Transcripts'); // P1
    expect(screen.getByRole('button', { name: 'Back' }).textContent).toBe('←'); // P2
    expect(screen.getByRole('list', { name: 'Transcripts' })).toBeTruthy();
    // P3–P8, one row per state; P11 and P12 as the visible button text.
    expect(rowText('live')).toBe('8 Oct 2026 · 14:30In progress');
    expect(rowText('tue')).toBe('7 Oct 2026 · 14:30 · 45 minJane, AlexDownload transcriptDelete transcript');
    expect(rowText('six')).toBe(
      '6 Oct 2026 · 14:30 · 1 h 15 minJane, Mike, Tom, Bob +2 moreDownload transcriptDelete transcript',
    );
    expect(rowText('cut')).toBe('5 Oct 2026 · 14:30 · 12 minInterruptedDownload transcriptDelete transcript');
    expect(rowText('silent')).toBe('4 Oct 2026 · 14:30 · under 1 minNothing was transcribed.Delete transcript');
    expect(rowText('hours')).toBe('3 Oct 2026 · 14:30 · 2 hDownload transcriptDelete transcript');
    // P9 and the accessible names of P11 and P12.
    const tue = within(document.querySelector<HTMLElement>('[data-meeting-id="tue"]')!);
    expect(tue.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Open transcript of 7 Oct 2026, 14:30',
      'Download transcript of 7 Oct 2026, 14:30',
      'Delete transcript of 7 Oct 2026, 14:30',
    ]);
    // Nothing else is on the screen: no count, no intro line, no loading line (K43 "Never add").
    const section = document.querySelector('section.transcripts-screen')!;
    const rows = [...section.querySelectorAll('[data-meeting-id]')].map((r) => r.textContent).join('');
    expect(section.textContent).toBe(`←Transcripts${rows}`);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('one meeting: its title, the actions and the transcript, nothing else (P2, P7, P10–P12)', async () => {
    open();
    await rowsReady();
    fireEvent.click(screen.getByRole('button', { name: 'Open transcript of 5 Oct 2026, 14:30' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('5 Oct 2026, 14:30')); // P10
    expect(document.querySelector('.past-actions')!.textContent).toBe(
      'InterruptedDownload transcriptDelete transcript',
    );
    const visible = [...document.querySelector('section.transcripts-screen')!.children].filter(
      (el) => !(el as HTMLElement).hidden,
    );
    expect(visible.map((el) => el.textContent).join('')).toBe(
      '←5 Oct 2026, 14:30InterruptedDownload transcriptDelete transcript11:58 Others (speaker not identified) Line 0.',
    );
  });

  // 012 T060 (decision 76): the title is the meeting's own; the screen adds no word of its own around it.
  it('a meeting with a title: the title line, the amended P9 and P10, and nothing else (P3a)', async () => {
    open(
      [
        summarised(storedMeeting({ id: 'named', source: titled('Weekly sync') }), [
          storedSegment('named', 0, spokenBy('Jane')),
        ]),
        summarised(storedMeeting({ id: 'code', startedAt: STORED_START - DAY }), [storedSegment('code', 0)]),
      ],
      null,
    );
    await waitFor(() => expect(rowText('named')).toContain('Jane'));
    expect(rowText('named')).toBe('Weekly sync7 Oct 2026 · 14:30 · 45 minJaneDownload transcriptDelete transcript');
    // No placeholder, no code and no site name where a meeting has no title.
    expect(rowText('code')).toBe('6 Oct 2026 · 14:30 · 45 minDownload transcriptDelete transcript');
    const named = within(document.querySelector<HTMLElement>('[data-meeting-id="named"]')!);
    expect(named.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Open transcript of Weekly sync, 7 Oct 2026, 14:30',
      'Download transcript of 7 Oct 2026, 14:30',
      'Delete transcript of 7 Oct 2026, 14:30',
    ]);
    fireEvent.click(named.getAllByRole('button')[0]!);
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Weekly sync7 Oct 2026, 14:30'),
    );
    const visible = [...document.querySelector('section.transcripts-screen')!.children].filter(
      (el) => !(el as HTMLElement).hidden,
    );
    expect(visible.map((el) => el.textContent).join('')).toBe(
      '←Weekly sync7 Oct 2026, 14:30Download transcriptDelete transcript00:00 Jane (confirmed) Line 0.',
    );
  });

  it('a meeting with no line reads the same sentence when opened (P8)', async () => {
    open();
    await rowsReady();
    fireEvent.click(screen.getByRole('button', { name: 'Open transcript of 4 Oct 2026, 14:30' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('4 Oct 2026, 14:30'));
    expect(document.querySelector('.past-transcript')!.textContent).toBe('Delete transcriptNothing was transcribed.');
  });

  it('the delete confirmation, its failure and the announcement (P13–P15, P17)', async () => {
    const fake = open();
    await rowsReady();
    fireEvent.click(screen.getByRole('button', { name: 'Delete transcript of 7 Oct 2026, 14:30' }));
    const confirm = screen.getByRole('group', { name: 'Confirm delete' });
    expect(confirm.textContent).toBe(`${P13}Delete permanently Cancel`);
    fake.failNextRemove();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete permanently' }));
    expect((await screen.findByRole('alert')).textContent).toBe(P17);
    expect(screen.getByRole('group', { name: 'Confirm delete' }).textContent).toBe(
      `${P13}${P17}Delete permanently Cancel`,
    );
    expect(screen.getByRole('status').textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Transcript deleted.')); // P15
    expect(screen.getByRole('status').classList.contains('sr-only')).toBe(true);
    // No visible "Deleted" (K43 "Never add"): the announcement is the only place the word appears.
    const visibleText = [...document.querySelectorAll('section.transcripts-screen *:not(.sr-only)')]
      .filter((el) => el.children.length === 0)
      .map((el) => el.textContent)
      .join(' ');
    expect(visibleText).not.toMatch(/deleted/i);
  });

  it('the empty state and the read failure (P16, P18)', async () => {
    open([], null);
    expect((await screen.findByText('No transcripts stored.')).tagName).toBe('P');
    expect(document.querySelector('section.transcripts-screen')!.textContent).toBe(
      '←TranscriptsNo transcripts stored.',
    );
    cleanup();
    const fake = fakeTranscriptsApi(history());
    fake.failNextList();
    render(
      <TranscriptsScreen
        api={fake.api}
        runningId={null}
        onBack={vi.fn()}
        onGoToRunning={vi.fn()}
        onDeleted={vi.fn()}
        headingRef={createRef()}
      />,
    );
    expect((await screen.findByRole('alert')).textContent).toBe(P18);
    expect(document.querySelector('section.transcripts-screen')!.textContent).toBe(`←Transcripts${P18}`);
  });

  it('the header control is named Transcripts, and the clean main view shows only K27 (P1, decision 64)', async () => {
    const meetings = fakeMeetingApi({ meeting: meeting(5), segments: [seg(1)] });
    const ready = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true, consentReminder: false }, 'a1b2').api;
    render(<App api={ready} meetings={meetings.api} transcripts={fakeTranscriptsApi().api} />);
    const control = await screen.findByRole('button', { name: 'Transcripts' });
    expect(control.getAttribute('title')).toBe('Transcripts');
    const transcript = () => screen.getByRole('region', { name: 'Transcript' });
    await waitFor(() => expect(transcript().textContent).toContain('line 1'));
    const before = document.querySelector('.main-view')!.textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Delete transcript' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await screen.findByText('No transcripts stored.');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(transcript().textContent).toBe('No transcript yet.')); // K27
    // The main view reads as before the meeting, minus its line and its three actions (014 added Close); no new
    // sentence is on it.
    const lineAndActions =
      '00:01 Others (speaker not identified) line 1Download transcriptClose transcriptDelete transcript';
    expect(before).toContain(lineAndActions);
    expect(document.querySelector('.main-view')!.textContent).toBe(
      before.replace(lineAndActions, 'No transcript yet.'),
    );
  });

  it('the screen\u2019s source holds no user-facing string outside K43', () => {
    const K43 = [
      'Transcripts',
      'Back',
      '←',
      ' · ',
      ', ',
      ' +',
      ' more',
      'In progress',
      'Interrupted',
      'Nothing was transcribed.',
      'Open transcript of ',
      'Download transcript of ',
      'Delete transcript of ',
      'Delete the transcript of ',
      ' permanently? Its questions, answers and notes are deleted too. It cannot be recovered.',
      // K44 C4 (013): the same question for a meeting with kept captions.
      " permanently? Its questions, answers, notes and Meet's captions are deleted too. It cannot be recovered.",
      'Transcript deleted.',
      'No transcripts stored.',
      "Couldn't read the stored transcripts. Close the panel and open it again.",
    ];
    // Not copy: module paths, class names, property names and other identifiers, selectors, key names and spacing.
    const technical = (text: string) =>
      /^(\.{1,2}\/|react$)/.test(text) ||
      /^[a-z0-9]+(-[a-z0-9]+)*( [a-z0-9]+(-[a-z0-9]+)*)*$/.test(text) ||
      /[[\]="]/.test(text) ||
      /^[a-z][A-Za-z0-9]*$/.test(text) ||
      text.trim() === '' ||
      ['Escape', '-marker', '-names'].includes(text);
    const sources = ['TranscriptsScreen.tsx', 'MeetingRow.tsx', 'PastTranscript.tsx'].map((f) =>
      join(ROOT, 'src/entrypoints/sidepanel/components', f),
    );
    const byFile = collectProjectStrings(ROOT);
    const found = sources.flatMap((f) => {
      const strings = byFile.get(f);
      expect(strings, f).toBeDefined();
      return strings!.filter((text) => !technical(text));
    });
    expect([...new Set(found)].filter((text) => !K43.includes(text))).toEqual([]);
    // The strings these files reuse from K6 and K40 are still produced by their own components.
    expect(found).not.toContain('Delete transcript');
    expect(found).not.toContain('Download transcript');
  });
});

// 013 T052 (FR-022, FR-023; copy-review K44, spec "Proposed copy" C1–C5): the two texts that name Meet's captions
// appear exactly where the captions are kept, the texts beside them are unchanged, and the feature adds no other string.
// T061 (decision 79, superseding decision 71): C2 is withdrawn; the reminder is K1, whatever the tab.
describe('Keep strings: captions download (K44, 013)', () => {
  const K1 =
    'Tell everyone in the meeting that it is being transcribed before you start. Their voices are sent to ElevenLabs and the transcript is kept on this computer. You can turn this reminder off in Settings.';
  const K6 = 'Delete this transcript permanently? It cannot be recovered.';
  const C3 =
    "Delete this transcript permanently? Meet's captions of this meeting are deleted too. It cannot be recovered.";
  const P13 =
    'Delete the transcript of 7 Oct 2026, 14:30 permanently? Its questions, answers and notes are deleted too. It cannot be recovered.';
  const C4 =
    "Delete the transcript of 7 Oct 2026, 14:30 permanently? Its questions, answers, notes and Meet's captions are deleted too. It cannot be recovered.";
  const ready = (consentReminder: boolean) =>
    fakeSettingsApi({ userName: 'Alex', firstRunComplete: true, consentReminder }, 'a1b2').api;
  const question = () => screen.getByRole('group', { name: 'Confirm delete' }).querySelector('p')?.textContent;
  const line = [storedSegment('m1', 0, { text: 'First line.' })];

  it('K1 on the reminder, at once, with nothing about captions; buttons and name unchanged', async () => {
    render(<App api={ready(true)} meetings={fakeMeetingApi().api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Consent reminder' });
    expect(dialog.querySelector('p')?.textContent).toBe(K1);
    expect(dialog.textContent).toBe(`${K1}I've told them — start Cancel`);
    expect(dialog.textContent).not.toMatch(/caption/i);
  });

  it('C3 on the main view for a meeting with kept captions, K6 without', async () => {
    for (const [stored, text] of [
      [meetingWithCaptions(), C3],
      [storedMeeting(), K6],
    ] as const) {
      render(<App api={ready(false)} meetings={fakeMeetingApi({ meeting: stored, segments: line }).api} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Delete transcript' }));
      expect(question()).toBe(text);
      expect(screen.getByRole('group', { name: 'Confirm delete' }).textContent).toBe(
        `${text}Delete permanently Cancel`,
      );
      cleanup();
    }
  });

  it('C4 on the Transcripts screen for a meeting with kept captions, P13 without, in a row and beside the transcript', async () => {
    for (const [stored, text] of [
      [meetingWithCaptions(), C4],
      [storedMeeting(), P13],
    ] as const) {
      const fake = fakeTranscriptsApi([summarised(stored, line)]);
      render(
        <TranscriptsScreen
          api={fake.api}
          runningId={null}
          onBack={vi.fn()}
          onGoToRunning={vi.fn()}
          onDeleted={vi.fn()}
          headingRef={createRef()}
        />,
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Delete transcript of 7 Oct 2026, 14:30' }));
      expect(question()).toBe(text);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(screen.getByRole('button', { name: 'Open transcript of 7 Oct 2026, 14:30' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Delete transcript' }));
      expect(question()).toBe(text);
      cleanup();
    }
  });

  it('C5: Download transcript reads the same in all three places for a meeting with kept captions, and nothing is said beside it', async () => {
    const stored = meetingWithCaptions();
    render(<App api={ready(false)} meetings={fakeMeetingApi({ meeting: stored, segments: line }).api} />);
    expect((await screen.findByRole('button', { name: 'Download transcript' })).textContent).toBe(
      'Download transcript',
    );
    // 014 put Close between the two on the main view (K46).
    expect(document.querySelector('.transcript-footer')!.textContent).toBe(
      'Download transcriptClose transcriptDelete transcript',
    );
    cleanup();

    const fake = fakeTranscriptsApi([summarised(stored, line)]);
    render(
      <TranscriptsScreen
        api={fake.api}
        runningId={null}
        onBack={vi.fn()}
        onGoToRunning={vi.fn()}
        onDeleted={vi.fn()}
        headingRef={createRef()}
      />,
    );
    const inRow = await screen.findByRole('button', { name: 'Download transcript of 7 Oct 2026, 14:30' });
    expect(inRow.textContent).toBe('Download transcript');
    expect(document.querySelector('.meeting-actions')!.textContent).toBe('Download transcriptDelete transcript');
    // The row is the row of any meeting: no badge, dot, count or word about captions (K44 "Never add").
    expect(document.querySelector('section.transcripts-screen')!.textContent).not.toMatch(/caption|zip/i);
    fireEvent.click(screen.getByRole('button', { name: 'Open transcript of 7 Oct 2026, 14:30' }));
    await waitFor(() => expect(document.querySelector('.past-actions')).not.toBeNull());
    expect(document.querySelector('.past-actions')!.textContent).toBe('Download transcriptDelete transcript');
    expect(document.querySelector('section.transcripts-screen')!.textContent).not.toMatch(/caption|zip/i);
  });

  it('C1: the three names a download can carry', () => {
    const start = new Date(2026, 9, 7, 14, 30).getTime();
    expect(downloadZipName(start)).toBe('Meeting — 07-10-2026 at 14h30.zip');
    expect(transcriptDownloadName(start)).toBe('Meeting — 07-10-2026 at 14h30 — Transcript.txt');
    expect(captionsFileName(start)).toBe('Meeting — 07-10-2026 at 14h30 — Meet captions.txt');
  });

  it('the sources 013 writes copy in hold no user-facing string outside K44 and the strings they already had', () => {
    const allowed: Record<string, string[]> = {
      'src/entrypoints/sidepanel/components/ConsentDialog.tsx': [
        // K1, whole: no sentence about captions divides it (decision 79).
        K1,
        "I've told them — start",
        'Cancel',
        'Consent reminder',
        'Escape',
      ],
      'src/entrypoints/sidepanel/components/DeleteTranscript.tsx': [
        'Delete this transcript permanently? It cannot be recovered.',
        "Delete this transcript permanently? Meet's captions of this meeting are deleted too. It cannot be recovered.",
        'Delete transcript',
        'Delete permanently',
        'Cancel',
        'Confirm delete',
        "Couldn't delete this transcript. Try again.",
        'Escape',
      ],
      'src/entrypoints/sidepanel/components/DownloadTranscript.tsx': ['Download transcript'],
      'src/core/export/download-names.ts': ['Meeting — ', ' at ', ' — Transcript.txt', ' — Meet captions.txt', '.zip'],
      'src/core/export/meeting-download.ts': [],
      'src/core/export/meeting-files.ts': [],
      'src/core/export/captions-file.ts': [],
      'src/entrypoints/sidepanel/save-file.ts': [],
    };
    // Not copy: module paths, class names, identifiers, attribute values, media types, format pieces and spacing.
    const technical = (text: string) =>
      /^(\.{1,2}\/|react$)/.test(text) ||
      /^[a-z0-9]+(-[a-z0-9]+)*( [a-z0-9]+(-[a-z0-9]+)*)*$/.test(text) ||
      /^[a-z][A-Za-z0-9]*$/.test(text) ||
      /^[a-z]+\/[a-z]+(;charset=utf-8)?$/.test(text) ||
      /^[\s[\]:.,\-0'h]*$/.test(text) ||
      /^caption:$/.test(text) ||
      text === '\n\n';
    const byFile = collectProjectStrings(ROOT);
    for (const [file, strings] of Object.entries(allowed)) {
      const found = byFile.get(join(ROOT, file));
      expect(found, file).toBeDefined();
      const copy = [...new Set(found!.filter((text) => !technical(text)))];
      expect(
        copy.filter((text) => !strings.includes(text)),
        file,
      ).toEqual([]);
    }
  });

  it('no string of the panel is one of the things K44 says never to add', () => {
    const never = [
      /captions? (are|were|is|being) kept\b/i,
      /captions of the meeting are kept/i,
      /\bcaptions kept\b/i,
      /\bkeep(ing)? (meet'?s? )?captions\b/i,
      /\bno captions\b/i,
      /\bdownloaded\b/i,
      /\bdownload (meet )?captions\b/i,
      /\bzip (file|archive|holds|contains)\b/i,
      /\bas a zip\b/i,
      /\bcaptions (file|turned off for|gap)\b/i,
    ];
    // The panel's own sources: every string a user of this feature can be shown is written there. (Two other places
    // use these words and show them to nobody new: the zip writer's errors for archives that cannot occur, which a
    // press swallows, and 002's status reason for captions that stopped arriving.)
    const panel = join(ROOT, 'src/entrypoints/sidepanel');
    const hits: string[] = [];
    let scanned = 0;
    for (const [file, strings] of collectProjectStrings(ROOT)) {
      if (!file.startsWith(panel)) continue;
      scanned += 1;
      for (const text of strings) for (const pattern of never) if (pattern.test(text)) hits.push(`${file}: ${text}`);
    }
    expect(scanned).toBeGreaterThan(30);
    expect(hits).toEqual([]);
  });
});
