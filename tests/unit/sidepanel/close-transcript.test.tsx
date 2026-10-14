// 014 T002 (FR-001, FR-002, FR-009; contracts/internal-api.md "CloseTranscript"): the button that clears the main view
// without deleting. No confirmation: nothing is lost. A failed close says so and the next press tries again.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloseTranscript } from '@/entrypoints/sidepanel/components/CloseTranscript';

afterEach(cleanup);

const button = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Close transcript' });

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('CloseTranscript', () => {
  it('is a secondary button labelled Close transcript', () => {
    render(<CloseTranscript close={() => Promise.resolve()} onClosed={() => undefined} />);
    expect(button().className).toContain('secondary');
    expect(button().type).toBe('button');
  });

  it('closes at once, without a confirmation, and calls onClosed once it is remembered', async () => {
    const d = deferred();
    const close = vi.fn(() => d.promise);
    const onClosed = vi.fn();
    render(<CloseTranscript close={close} onClosed={onClosed} />);
    fireEvent.click(button());
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group')).toBeNull();
    expect(button().disabled).toBe(true);
    expect(onClosed).not.toHaveBeenCalled();
    await act(async () => {
      d.resolve();
      await d.promise;
    });
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('says so when the close cannot be remembered, keeps the button, and the next press tries again', async () => {
    const close = vi.fn((): Promise<void> => Promise.reject(new Error('quota')));
    const onClosed = vi.fn();
    render(<CloseTranscript close={close} onClosed={onClosed} />);
    fireEvent.click(button());
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toBe("Couldn't close this transcript. Try again.");
    expect(button().disabled).toBe(false);
    expect(onClosed).not.toHaveBeenCalled();

    const d = deferred();
    close.mockImplementationOnce(() => d.promise);
    fireEvent.click(button());
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => {
      d.resolve();
      await d.promise;
    });
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});
