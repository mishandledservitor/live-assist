// 016 T015 (spec FR-015–FR-017, decision 97; research R6; contracts/download-ui.md "Download originals"): the press
// logic both download buttons share, and the `Download originals` label. What the button saves is what its caller
// loads; which download that is (013's, for the originals) is decided by the Transcripts screen.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeetingDownload } from '@/core/export/meeting-download';
import { DownloadButton } from '@/entrypoints/sidepanel/components/DownloadButton';
import { DownloadOriginals } from '@/entrypoints/sidepanel/components/DownloadOriginals';
import { DownloadTranscript } from '@/entrypoints/sidepanel/components/DownloadTranscript';

afterEach(cleanup);

const ZIP: MeetingDownload = {
  name: 'Meeting — 07-10-2026 at 14h30.zip',
  type: 'application/zip',
  data: new Uint8Array([80, 75, 5, 6]),
};

describe('DownloadButton', () => {
  it('shows the label it is given, builds the download on press only, and saves it once', () => {
    const load = vi.fn(() => ZIP);
    const save = vi.fn();
    render(<DownloadButton label="Download originals" available load={load} save={save} />);
    expect(load).not.toHaveBeenCalled();
    const button = screen.getByRole('button', { name: 'Download originals' });
    expect(button.className).toBe('secondary');
    fireEvent.click(button);
    expect(load).toHaveBeenCalledTimes(1);
    expect(save.mock.calls).toEqual([[ZIP.name, ZIP.data, ZIP.type]]);
  });

  it('renders nothing when there is nothing to save', () => {
    const { container } = render(<DownloadButton label="Download originals" available={false} load={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('saves nothing and shows nothing when the load gives null or fails', async () => {
    const save = vi.fn();
    const load = vi
      .fn<() => Promise<MeetingDownload | null>>()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('x'));
    const { container } = render(<DownloadButton label="Download originals" available load={load} save={save} />);
    const before = container.innerHTML;
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe(before);
  });
});

describe('DownloadOriginals', () => {
  it('reads `Download originals` and has no other accessible name', () => {
    const save = vi.fn();
    render(<DownloadOriginals available load={() => ZIP} save={save} />);
    const button = screen.getByRole('button', { name: 'Download originals' });
    expect(button.textContent).toBe('Download originals');
    expect(button.getAttribute('aria-label')).toBeNull();
    fireEvent.click(button);
    expect(save.mock.calls).toEqual([[ZIP.name, ZIP.data, ZIP.type]]);
  });
});

describe('DownloadTranscript keeps its label and its row name', () => {
  it('reads `Download transcript`, with an accessible name when a row gives one', () => {
    render(<DownloadTranscript available load={() => ZIP} accessibleName="Download transcript of 7 Oct 2026, 14:30" />);
    const button = screen.getByRole('button', { name: 'Download transcript of 7 Oct 2026, 14:30' });
    expect(button.textContent).toBe('Download transcript');
  });
});
