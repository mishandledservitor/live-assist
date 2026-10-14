# live-assist

live-assist is a Chrome extension that transcribes the meeting in your browser tab as it happens and answers questions about what has been said so far. It works with Google Meet, Zoom and Microsoft Teams in the browser, and on Google Meet it names each speaker from Meet's own captions. The transcript sits in Chrome's side panel next to the call, and you can ask it things like "what did I miss in the last five minutes?" or "what does that acronym mean?".

It runs on your own API keys: ElevenLabs for the transcription, and OpenAI or Anthropic for the answers. Nothing goes through a server of ours, and transcripts stay on your computer.

## What you need

| What | Why |
|---|---|
| Google Chrome 116 or later | The extension uses Chrome's side panel. |
| An ElevenLabs API key with Speech to Text access | This key pays for the live transcription. |
| An OpenAI API key or an Anthropic API key | This key pays for the answers to your questions. Setup asks for one of the two. |
| Node.js 24 and pnpm (through Corepack) | You build the extension yourself, because it is not in the Chrome Web Store. |

## Quick start

1. Clone the repository and build the extension:

   ```sh
   git clone https://github.com/mishandledservitor/live-assist.git
   cd live-assist
   corepack enable
   pnpm install
   pnpm build
   ```

2. Open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked** and choose the `.output/chrome-mv3` folder inside the repository.
3. Pin live-assist from Chrome's extensions menu so its icon stays in the toolbar.
4. Click the icon to open the side panel. The first time, it shows **Set up live-assist**. Enter your name (your own lines are labelled with it), your ElevenLabs key, choose who answers your questions (OpenAI or Claude) and paste that provider's key. Then click **Check keys and save**. Each key is checked with its provider before it is saved.
5. Click **Allow microphone**. A tab opens and Chrome asks for microphone access; allow it and close the tab. Without the microphone, live-assist still transcribes everyone else but not you.
6. Join your meeting, click the live-assist icon **on the meeting tab**, and press **Start**. A reminder asks you to tell everyone the meeting is being transcribed; confirm it with **I've told them — start**. Lines appear in the panel as people speak.
7. Type a question in the box under the transcript at any time. Answers cite the moments they rely on as `[mm:ss]`; click one to jump to that line.
8. Press **Stop** when you are done, or just leave the call on Google Meet. The transcript is kept, and **Download transcript** saves it to your Downloads folder.

To update later, run `git pull` and `pnpm build`, then click the reload icon on live-assist's card in `chrome://extensions`.

## Getting your keys

**ElevenLabs** does the transcription. Create a key in your ElevenLabs account under **API keys** at [elevenlabs.io/app/settings/api-keys](https://elevenlabs.io/app/settings/api-keys).

- The key needs **Speech to Text** access. If it is missing, setup says so and tells you to edit the key.
- The key can also have **User: Read** access. With it, the panel header shows your plan, the share of credits left and the renewal date. Without it, everything else still works.
- ElevenLabs bills realtime transcription by time. live-assist mixes the tab audio and your microphone into one stream, so a meeting costs about its length. Check your plan's limits on ElevenLabs' pricing page.

**OpenAI or Anthropic** answers your questions. You need only one of them, and you can switch in Settings at any time.

- For OpenAI, create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys). The default model is GPT-6 Luna; GPT-6.1 Sol and GPT-6 Astra are also offered.
- For Anthropic, create a key at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys). The default model is Claude Sonnet 5.5; Claude Opus 5.5 and Claude Haiku 5.5 are also offered.
- These are API keys, billed per use by the provider. A ChatGPT or Claude subscription does not include API access.

Removing the chat key in Settings turns off questions but never stops transcription.

## Using it

**Speaker names on Google Meet.** When you press Start on a Meet call, live-assist turns Meet's captions on and uses them to tell who is speaking. Meet's captions stay hidden unless you turn on **Show Meet captions** in Settings. Each line takes a name within a few seconds; speech that cannot be placed with confidence, such as overlaps and short interjections, is labelled "Others". You can rename a speaker on every line or correct a single line, and renames of people Meet named are remembered for later meetings.

**Zoom, Teams and other sites.** The tab is transcribed in the same way, but every line is labelled "Others" because speaker names come from Google Meet's captions.

**Language.** The picker next to Start is set to Automatic. You can choose a language there instead; the choice applies to one meeting.

**Key terms.** Add names and product words in Settings to help ElevenLabs recognise them. Up to 50 terms of up to 20 characters each are used.

**Meeting notes.** Attach an agenda or notes from a `.txt` or `.md` file, or paste them, before or during a meeting. Answers can then draw on them as well, and they say so with "From your notes:". Notes go only to the chat provider, never to ElevenLabs.

**Past meetings.** The **Transcripts** screen lists every stored meeting. Open one to read it or download it, or delete it with its questions, answers and notes.

## Your data

- Transcripts, questions, answers and notes are stored only in the extension's local storage on your computer, until you delete them.
- Your keys are stored locally and are never synced. Only the extension's background service worker reads them.
- The extension talks only to `api.elevenlabs.io`, `api.openai.com` and `api.anthropic.com`. Audio goes to ElevenLabs; the transcript, your question and any notes go to the chat provider you chose. OpenAI requests are sent with storage turned off.
- ElevenLabs may use audio to improve its models. To stop that, sign in to ElevenLabs, open your account settings and turn off "Improve the models for everyone".
- Recording a meeting can need everyone's consent where you live. live-assist reminds you to tell people before every Start; you can turn the reminder off in Settings.

## Known limitations

- Speaker names work only on Google Meet, and they depend on the layout of Meet's page, which Google can change without notice.
- ElevenLabs realtime transcription does not separate speakers by voice, so overlapping speech stays "Others".
- Without headphones, your microphone can pick up other people from your speakers and transcribe them twice.
- Past meetings are read-only: you cannot ask questions about them yet.
- The interface is in English.

The full list for each release is in [`CHANGELOG.md`](CHANGELOG.md).

## Development

```sh
pnpm dev         # live-reloading Chrome with the extension loaded
pnpm lint        # ESLint and Prettier
pnpm typecheck   # TypeScript
pnpm test        # unit, DOM and integration tests (Vitest)
pnpm build:e2e && pnpm test:e2e   # end-to-end tests (Playwright)
```

No test needs a real API key or a live meeting; they all run on recorded fixtures. The project is built with [Spec Kit](https://github.com/github/spec-kit): each feature has a spec, plan and task list under `specs/`, and the design decisions are in `.specify/memory/design-decisions.md`. [`CLAUDE.md`](CLAUDE.md) holds the conventions and working rules for coding agents. To propose a change, see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licence

live-assist is released under the MIT licence; see [`LICENSE`](LICENSE). Third-party files are listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
