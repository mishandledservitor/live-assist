# Manual check record: 020 Edit a line's text

Real-browser checks that automated tests cannot cover (constitution III). Not yet run: the steps below are for the owner, in the loaded extension. Automated coverage: the unit, integration and dom tests listed in `tasks.md` and `tests/e2e/edit-text.spec.ts` on the built extension with the fixture provider.

**Build** (from the repo root, on branch `020-edit-line-text` or later):

```sh
pnpm install
pnpm build
```

Reload the unpacked extension in `chrome://extensions` and open the side panel. Chrome should not ask to accept any new permission.

## Steps

1. In a real Meet call, Start. Wait for a line with a wrong word and a speaker name (not `…`). Double-click the wrong word: the line opens for editing with that word selected. Type the right word and press Enter: the line shows the corrected text and `edited`.
2. Keep talking while a line is open for editing for 30 seconds: new lines arrive below, the transcript does not scroll the editor away, and what you typed and the cursor stay. Escape: the line is as before.
3. Single-click and drag across a line's text: the text selects for copying, nothing opens. Double-click the line still being transcribed or one showing `…`: nothing opens.
4. With the keyboard only: Tab to a line's speaker name, Enter, `Edit text`: the text editor opens with all its text selected; Escape returns focus to the speaker name.
5. Ask a question whose answer is in the corrected line: the answer uses the corrected wording, and its citation opens that line.
6. Correct the speaker of the same line (`Just this line`): the corrected text stays. Then wait for later captions: the corrected line is not split.
7. Stop. Correct another line: it saves. `Download transcript`: the file has both corrections and no `edited`.
8. Open the line again and choose `Restore original`: the original text is back and `edited` is gone.
9. Close the panel and open it again: corrections are still there. `Close transcript`, open the meeting from Transcripts: corrected lines show their text with `edited`, and double-clicking does nothing.

## Results
