# Manual check record: 016 Merged download

Real-browser checks that automated tests cannot cover (constitution III, spec SC-008). Not yet run: the steps are for the owner, in a real Google Meet call with at least two other people. Automated coverage in place: `tests/unit/core/export/merged-transcript.test.ts`, `merged-repeats.test.ts`, `matching-blocks.test.ts`, `meeting-download.test.ts`; `tests/unit/sidepanel/download-originals.test.tsx`, `past-transcript.test.tsx`, `transcripts-screen.test.tsx`, `app-captions.test.tsx`; `tests/unit/copy/keep-strings.test.tsx` (K47); `tests/e2e/captions-download.spec.ts`.

**Build** (from the repo root, on branch `016-merged-download` or later): `pnpm install && pnpm build`. Reload the unpacked extension in `chrome://extensions`, reload the Meet tab, click the toolbar icon. Chrome should not ask for any new permission.

## Steps

1. **The merged file.** In a call of at least 20 minutes with at least three people, Start, let the meeting run, Stop with the panel open. Press `Download transcript`. Expect: one `.txt`, `Meeting — DD-MM-YYYY at HHhMM — Transcript.txt`, no zip. Compare it with the panel: lines the panel showed as "Others" now carry names where someone was captioned; read ten of them against your memory of the call and note how many are right. Note any line under the wrong name.
2. **The same file from the Transcripts screen.** Open Transcripts, download the meeting from its row and from its own view. Expect: the same file (Chrome numbers the names).
3. **Originals.** In the meeting's own view: `Download transcript`, `Download originals`, `Delete transcript`, in that order. Press `Download originals`. Expect: the zip with `… — Transcript.txt` (the panel's labels) and `… — Meet captions.txt`, as before 016. The main view and the row have no `Download originals`.
4. **Repeated passages.** If the panel showed a passage twice during the call (often after a reconnect, the second time under another name), find it in the merged file: expect it once, at its first time. If someone in the call deliberately says the same sentence twice, expect both in the merged file. Note what you saw.
5. **A running meeting.** During a call, press `Download transcript` on the main view. Expect: the zip, as before 016.
6. **Corrections and renames.** After Stop, rename a speaker everywhere and correct one line with "Just this line"; download again. Expect: the new name throughout, and the corrected line under the corrected name.
7. **Without captions.** Transcribe a short Zoom or Teams call (or a Meet call with captions blocked) and download it. Expect: the plain transcript as before; no `Download originals` on its own view.

## Results

Not yet run.
