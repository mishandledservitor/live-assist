import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '@/core/settings/schema';
import { Settings as SettingsPanel } from '@/entrypoints/sidepanel/components/Settings';
import { fakeSettingsApi } from './fake-settings-api';

afterEach(cleanup);

const KEY = 'sk_test_fixture_settings_c3d4';

function renderSettings(initial: Partial<Settings> = {}, keyHint: string | null = 'a1b2') {
  const f = fakeSettingsApi({ userName: 'Alex', firstRunComplete: true, ...initial }, keyHint);
  const onChange = vi.fn();
  const view = render(
    <SettingsPanel
      api={f.api}
      loaded={{ settings: f.state.settings, keyHint: f.state.keyHint, chatKeyHints: f.state.chatKeyHints }}
      onChange={onChange}
    />,
  );
  return { ...f, onChange, view };
}

const lastSaved = (api: ReturnType<typeof fakeSettingsApi>['api']) => api.saveSettings.mock.calls.at(-1)?.[0];

describe('Settings: name', () => {
  it('edits and saves the name', async () => {
    const { api, onChange } = renderSettings();
    const input = screen.getByLabelText<HTMLInputElement>(/your name/i);
    expect(input.value).toBe('Alex');
    fireEvent.change(input, { target: { value: ' Alex S. ' } });
    fireEvent.click(screen.getByRole('button', { name: /save name/i }));
    expect(await screen.findByText(/name saved/i)).toBeTruthy();
    expect(lastSaved(api)).toEqual({ userName: 'Alex S.' });
    expect(onChange).toHaveBeenCalled();
  });

  it('refuses an empty name', async () => {
    const { api } = renderSettings();
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('button', { name: /save name/i }));
    expect((await screen.findByRole('alert')).textContent).toBe('Enter your name.'); // 006 R18
    expect(api.saveSettings).not.toHaveBeenCalled();
  });
});

describe('Settings: key', () => {
  // 003 adds a Claude and an OpenAI key section with the same controls.
  const eleven = () => within(screen.getByRole('region', { name: 'ElevenLabs API key' }));

  it('shows the saved key only masked', () => {
    renderSettings();
    expect(screen.getByText('••••a1b2')).toBeTruthy();
  });

  it('labels the field New key and has no heading repeating the name label (006 R21, D11)', () => {
    renderSettings();
    expect(eleven().getByLabelText('New key')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Your name' })).toBeNull();
    expect(screen.getByLabelText('Your name')).toBeTruthy();
  });

  it('replaces the key after a successful check', async () => {
    const { api, onChange } = renderSettings();
    fireEvent.change(eleven().getByLabelText('New key'), { target: { value: KEY } });
    fireEvent.click(eleven().getByRole('button', { name: /check and replace key/i }));
    expect(await screen.findByText(/key replaced/i)).toBeTruthy();
    expect(api.validateKey).toHaveBeenCalledWith(KEY);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ keyHint: 'a1b2' }));
    expect(document.body.textContent).not.toContain(KEY);
  });

  it('keeps the old key and explains when the new one fails', async () => {
    const f = renderSettings();
    f.failNextValidation('invalid');
    fireEvent.change(eleven().getByLabelText('New key'), { target: { value: KEY } });
    fireEvent.click(eleven().getByRole('button', { name: /check and replace key/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/rejected this key/i);
    expect(screen.getByText('••••a1b2')).toBeTruthy();
  });

  it('removes the key after confirmation', async () => {
    const { api, onChange } = renderSettings();
    fireEvent.click(eleven().getByRole('button', { name: /remove key/i }));
    expect(api.removeKey).not.toHaveBeenCalled();
    fireEvent.click(eleven().getByRole('button', { name: /yes, remove/i }));
    expect(await eleven().findByText('No key saved.')).toBeTruthy(); // 006 R20
    expect(api.removeKey).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ keyHint: null }));
  });
});

