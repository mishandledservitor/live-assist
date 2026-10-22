// 018 T003 (FR-002, design decision 106, contracts/settings-ui.md "Key block"): one key as one line, the masked key with
// Replace and Remove; Replace opens the field with Check and save and Cancel; Escape cancels; with no key saved the
// field shows at once.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyBlock, type KeyCheck } from '@/entrypoints/sidepanel/components/KeyBlock';

afterEach(cleanup);

const KEY = 'test-key-block-fixture-e5f6';

function show(hint: string | null, over: { check?: KeyCheck; removeConfirm?: string } = {}) {
  const check = vi.fn<KeyCheck>(
    over.check ?? ((candidate) => Promise.resolve({ ok: true, hint: candidate.slice(-4) })),
  );
  const remove = vi.fn(() => Promise.resolve());
  const onHint = vi.fn();
  render(
    <KeyBlock
      heading="ElevenLabs key"
      hint={hint}
      check={check}
      emptyText="Enter your ElevenLabs key."
      savedText="Key replaced."
      remove={remove}
      onHint={onHint}
      {...(over.removeConfirm === undefined ? {} : { removeConfirm: over.removeConfirm })}
    />,
  );
  const block = () => within(screen.getByRole('region', { name: 'ElevenLabs key' }));
  return { check, remove, onHint, block };
}

describe('KeyBlock: a saved key', () => {
  it('is one line: the masked key, Replace and Remove, and no field', () => {
    const { block } = show('a1b2');
    expect(block().getByRole('heading', { level: 4, name: 'ElevenLabs key' })).toBeTruthy();
    // 018 decision 108: the masked key alone, in a line named by the block's heading.
    const line = block().getByRole('group', { name: 'ElevenLabs key' });
    expect(within(line).getByText('••••a1b2')).toBeTruthy();
    expect(line.textContent).toBe('••••a1b2 Replace Remove');
    expect(document.body.textContent).not.toContain('Saved key');
    expect(within(line).getByRole('button', { name: 'Replace' })).toBeTruthy();
    expect(within(line).getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(block().queryByLabelText('ElevenLabs key', { selector: 'input' })).toBeNull();
    expect(block().queryByRole('button', { name: 'Check and save' })).toBeNull();
  });

  it('Replace swaps the line for the field, named by the heading and focused, with Check and save and Cancel', () => {
    const { block } = show('a1b2');
    fireEvent.click(block().getByRole('button', { name: 'Replace' }));
    const field = block().getByLabelText<HTMLInputElement>('ElevenLabs key');
    expect(field.type).toBe('password');
    expect(document.activeElement).toBe(field);
    expect(block().getByRole('button', { name: 'Check and save' })).toBeTruthy();
    expect(block().getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(block().queryByRole('button', { name: 'Replace' })).toBeNull();
  });

  it.each(['Cancel', 'Escape'])('%s puts the line back unchanged, with focus on Replace', (how) => {
    const { block, check } = show('a1b2');
    fireEvent.click(block().getByRole('button', { name: 'Replace' }));
    const field = block().getByLabelText('ElevenLabs key');
    fireEvent.change(field, { target: { value: KEY } });
    if (how === 'Cancel') fireEvent.click(block().getByRole('button', { name: 'Cancel' }));
    else expect(fireEvent.keyDown(field, { key: 'Escape' })).toBe(false); // prevented: Settings does not also go Back
    expect(block().queryByLabelText('ElevenLabs key', { selector: 'input' })).toBeNull();
    expect(block().getByText('••••a1b2')).toBeTruthy();
    expect(document.activeElement).toBe(block().getByRole('button', { name: 'Replace' }));
    expect(check).not.toHaveBeenCalled();
    fireEvent.click(block().getByRole('button', { name: 'Replace' }));
    expect(block().getByLabelText<HTMLInputElement>('ElevenLabs key').value).toBe('');
  });

  it('a key that passes the check is saved and the line returns with the new masked key', async () => {
    const { block, check, onHint } = show('a1b2');
    fireEvent.click(block().getByRole('button', { name: 'Replace' }));
    fireEvent.change(block().getByLabelText('ElevenLabs key'), { target: { value: KEY } });
    fireEvent.click(block().getByRole('button', { name: 'Check and save' }));
    expect(await block().findByText('Key replaced.')).toBeTruthy();
    expect(check).toHaveBeenCalledWith(KEY);
    expect(onHint).toHaveBeenCalledWith('e5f6');
    expect(block().queryByLabelText('ElevenLabs key', { selector: 'input' })).toBeNull();
    expect(document.body.textContent).not.toContain(KEY);
  });

  it('a key that fails the check keeps the field open with the error, and the old key', async () => {
    const { block, onHint } = show('a1b2', { check: () => Promise.resolve({ ok: false, text: 'Rejected.' }) });
    fireEvent.click(block().getByRole('button', { name: 'Replace' }));
    fireEvent.change(block().getByLabelText('ElevenLabs key'), { target: { value: KEY } });
    fireEvent.click(block().getByRole('button', { name: 'Check and save' }));
    expect((await block().findByRole('alert')).textContent).toBe('Rejected.');
    expect(block().getByLabelText('ElevenLabs key')).toBeTruthy();
    expect(onHint).not.toHaveBeenCalled();
  });

  it('an empty field asks for the key and checks nothing', async () => {
    const { block, check } = show('a1b2');
    fireEvent.click(block().getByRole('button', { name: 'Replace' }));
    fireEvent.click(block().getByRole('button', { name: 'Check and save' }));
    expect((await block().findByRole('alert')).textContent).toBe('Enter your ElevenLabs key.');
    expect(check).not.toHaveBeenCalled();
  });

  it('Remove with a confirmation asks first, then removes', async () => {
    const confirm = 'Remove the saved key? Transcription cannot start without one.';
    const { block, remove, onHint } = show('a1b2', { removeConfirm: confirm });
    fireEvent.click(block().getByRole('button', { name: 'Remove' }));
    expect(block().getByText(confirm, { exact: false })).toBeTruthy();
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(block().getByRole('button', { name: 'Cancel' }));
    expect(block().getByText('••••a1b2')).toBeTruthy();
    fireEvent.click(block().getByRole('button', { name: 'Remove' }));
    fireEvent.click(block().getByRole('button', { name: 'Yes, remove' }));
    await waitFor(() => expect(remove).toHaveBeenCalled());
    expect(onHint).toHaveBeenCalledWith(null);
  });

  it('Remove without a confirmation removes at once', async () => {
    const { block, remove, onHint } = show('a1b2');
    fireEvent.click(block().getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(remove).toHaveBeenCalled());
    expect(onHint).toHaveBeenCalledWith(null);
    expect(await block().findByText('Key removed.')).toBeTruthy();
  });
});

describe('KeyBlock: no key saved', () => {
  it('shows No key saved. with the field and Check and save at once, and no Cancel or Remove', () => {
    const { block } = show(null);
    expect(block().getByText('No key saved.')).toBeTruthy();
    expect(block().getByLabelText('ElevenLabs key')).toBeTruthy();
    expect(block().getByRole('button', { name: 'Check and save' })).toBeTruthy();
    expect(block().queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(block().queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(block().queryByRole('button', { name: 'Replace' })).toBeNull();
  });
});
