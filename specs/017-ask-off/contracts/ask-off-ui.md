# UI contract: turning Ask off

## Settings → Questions

| Element | Role / name | Shown |
|---|---|---|
| Heading | `heading` `Questions` (unchanged) | always |
| Ask setting | `checkbox` `Ask questions about the meeting` (new, copy review K48), first line under the heading | always; checked when on |
| Provider radios `Answers from`, `Model` select, `{P} API key` sections | unchanged (003 `ask-ui.md` rows 4a–4c) | only when on |
| Chat provider retention (`ChatRetention`) | unchanged | only when on |

A change saves at once, like the other tick boxes; nothing is announced (no `Saved` line).

## Main view while off

Not present: `region` `Questions and answers`, `textbox` `Question`, `button` `Ask` / `Stop`, the missing-key line, the model label, `button` `Add notes` or the notes chip in the dock, and `button` `Add notes for the next meeting` or its chip beside Start. Everything else (header, status line, transcript, `Download transcript`, `Close transcript`, `Delete transcript`, the Transcripts control) is unchanged.

## Setup

No new element or text. The chat key may be left empty; `Check keys and save` then checks the ElevenLabs key alone. The confirmation reads `Key saved on this computer only: <code>{masked ElevenLabs key}</code>` (the existing line) followed by the microphone text and `Allow microphone`, unchanged.

## Never add

A line saying what turning Ask off does or hides; a line on the main view saying Ask is off or pointing at Settings; a `Skip` button or a helper line in setup saying the chat key is optional; a confirmation before turning Ask off.