describe('Settings: key terms', () => {
  const list = () => within(screen.getByRole('list', { name: /^key terms$/i }));

  // 001 FR-004a (T120): the field takes a list; copy-review K17a.
  const NEW_TERMS = 'New key terms, separated by commas or one per line';
  const newTerms = () => screen.getByLabelText<HTMLInputElement>(NEW_TERMS);
  const add = () => fireEvent.click(screen.getByRole('button', { name: 'Add terms' }));
  const paste = (text: string) =>
    fireEvent.paste(newTerms(), { clipboardData: { getData: (type: string) => (type === 'text' ? text : '') } });
  const names = (n: number) => Array.from({ length: n }, (_, i) => `Name ${i + 1}`);

  it('adds a term', async () => {
    const { api } = renderSettings({ keyterms: ['Northwind'] });
    fireEvent.change(newTerms(), { target: { value: ' Bluebird ' } });
    add();
    await list().findByDisplayValue('Bluebird');
    expect(lastSaved(api)).toEqual({ keyterms: ['Northwind', 'Bluebird'] });
    expect(newTerms().value).toBe('');
  });

  it('adds every term of a comma-separated list, after the existing ones, with one save', async () => {
    const { api } = renderSettings({ keyterms: ['Northwind'] });
    fireEvent.change(newTerms(), { target: { value: 'Emma Jones, Jane D. ,, northwind, Scribe' } });
    add();
    await list().findByDisplayValue('Scribe');
    expect(api.saveSettings).toHaveBeenCalledTimes(1);
    expect(lastSaved(api)).toEqual({ keyterms: ['Northwind', 'Emma Jones', 'Jane D.', 'Scribe'] });
  });

  it('takes a pasted column of 50 names and adds them all with one save', async () => {
    const { api } = renderSettings();
    const fifty = names(50);
    expect(paste(fifty.join('\r\n') + '\r\n')).toBe(false); // the browser's own paste would drop the line breaks
    expect(newTerms().value).toBe(fifty.join(', '));
    add();
    await list().findByDisplayValue('Name 50');
    expect(api.saveSettings).toHaveBeenCalledTimes(1);
    expect(lastSaved(api)).toEqual({ keyterms: fifty });
    expect(list().getAllByRole('listitem')).toHaveLength(50);
    expect(screen.queryByRole('list', { name: 'Key terms not used' })).toBeNull();
  });

  it('puts pasted lines where the cursor is, after what is already typed', () => {
    renderSettings();
    fireEvent.change(newTerms(), { target: { value: 'Scribe' } });
    newTerms().setSelectionRange(6, 6);
    paste('Emma\nJane');
    expect(newTerms().value).toBe('Scribe, Emma, Jane');
  });

  it('leaves a paste without line breaks to the browser', () => {
    renderSettings();
    expect(paste('Emma, Jane')).toBe(true);
    expect(newTerms().value).toBe('');
  });

  it('keeps and flags terms over the limits that arrive in one list', async () => {
    const { api } = renderSettings({ keyterms: ['Northwind'] });
    paste(['ThisTermIsWayTooLong123', ...names(50)].join('\n'));
    add();
    expect(await screen.findByText(/ThisTermIsWayTooLong123.*longer than 20 characters/i)).toBeTruthy();
    expect(screen.getByText(/Name 50.*over the 50-term limit/i)).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Key terms not used' })).getAllByRole('listitem')).toHaveLength(2);
    expect(list().getAllByRole('listitem')).toHaveLength(52);
    expect(api.saveSettings).toHaveBeenCalledTimes(1);
  });

  it('saves nothing when the list has nothing new, and empties the field', async () => {
    const { api } = renderSettings({ keyterms: ['Northwind'] });
    fireEvent.change(newTerms(), { target: { value: ' northwind, ,NORTHWIND ' } });
    add();
    await vi.waitFor(() => expect(newTerms().value).toBe(''));
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it('edits and removes single terms in a list of 50', async () => {
    const { api } = renderSettings({ keyterms: names(50) });
    const field = list().getByDisplayValue('Name 50');
    fireEvent.change(field, { target: { value: 'Name fifty' } });
    fireEvent.blur(field);
    await vi.waitFor(() => expect(lastSaved(api)).toEqual({ keyterms: [...names(49), 'Name fifty'] }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Name 1' }));
    await vi.waitFor(() => expect(lastSaved(api)).toEqual({ keyterms: [...names(49).slice(1), 'Name fifty'] }));
    expect(api.saveSettings).toHaveBeenCalledTimes(2);
  });

  it('edits a term when the field loses focus', async () => {
    const { api } = renderSettings({ keyterms: ['Northwind', 'Scribe'] });
    const field = list().getByDisplayValue('Scribe');
    fireEvent.change(field, { target: { value: 'Scribe v2' } });
    fireEvent.blur(field);
    await vi.waitFor(() => expect(lastSaved(api)).toEqual({ keyterms: ['Northwind', 'Scribe v2'] }));
  });

  it('removes a term', async () => {
    const { api } = renderSettings({ keyterms: ['Northwind', 'Scribe'] });
    fireEvent.click(screen.getByRole('button', { name: /remove scribe/i }));
    await vi.waitFor(() => expect(lastSaved(api)).toEqual({ keyterms: ['Northwind'] }));
    expect(list().queryByDisplayValue('Scribe')).toBeNull();
  });

  it('flags terms that will not be sent, without dropping them', () => {
    const many = Array.from({ length: 51 }, (_, i) => `term${i}`);
    renderSettings({ keyterms: ['ThisTermIsWayTooLong123', ...many] });
    expect(screen.getByText(/ThisTermIsWayTooLong123.*longer than 20 characters/i)).toBeTruthy();
    expect(screen.getByText(/term50.*over the 50-term limit/i)).toBeTruthy();
    expect(list().getByDisplayValue('ThisTermIsWayTooLong123')).toBeTruthy();
  });
});

describe('Settings: consent reminder and microphone', () => {
  it('is on by default and can be turned off and on', async () => {
    const { api } = renderSettings();
    // 006 R22: the heading above says Consent reminder; the label is the action.
    const box = screen.getByRole<HTMLInputElement>('checkbox', {
      name: 'Remind me to tell participants they are being transcribed each time I press Start',
    });
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await vi.waitFor(() => expect(lastSaved(api)).toEqual({ consentReminder: false }));
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    await vi.waitFor(() => expect(lastSaved(api)).toEqual({ consentReminder: true }));
  });

  // Design decision 41 (001 FR-011b): clean transcript, on by default, one switch.
  it('clean transcript is on by default and can be turned off and on', async () => {
    const { api } = renderSettings();
    expect(screen.getByRole('heading', { name: 'Clean transcript' })).toBeTruthy();
    const box = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Leave out fillers and false starts' });
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await vi.waitFor(() => expect(lastSaved(api)).toEqual({ cleanTranscript: false }));
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    await vi.waitFor(() => expect(lastSaved(api)).toEqual({ cleanTranscript: true }));
  });

  // 002 FR-028 (design decision 61, copy-review K42): one switch, off by default, a label and nothing else.
  it('show Meet captions is off by default and can be turned on and off', async () => {
    const { api } = renderSettings();
    const box = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Show Meet captions' });
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    await vi.waitFor(() => expect(lastSaved(api)).toEqual({ showMeetCaptions: true }));
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await vi.waitFor(() => expect(lastSaved(api)).toEqual({ showMeetCaptions: false }));
    expect(box.checked).toBe(false);
  });

  it('show Meet captions shows the stored choice, with no heading and no helper text of its own', () => {
    renderSettings({ showMeetCaptions: true });
    const box = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Show Meet captions' });
    expect(box.checked).toBe(true);
    const label = box.closest('label')!;
    expect(label.textContent.trim()).toBe('Show Meet captions');
    expect(screen.queryByRole('heading', { name: /captions/i })).toBeNull();
    expect(label.previousElementSibling?.tagName).not.toBe('H3');
    expect(label.nextElementSibling?.tagName).not.toBe('P');
  });

  it('reopens the microphone permission page, with no sentence narrating it (006 D10)', () => {
    const { api } = renderSettings();
    expect(screen.queryByText(/allow it again here/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /allow microphone/i }));
    expect(api.openMicPermission).toHaveBeenCalled();
  });
});

// T063: Settings → Remembered names (002 FR-022, decision 20): caption name → display name, edit, remove.
describe('Settings: remembered names', () => {
  const mappings = [
    { captionName: 'Emma Jones', displayName: 'Emma', updatedAt: 1 },
    { captionName: 'Jane D.', displayName: 'Jane', updatedAt: 2 },
  ];
  const list = () => screen.getByRole('list', { name: 'Remembered names' });

  it('says so when there are none', async () => {
    renderSettings();
    expect(await screen.findByText(/no remembered names yet/i)).toBeTruthy();
  });

  it('lists caption name → display name', async () => {
    renderSettings({ speakerNameMappings: mappings });
    await screen.findByRole('list', { name: 'Remembered names' });
    const rows = within(list()).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Emma Jones') as unknown,
      expect.stringContaining('Jane D.') as unknown,
    ]);
    expect(within(list()).getByLabelText<HTMLInputElement>('Name shown for Emma Jones').value).toBe('Emma');
  });

  it('edits a display name', async () => {
    const { api, state } = renderSettings({ speakerNameMappings: mappings });
    const input = await screen.findByLabelText<HTMLInputElement>('Name shown for Jane D.');
    fireEvent.change(input, { target: { value: ' Jane Doe ' } });
    fireEvent.click(within(list()).getByRole('button', { name: 'Save name for Jane D.' }));
    await vi.waitFor(() => expect(api.rememberSpeakerName).toHaveBeenCalledWith('Jane D.', 'Jane Doe'));
    expect(state.settings.speakerNameMappings.find((m) => m.captionName === 'Jane D.')?.displayName).toBe('Jane Doe');
  });

  it('refuses an empty or over-long display name', async () => {
    const { api } = renderSettings({ speakerNameMappings: mappings });
    const input = await screen.findByLabelText('Name shown for Emma Jones');
    for (const value of ['  ', 'x'.repeat(61)]) {
      fireEvent.change(input, { target: { value } });
      fireEvent.click(within(list()).getByRole('button', { name: 'Save name for Emma Jones' }));
      expect(within(list()).getByRole('alert').textContent).toMatch(/1–60 characters/);
    }
    expect(api.rememberSpeakerName).not.toHaveBeenCalled();
  });

  // T082: a rename made in the transcript (MeetingApi → SettingsApi.rememberSpeakerName) shows without a remount.
  it('shows a name remembered elsewhere, and drops one forgotten elsewhere, without remounting', async () => {
    const { api } = renderSettings();
    expect(await screen.findByText(/no remembered names yet/i)).toBeTruthy();
    await api.rememberSpeakerName('Emma Jones', 'Emma');
    const input = await screen.findByLabelText<HTMLInputElement>('Name shown for Emma Jones');
    expect(input.value).toBe('Emma');
    await api.rememberSpeakerName('Emma Jones', 'Ave');
    await vi.waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('Name shown for Emma Jones').value).toBe('Ave'),
    );
    await api.forgetSpeakerName('Emma Jones');
    expect(await screen.findByText(/no remembered names yet/i)).toBeTruthy();
  });

  it('removes one', async () => {
    const { api } = renderSettings({ speakerNameMappings: mappings });
    fireEvent.click(await screen.findByRole('button', { name: 'Forget Emma Jones' }));
    await vi.waitFor(() => expect(api.forgetSpeakerName).toHaveBeenCalledWith('Emma Jones'));
    await vi.waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(1));
  });
});
