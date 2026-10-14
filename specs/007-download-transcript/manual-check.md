# Manual check record: 007 Download transcript

Real-browser checks that automated tests cannot cover (constitution III). Not yet run: the steps below are for the user, in a real Google Meet call. Automated coverage already in place: `tests/unit/core/export/transcript-file.test.ts` (name and format), `tests/unit/sidepanel/download-transcript.test.tsx` (placement and states), `tests/e2e/download.spec.ts` (a real Chrome download from a stored and a running meeting), `tests/unit/manifest/permissions.test.ts` (no new permission).

**Build** (from the repo root, on branch `007-download-transcript` or later):

```sh
pnpm install
pnpm build
```

Reload the unpacked extension in `chrome://extensions`, reload the Meet tab, click the toolbar icon. Chrome should not ask to accept any new permission.

## Steps

1. Before Start (or after deleting every transcript): no `Download transcript` button under `No transcript yet.`
2. Press Start and talk until the first lines carry names. Expect: `Download transcript` after the last line, no `Delete transcript`. Press it. Expect: a file `Meeting — DD-MM-YYYY at HHhMM.txt` (today, the minute you pressed Start) in Downloads, with the named lines so far; no grey in-progress text and no `…` line.
3. Rename a speaker, then download again. Expect: Chrome saves `Meeting — … (1).txt` with the new name; the first file is unchanged.
4. Ask a question in the Ask box, then Stop. Expect: `Download transcript` then `Delete transcript` after the last line. Download. Expect: every line of the meeting, no question or answer text, one blank line between lines, nothing above the first line, your own lines under your name, unidentified lines as `Others`.
5. Open the file in a text editor. Expect: Greek text reads correctly; every line looks like `[mm:ss] Name: text`.
6. Drop the file into `knowledge-base/05-inbox/` beside an existing inbox file. Expect: same shape; the knowledge-base workflow takes it without edits (SC-005).

## Results

Real Meet call 2026-10-10.

| Step | Result (pass / fail / note) |
|------|-----------------------------|
| 1 | |
| 2 | Pass for format and naming, 2026-10-10: `Meeting — 10-10-2026 at 08h00.txt`. Speaker names were missing because of the captions regression reverted on 2026-10-10 (002, decision 58), not 007. |
| 3 | Pass for naming, 2026-10-10: `(1)` and `(2)` copies saved in the same format. |
| 4 | |
| 5 | |
| 6 | |
