# Changelog

What changes in live-assist from one release to the next, for people who use it. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The development log up to 1.0.0 is in `.specify/memory/development-log.md`.

## [Unreleased]

### Added

- **Ask questions about the meeting**, a tick box in Settings, turns questions off: the question box, answers, the model name and the notes controls leave the panel, and nothing is sent to OpenAI or Anthropic. Your keys, earlier answers and notes are kept and come back when you tick it again. Setup can now be finished with only an ElevenLabs key, which leaves questions off.

### Changed

- Settings is in three groups, **Transcription**, **Speaker names** and **Questions**, each key with what it powers and with what its provider keeps beside it. A saved key is one line with `Replace` and `Remove`; `Replace` opens the field with `Check and save` (Escape or `Cancel` closes it). Questions shows only the key of the provider you chose, and the other provider's key stays saved. The account line's `↻` is now a `Check again` button, and the screen fits the narrowest panel without sideways scrolling.

## [1.1.1] - 2026-10-22

### Fixed

- Speaker names work again on Google Meet calls opened at Meet's newer address, `meet.google.com/meet/…`. On those calls the panel had said speaker names work on Google Meet only.

## [1.1.0] - 2026-10-22

### Added

- `Close transcript`, beside `Download transcript` and `Delete transcript` under a stopped meeting, clears the main view for the next meeting without deleting anything; the meeting stays on the Transcripts screen to read, download or delete. The next time you open the panel after a meeting has stopped, the main view also opens clear by itself. A meeting that is running is never cleared, and once cleared a meeting can no longer be asked about.
- `Download originals` on the Transcripts screen's view of a Google Meet meeting saves the two original files, live-assist's transcript and Meet's captions, as the zip `Download transcript` used to save.

### Changed

- After a Google Meet call, `Download transcript` saves one merged transcript instead of a zip: live-assist's words, with each speaker named from Meet's captions and passages written twice removed. Nothing changes during the meeting, and meetings on Zoom, Teams or without captions download as before.

## [1.0.0] - 2026-10-13

First public release. live-assist is a Chrome extension (Manifest V3) that transcribes the meeting in a browser tab live in Chrome's side panel and answers questions about what has been said so far. It runs on your own ElevenLabs key for transcription and your own OpenAI or Anthropic key for questions. It is not in the Chrome Web Store: build it with `pnpm build` and load `.output/chrome-mv3` as an unpacked extension.

### Added

#### Setup

- First-run setup asks for your name, your ElevenLabs API key and the provider that answers questions (OpenAI or Anthropic Claude) with its key. Each key is checked with its provider and shown only masked afterwards.
- The setup screen and Settings say what ElevenLabs and the chosen chat provider receive and keep, and how to turn off ElevenLabs' use of your audio for training.

#### Live transcript

- Start and Stop in the side panel, opened from the toolbar icon on the meeting tab. The tab's audio and your microphone are mixed on your computer into one ElevenLabs realtime session, so a meeting is billed for about its length.
- Lines appear as people speak and are kept when the panel is closed, after Stop and after the browser is restarted.
- A language picker beside Start: Automatic by default, Greek and English first, then every language ElevenLabs' realtime model lists. The choice applies to one meeting.
- Key terms (names, product words) in Settings are sent to ElevenLabs to improve recognition; you can paste several at once, separated by commas or one per line. Up to 50 terms of up to 20 characters are used; terms over a limit are listed as not used.
- Clean transcript, on by default: fillers and false starts are left out. One switch in Settings turns it off.
- A reminder before Start to tell everyone the meeting is transcribed. Nothing is captured until you acknowledge it; it can be turned off in Settings.
- A dropped connection or the session's time limit reconnects by itself without losing or repeating lines. Key, quota and terms errors are shown in plain words, and a missing microphone leaves the tab audio running and says so.
- One line of status dots under the header (capture, transcription, speaker names, microphone), which opens with the reason and the fix when something is wrong.

#### Speaker names on Google Meet

- On a Meet call, Start turns Meet's captions on and reads who is speaking and when. Each transcript line takes the name of the person who clearly covers it, usually within a few seconds; until then it shows a neutral "…". Your own lines are named from Meet's "You" captions and shown with your name from Settings.
- A line spoken by more than one person is split at the speaker change. Speech that cannot be placed with confidence (overlaps, interjections) stays "Others" rather than taking a neighbour's name.
- Meet's captions are hidden by default; `Show Meet captions` in Settings keeps them visible, and can be switched during a meeting. Stop puts Meet's captions back as they were.
- Nothing from your microphone is sent while you are muted in Meet, including the moment before the mute was noticed. If Meet's mute button cannot be read, the microphone stays silenced.
- Every name in the transcript can be corrected: rename a speaker on all their lines, or change a single line. Renames of people Meet named are remembered for later meetings and can be edited or forgotten in Settings. "Others" can only be corrected line by line, because it can include you.
- When names cannot be read (captions unavailable or turned off, page reloading, not a Meet tab), transcription continues with every line "Others" and the speaker-names status says why.
- Leaving the Meet call stops the meeting and keeps the transcript.

