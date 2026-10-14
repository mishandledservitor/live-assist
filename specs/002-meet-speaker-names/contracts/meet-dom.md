# Contract: Meet page (DOM) — what the content script relies on

This is the list of assumptions about Google Meet's page, each with the snapshot that proves it. When Meet changes, the failing snapshot test names the broken assumption; the fix is a new snapshot plus a locator change in `src/platforms/meet/locators.ts` (Constitution III). Tier order and sources: research R1.

| # | Assumption | Locator (tiers) | Snapshots that must pass |
|---|-----------|-----------------|--------------------------|
| D1 | In a call, the control bar has a leave button with icon `call_end`, else the "Call controls" region (seen on the real page, research R13) | `inCall(doc)` | in-call-*, greek-ui, real-dom-* (by region); **not** lobby |
| D2 | The captions button exists in a call and shows its state: `aria-pressed`, else the English label ("Turn off/on captions"), else the icon (the real page has no `aria-pressed` and showed `closed_caption` while on, research R13) | `captionsButton(doc)`, `captionsOn(button)` → `boolean \| null` | in-call-captions-off (off), in-call-captions-on (on), greek-ui (on), real-dom-captions-on (on, label), real-dom-captions-off (off, label) |
| D3 | Caption turns are children of a captions region, each with a header (avatar + name span) followed by a text element. The captions region is the region with turns and at most 3 other children, else the one labelled "Captions", else a focusable one with few children; a region labelled with "notification" is never it (the real page puts "Call feature notifications and actions" first, with an avatar chip, research R13) | `captionsRegion(doc)`, `captionItems(region)`, `speakerNameOf(item)` | in-call-captions-on, greek-ui, real-dom-captions-on; real-dom-captions-off (empty region by label) |
| D4 | The user's own turns are labelled with a self word | `isSelfName(name, doc)` → `boolean \| null` | in-call-captions-on ("You"), greek-ui ("Εσύ") |
| D5 | The mic button carries `data-is-muted`; so does the camera button on the real page, and it is never taken for the mic (label "camera" or icon `videocam*`) | `micButton(doc)`, `isMuted(button)` → `boolean \| null` | in-call-captions-off (false), in-call-captions-on (true), lobby (true), greek-ui (false), real-dom-* (false, by label) |
| D6 | Title and meeting code are readable | `meetingTitle(doc)`, `meetingCode(location)` | in-call-* |
| D7 | A changed page degrades, never throws | every locator returns `null` / `[]` | changed-page |

Each locator returns `{ value, tier }` (tier 1–4, research R1) so tests can also assert *which* route matched, and logs can show drift (tier only, never names).

## Behaviour (driven by scripted mutations on a loaded snapshot)

- Clicking the captions button is done with `HTMLElement.click()`; the snapshot test asserts the click happened and that the adapter waits for the button to report `on` (the test flips `aria-pressed` and the icon).
- Hiding: the captions region itself gets `data-live-assist-hidden` — never its parent or any other element (hiding the parent hid Meet's notifications on the real page, research R13); one `<style id="live-assist-captions-hide">` is added; restore removes both. With `Show Meet captions` on (FR-028, design decision 61) neither is added, and switching it during a meeting adds or removes both without a click on the captions button and without a state report; asserted on in-call-captions-off, in-call-captions-on, real-dom-captions-on and real-dom-captions-off. The band around the region and the stage are never touched (research R4, closed 2026-10-12).
- 2026-10-12 (feature 013): the text element of a turn (everything after its header) is now read too, by `captionTextOf(item)`; assumptions D8–D10 and their snapshots are in `specs/013-captions-download/contracts/captions-capture.md`.
- New caption item → `meet/caption` with a new `turnKey`; text mutation inside the latest item → activity for that turn; mutation inside an older item of the same speaker → ignored (Meet's corrections).
- `data-is-muted` flip → `meet/mute` with the new reading; mic button removed and re-added → reading continues from the new button; removed with no replacement for 2 s → reading `null`.

## Snapshots (`tests/fixtures/meet/`)

Synthetic, built from the sources in research.md, marked as such in their `<meta name="live-assist-fixture">`, and replaced or joined by real anonymised snapshots from the user (tasks Phase 7). Names are fictional. See `tests/fixtures/meet/README.md`.
