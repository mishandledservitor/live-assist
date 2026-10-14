# Quickstart: Download transcript (007)

```sh
pnpm exec vitest run tests/unit/core/export tests/unit/sidepanel/download-transcript.test.tsx tests/unit/sidepanel/save-file.test.tsx
pnpm build:e2e && pnpm exec playwright test tests/e2e/download.spec.ts
```

## By hand (real Meet call) — `manual-check.md`

1. `pnpm build`, reload the unpacked extension, reload the Meet tab, click the toolbar icon.
2. Before Start: no `Download transcript` under `No transcript yet.`
3. Start; once the first lines are named, press `Download transcript`. A file `Meeting — DD-MM-YYYY at HHhMM.txt` (today, the Start time) lands in Downloads holding the named lines so far and no grey in-progress text.
4. Rename a speaker, download again: Chrome saves `… (1).txt` with the new name; the first file is untouched.
5. Ask a question in the Ask box, Stop, download: the file has every line, no question or answer text, one blank line between lines, nothing above the first line.
6. Open the file in a text editor: Greek text reads correctly.