#### Ask the transcript

- A question box under the transcript, with the questions and answers in a collapsible strip above it. Answers stream in, in the language of the question.
- Answers cite the lines they rely on as `[mm:ss]`; selecting a citation scrolls the transcript to that line and highlights it. When something is not in the transcript, the answer says so.
- "What does X mean?" about a term that came up gets the mention cited plus an explanation marked "Background:" without citations. "Others" is never given a name in an answer.
- Models: OpenAI GPT-6 Luna (default), GPT-6.1 Sol and GPT-6 Astra; Anthropic Claude Sonnet 5.5 (Claude's default), Opus 5.5 and Haiku 5.5. Provider and model can be changed in Settings; removing a chat key turns off questions, never transcription.
- A waiting mark until the first word arrives. If no answer has started after 45 seconds, the request is stopped, the turn reads "No answer came back. Ask again." and the question is put back in the box.
- Questions and answers are stored with the meeting and deleted with it.

#### Meeting notes

- Attach notes to a meeting from a `.txt` or `.md` file or pasted text, before Start or during the meeting; they show as a chip with a remove control.
- Answers may use the notes as a separate source: such passages start "From your notes:" (or name the notes in the sentence) and carry no citations. What was said still comes only from the transcript.
- Notes are sent only to the chat provider, never to ElevenLabs, and are deleted with the meeting.

#### Past transcripts and downloads

- A `Transcripts` screen lists every stored meeting, newest first, with its title (from the tab at Start), date, start time, duration and who spoke. A running meeting is marked `In progress`; one cut off by a crash or a closed browser is marked `Interrupted`.
- Select a meeting to read its whole transcript, read-only.
- `Download transcript` saves `Meeting — DD-MM-YYYY at HHhMM — Transcript.txt` to Downloads: one line per utterance as `[mm:ss] Speaker: text`, current names, settled lines only, never questions, answers or notes. It works during a meeting and after it, from the main view or the Transcripts screen.
- `Delete transcript` asks first and then removes the meeting with its questions, answers, notes and captions from every local store. After deleting from the main view, the main view stays empty until the next Start.

#### Meet captions download

- On a Google Meet call, the text of Meet's own captions is kept with the meeting as it arrives, turn by turn, from Start onwards.
- `Download transcript` then saves one `Meeting — DD-MM-YYYY at HHhMM.zip` holding the transcript and `… — Meet captions.txt` (same line format and names). A meeting with only one of them downloads that file on its own.
- The captions text stays on your computer: it is not sent to ElevenLabs or the chat provider, not used by Ask and not shown in the panel. Delete confirmations name the captions when a meeting has them.

#### ElevenLabs account line

- A badge in the header shows your ElevenLabs plan, the share of credits left and the renewal date, for example "Creator plan · 84% of credits left · renews in 12 days (Oct 20)"; exact credit numbers are in Settings. It refreshes when the panel opens, after each meeting and on request, never on a timer. A failure is one plain sentence and never blocks Start.

#### Privacy

- Transcripts, questions, answers, notes and captions are stored only on your computer, in the extension's local storage, until you delete them.
- Keys are stored locally and never synced. The side panel can write a key but never read it back; only the service worker uses keys.
- The extension talks only to `api.elevenlabs.io`, `api.anthropic.com` and `api.openai.com`. OpenAI requests are sent with storage turned off.
- Logs go through a redacting logger that masks keys and tokens and never records audio; the log line for each question carries timings, not the question, the answer or the transcript.
- Every automated test runs on recorded fixtures; no test needs a real key or a live meeting.

### Known limitations

- Speaker names work on Google Meet only. On Zoom, Microsoft Teams and other sites the tab is transcribed, but every line, your own included, is "Others".
- ElevenLabs realtime transcription has no speaker separation (diarization), so names depend entirely on Meet's captions and their timing. Overlapping speech and short interjections stay "Others", and some full sentences still do.
- Speaker names and captions depend on the structure of Meet's page, which Google can change without notice.
- The account line shows no estimate of transcription minutes left: the credit rate of realtime transcription has not been measured yet.
- Echo without headphones has not been measured. Through laptop speakers, your microphone may pick up other people's voices and transcribe them a second time.
- A correct citation can be shown as plain text instead of a link when its sentence quotes a label such as "Others".
- Past meetings are read-only: they cannot be asked about from the Transcripts screen and their names cannot be corrected there.
- Automatic export to a notes folder (004) is not built; transcripts are saved by `Download transcript`.
- The interface is in English.
