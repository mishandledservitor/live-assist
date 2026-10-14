// 006 T006 (US1, FR-002, FR-005): the slim header — Start/Stop, language, credits badge, gear — with notices below it.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Meeting } from '@/core/transcript/model';
import { StartControls, type StartControlsProps } from '@/entrypoints/sidepanel/components/StartControls';

afterEach(cleanup);

const running: Meeting = {
  id: 'm1',
  startedAt: 1,
  endedAt: null,
  endReason: null,
  source: { url: 'https://meet.google.com/x', title: 'Standup', platform: 'meet' },
  languageMode: { kind: 'fixed', code: 'ell' },
  userName: 'Alex',
  speakerRenames: {},
  schemaVersion: 1,
};

function setup(props: Partial<StartControlsProps> = {}) {
  const onOpenSettings = vi.fn();
  const all: StartControlsProps = {
    api: {
      start: vi.fn(() => Promise.resolve({ ok: true as const, meetingId: 'm9' })),
      stop: vi.fn(() => Promise.resolve({ ok: true as const })),
    },
    ready: true,
    notReadyReason: null,
    running: false,
    meeting: null,
    onChanged: vi.fn(),
    consentReminder: false,
    badge: <button type="button">84%</button>,
    onOpenSettings,
    ...props,
  };
  render(<StartControls {...all} />);
  return { onOpenSettings };
}

const header = () => document.querySelector('header')!;

describe('PanelHeader', () => {
  it('holds Start, Language, the badge and the gear, in that order', () => {
    setup();
    const controls = [...header().querySelectorAll('button, select')];
    expect(controls.map((c) => c.getAttribute('aria-label') ?? c.textContent)).toEqual([
      'Start',
      expect.stringContaining('Auto'),
      '84%',
      'Settings',
    ]);
    expect(within(header()).getByRole('combobox', { name: 'Language' })).toBeTruthy();
  });

  it('shows Stop while running, with the language disabled on the meeting language', () => {
    setup({ running: true, meeting: running });
    expect(within(header()).getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(within(header()).queryByRole('button', { name: 'Start' })).toBeNull();
    const language = within(header()).getByRole<HTMLSelectElement>('combobox', { name: 'Language' });
    expect(language.disabled).toBe(true);
    expect(language.value).toBe('ell');
  });

  it('the gear opens Settings', () => {
    const { onOpenSettings } = setup();
    fireEvent.click(within(header()).getByRole('button', { name: 'Settings' }));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  // 012 T020 (FR-001): the Transcripts control, before the gear.
  it('holds the Transcripts control before the gear when it can open the screen', () => {
    const onOpenTranscripts = vi.fn();
    setup({ onOpenTranscripts });
    const control = within(header()).getByRole('button', { name: 'Transcripts' });
    expect(control.getAttribute('title')).toBe('Transcripts');
    expect(control.className).toBe('icon-button transcripts');
    const controls = [...header().querySelectorAll('button, select')];
    expect(controls.map((c) => c.getAttribute('aria-label') ?? c.textContent).slice(-3)).toEqual([
      '84%',
      'Transcripts',
      'Settings',
    ]);
    fireEvent.click(control);
    expect(onOpenTranscripts).toHaveBeenCalledTimes(1);
  });

  it('has no Transcripts control otherwise', () => {
    setup();
    expect(within(header()).queryByRole('button', { name: 'Transcripts' })).toBeNull();
  });

  it('disables Start and shows the not-ready instruction below the header, not in it', () => {
    setup({ ready: false, notReadyReason: 'Add your name in Settings to start.' });
    expect(within(header()).getByRole<HTMLButtonElement>('button', { name: 'Start' }).disabled).toBe(true);
    const line = screen.getByText('Add your name in Settings to start.');
    expect(header().contains(line)).toBe(false);
    expect(header().compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
