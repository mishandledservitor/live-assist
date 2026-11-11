// 020 T006 (US1; FR-007, FR-014, FR-015; contracts/edit-text-ui.md): the inline editor for a line's text.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextEditor, type TextEditorProps } from '@/entrypoints/sidepanel/components/TextEditor';

afterEach(cleanup);

function setup(over: Partial<TextEditorProps> = {}) {
  const props: TextEditorProps = {
    current: 'the cue three budget',
    selection: { start: 4, end: 7 },
    corrected: false,
    onSave: vi.fn(() => Promise.resolve()),
    onClose: vi.fn(),
    ...over,
  };
  render(<TextEditor {...props} />);
  return props;
}

const group = () => screen.getByRole('group', { name: 'Edit line text' });
const field = () => within(group()).getByRole<HTMLTextAreaElement>('textbox', { name: 'Line text' });
/** Lets the awaited save settle. */
const flush = () => act(() => Promise.resolve());
const button = (name: string) => within(group()).getByRole('button', { name });

describe('TextEditor', () => {
  it('holds the current text, focused, with the given range selected', () => {
    setup();
    expect(field().value).toBe('the cue three budget');
    expect(document.activeElement).toBe(field());
    expect([field().selectionStart, field().selectionEnd]).toEqual([4, 7]);
  });

  it('selects all the text when no range is given', () => {
    setup({ selection: null });
    expect([field().selectionStart, field().selectionEnd]).toEqual([0, 'the cue three budget'.length]);
  });

  it('Save stores the normalised text, then closes', async () => {
    const props = setup();
    fireEvent.change(field(), { target: { value: '  the Q3\nbudget ' } });
    fireEvent.click(button('Save'));
    await flush();
    expect(props.onSave).toHaveBeenCalledWith('the Q3 budget');
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('Enter saves without adding a line break', async () => {
    const props = setup();
    fireEvent.change(field(), { target: { value: 'the Q3 budget' } });
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    field().dispatchEvent(enter);
    await flush();
    expect(enter.defaultPrevented).toBe(true);
    expect(props.onSave).toHaveBeenCalledWith('the Q3 budget');
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('Cancel and Escape close without saving', () => {
    const props = setup();
    fireEvent.click(button('Cancel'));
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(2);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it.each([
    ['empty', '  \n ', "Enter the line's text."],
    ['too long', 'x'.repeat(2_001), 'Keep the line under 2,000 characters.'],
  ])('%s text shows an error linked to the field and saves nothing', async (_case, value, message) => {
    const props = setup();
    fireEvent.change(field(), { target: { value } });
    fireEvent.click(button('Save'));
    await flush();
    const alert = within(group()).getByRole('alert');
    expect(alert.textContent).toBe(message);
    expect(alert.className).toBe('field-error');
    expect(field().getAttribute('aria-describedby')).toBe(alert.id);
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('2,000 characters is still allowed', async () => {
    const props = setup();
    fireEvent.change(field(), { target: { value: 'x'.repeat(2_000) } });
    fireEvent.click(button('Save'));
    await flush();
    expect(props.onSave).toHaveBeenCalledWith('x'.repeat(2_000));
  });

  it('a refused save keeps the editor open with the typed text and says so', async () => {
    const props = setup({ onSave: vi.fn(() => Promise.reject(new Error('no'))) });
    fireEvent.change(field(), { target: { value: 'the Q3 budget' } });
    fireEvent.click(button('Save'));
    await flush();
    expect(within(group()).getByRole('alert').textContent).toBe("Couldn't save this line. Try again.");
    expect(field().value).toBe('the Q3 budget');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('typing clears the error', async () => {
    setup();
    fireEvent.change(field(), { target: { value: '' } });
    fireEvent.click(button('Save'));
    await flush();
    fireEvent.change(field(), { target: { value: 'a' } });
    expect(within(group()).queryByRole('alert')).toBeNull();
  });

  // T012 (US3)
  it('offers Restore original only on a corrected line; it saves null, then closes', async () => {
    setup();
    expect(within(group()).queryByRole('button', { name: 'Restore original' })).toBeNull();
    cleanup();
    const props = setup({ corrected: true });
    fireEvent.click(button('Restore original'));
    await flush();
    expect(props.onSave).toHaveBeenCalledWith(null);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('a refused restore keeps the editor open and says so', async () => {
    const props = setup({ corrected: true, onSave: vi.fn(() => Promise.reject(new Error('no'))) });
    fireEvent.click(button('Restore original'));
    await flush();
    expect(within(group()).getByRole('alert').textContent).toBe("Couldn't save this line. Try again.");
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
