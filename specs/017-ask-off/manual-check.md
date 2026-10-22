# Manual check record: 017 Turn Ask off

Real-browser checks that automated tests cannot cover (constitution III). Not yet run: the steps below are for the owner, in the loaded extension. Automated coverage already in place:

- `tests/unit/core/settings/settings.test.ts`: on by default, and on for stored settings from before 017.
- `tests/unit/sidepanel/app-ask-off.test.tsx`: the tick box first under Questions; unticked, no provider, model, keys or retention text in Settings; no Ask or notes element on the main view with no meeting, a running meeting, a stopped meeting and after `Close transcript`; nothing asked and no chat or notes read from Start to Stop; off and on again in the open panel brings back earlier answers and notes; an answer still arriving is stopped, the waiting question is not sent and unsent text is dropped.
- `tests/unit/sidepanel/setup-chat.test.tsx`, `app-setup-gating.test.tsx`: setup finished with the chat key empty leaves Ask off and checks only the ElevenLabs key; with a key, Ask stays on.
- `tests/unit/copy/keep-strings.test.tsx` (K48) and `tests/unit/copy/copy-review.test.ts` (A13).
- `tests/e2e/ask-off.spec.ts` on the built extension: off, across a panel reload, and on again with the stored key.

**Build** (from the repo root, on branch `017-ask-off` or later):

```sh
pnpm install
pnpm build
```

Reload the unpacked extension in `chrome://extensions` and open the side panel. Chrome should not ask to accept any new permission.

## Steps

1. Settings → Questions: `Ask questions about the meeting` is ticked. Untick it: the provider choice, model, key sections and `What OpenAI keeps` / `What Anthropic keeps` disappear; `Questions` and the tick box stay.
2. Back: no question box, `Ask` button, `Add a Claude or OpenAI key…` line, model label, or `Add notes` beside Start or under the transcript.
3. Start and Stop a short meeting on a Meet call: transcription, speaker names, `Download transcript`, `Close transcript` and the Transcripts screen work as before. In DevTools → Network for the service worker, no request goes to `api.openai.com` or `api.anthropic.com`.
4. Close the panel and open it again, then restart Chrome: Ask is still off.
5. Tick it again: the question box is back, the stored key works without re-entry, earlier answers and attached notes of a meeting shown are there.
6. With Ask on, ask a long question and untick Ask while the answer arrives: back on the main view nothing is shown; tick it again: the answer shows as `Stopped` with what had arrived.
7. On a fresh profile, finish setup with only a name and an ElevenLabs key: the main view opens with no Ask and `Start` works.

## Results

Not yet run.
