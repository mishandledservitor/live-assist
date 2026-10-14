# Meet page snapshots

Saved Google Meet pages for the Meet adapter's snapshot tests (constitution III, `specs/002-meet-speaker-names/contracts/meet-dom.md`).

## Synthetic snapshots (2026-10-08)

Built by hand from the open-source projects listed in `specs/002-meet-speaker-names/research.md`, not saved from a real call. Every name in them is fictional. Each file says so in `<meta name="live-assist-fixture">`.

| File | Shows |
|------|-------|
| `in-call-captions-off.html` | In a call, captions off, mic unmuted, captions region present but empty |
| `in-call-captions-on.html` | Captions on with three turns (one is the user's own, "You"), mic muted, non-caption children at the end of the region |
| `lobby.html` | Pre-join screen: mic toggle with `data-is-muted`, no call controls |
| `greek-ui.html` | Greek Meet UI: localised labels, self word guessed as "Εσύ" (unverified) |
| `changed-page.html` | A redesigned page where every locator must fail cleanly |
| `real-dom-captions-on.html` | Rebuilt from the real Meet DOM inspected 2026-10-08 (research R13): the notifications region (with an avatar chip) before the captions region, two turns (one "You"), mic and camera both with `data-is-muted`, captions button without `aria-pressed` |
| `real-dom-captions-off.html` | The same page with captions off and an empty captions region (the off state was not seen; a guess) |

The caption turns hold invented sentences, which the product now reads and keeps (013, `specs/013-captions-download/contracts/captions-capture.md` D8–D10). `captionTextOf` must read exactly these, in page order:

| File | Caption text of each turn |
|------|---------------------------|
| `in-call-captions-on.html` | `Kickoff is at ten tomorrow.` · `I'll post the notes afterwards.` · `Can we move the review to Thursday` |
| `greek-ui.html` | `Καλημέρα σε όλους, let's start with the roadmap.` · `Ναι, έτοιμος.` |
| `real-dom-captions-on.html` | `Kickoff is at ten tomorrow.` · `I'll post the notes afterwards.` (the notifications chip `John Doe wants to join` is not a turn and is never read) |
| `changed-page.html` | none: every element reads as an empty string |

## Real snapshots (`real/`, from the user)

Saved with the dev-only "Save Meet snapshot" action of the spike build (`pnpm build:spike`, tasks Phase 7). The helper strips scripts, styles, inline images and text outside the captions and call controls, and replaces participant names, avatar URLs, the meeting title and code with placeholders (`Participant A`, `Participant B`, …).

Before committing a real snapshot:

1. Open it in a text editor and search for every participant's first and last name, your own name and email, the meeting title and code. None may remain. Search too for any sentence said in the call: the product now reads and keeps the text of caption turns (013), so every turn's text must read `Caption text N` and nothing that was said may remain anywhere in the file.
2. Search for `googleusercontent.com/a/`: avatar URLs must be placeholders.
3. Name the file after what it shows, for example `real/2026-10-in-call-captions-on.html`, and add a row to a table here.
4. Add what the locators should read from it to `real/expected.json` under the file name (in-call state, captions button and state, caption speakers with their self flag, mute state, each with its tier; the shape is `readMeetPage` in `tests/unit/platforms/meet/real-snapshots.test.ts`). That test fails until every real snapshot has an entry and the locators read exactly that; where a real page disagrees with a synthetic one, fix the locator and the synthetic snapshot together (tasks T069).
