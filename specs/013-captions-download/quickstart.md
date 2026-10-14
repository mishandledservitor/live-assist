# Quickstart: Captions download (013)

## Run the checks

```sh
pnpm install
pnpm lint && pnpm typecheck
pnpm test                                  # unit, dom and integration (fake-indexeddb)
pnpm exec vitest run tests/unit/core/export/zip.test.ts
pnpm exec vitest run tests/unit/platforms/meet/caption-text-observer.test.ts
pnpm build:e2e && pnpm test:e2e            # captions-download.spec.ts needs `unzip` on the PATH (macOS and the CI runner have it)
```

## Where things are

| Concern | Path |
|---|---|
| Reading a turn's text, merging, re-binding | `src/platforms/meet/{locators,caption-text,caption-observer,page-agent}.ts` |
| The one message that carries caption text | `src/core/messaging/meet-bridge.ts` (`meet/caption-text`) |
| Reassembly and the text stream | `src/core/platform/{adapter,meet-bridge-adapter}.ts` (`subscribeText`) |
| Keeping turns and writing them | `src/core/captions/{model,caption-log}.ts`, `src/core/session/meeting-runtime.ts`, `src/entrypoints/offscreen/store.ts` (the store that switches it on) |
| Storage | `src/storage/{db,meeting-repo}.ts` (`captionTurns`, `DB_VERSION` 4) |
| Names, captions file, zip, what a press saves | `src/core/export/{download-names,captions-file,zip,meeting-files,meeting-download}.ts` |
| Saving and the three texts | `src/entrypoints/sidepanel/{save-file,meeting-api,transcripts-api}.ts`, `components/{DownloadTranscript,DeleteTranscript,ConsentDialog,StartControls,MeetingRow,PastTranscript,TranscriptsScreen}.tsx`, `App.tsx` |

## Regenerating the known-good zip (rarely)

```sh
python3 -I tests/fixtures/zip/make-known-good.py tests/fixtures/zip/known-good.zip
unzip -t tests/fixtures/zip/known-good.zip
```

Only when the contract's byte layout changes. CI never runs it.

## By hand, without a call

1. `pnpm build:e2e`, load `.output/chrome-mv3-e2e` unpacked, open the saved Meet page the e2e helpers route (`tests/e2e/helpers.ts` `openMeetPage`), Start.
2. In the page's console, add caption turns as `captionInMeet` does; watch `captionTurns` fill in DevTools → Application → IndexedDB → `live-assist` every two seconds.
3. `Download transcript`: one zip; `unzip -l` shows the two names.
4. Stop, then `Delete transcript`: the confirmation names Meet's captions; afterwards `captionTurns` has no row of that meeting.

## In a real call

`manual-check.md`, steps 1–15. Steps 8–11 are the things only a live Meet page can show (research "Open risks" O1–O3 and O7).
