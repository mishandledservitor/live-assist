# Feature Specification: Download transcript

**Feature Branch**: `007-download-transcript`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "A `Download transcript` button in the side panel for the meeting shown in the panel — running or the most recent stored one. It saves one file to the user's Downloads folder, named and formatted exactly as 004 specifies (`Meeting — DD-MM-YYYY at HHhMM.txt`; lines `[mm:ss] Speaker: text` separated by one blank line; no header; speakers by current labels — names, the user's name, or "Others"; transcript only, never chat or AI text). Ships before 004; 004 will reuse the formatter. Partial (grey, unconfirmed) lines are not included. Consider: button placement and states (no meeting → absent or disabled; during a running meeting it downloads the transcript so far), filename collisions (let Chrome uniquify), empty transcript." Design decision 48 (user, 2026-10-09).

## Clarifications

### Session 2026-10-09 (assumptions, resolved without the user — the user asked for sensible defaults rather than questions)

- Q: Where does the button go? → A: After the last line of the transcript, in the same place as `Delete transcript` (006 FR-013), before it. While a meeting runs it is there alone; after Stop both show. The slim header (decision 32) stays as it is.
- Q: No meeting, or a meeting with nothing to download? → A: The button is absent, not disabled. The transcript area already says `No transcript yet.` (K27), so nothing is added. It appears with the first finished line.
- Q: Which lines go in the file while names are still settling? → A: Only settled lines. Partial (in-progress) lines are left out, and so are finished lines whose name is still pending (the `…` placeholder, design decision 37, about 6 s after a line ends). Writing them as "Others" would put a label in the file that the panel then changes to a name; a download a few seconds later has them.
- Q: Timestamps past one hour? → A: Minutes keep counting (`[75:12]`), as 004 specifies (004 FR-019), even though the panel shows `1:15:12`.
- Q: A line's text contains a line break? → A: Written on one line, whitespace collapsed (004 edge case). A line whose text is empty after that is left out.
- Q: Line ending at the end of the file? → A: Lines are joined by one blank line and the file ends with a single newline after the last line. Line breaks are `\n`; the text is UTF-8 (Greek must survive).
- Q: Same name twice (downloading again, or two meetings started in the same minute)? → A: The app always asks for the exact 004 name; Chrome adds its own ` (1)` suffix when a file of that name already exists. Nothing is overwritten.
- Q: Feedback after the download? → A: None from the panel. Chrome shows its own download indicator; a "Downloaded" line would duplicate it.
- Q: Chrome set to "Ask where to save each file"? → A: Chrome's save dialog appears with the name filled in; that is the user's own browser setting and is respected.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Save the transcript of the meeting in the panel (Priority: P1)

After a meeting (or in the middle of one) the user wants the transcript as a text file, to drop into the knowledge-base inbox by hand or keep, without waiting for 004's automatic export. They press `Download transcript` under the last line; a file named like the existing inbox drops lands in their Downloads folder.

**Why this priority**: It is the whole feature: the transcript leaves the panel in the inbox format.

**Independent Test**: With a stored meeting fixture on screen, press `Download transcript`; one file is saved whose name and content match the 004 format byte for byte.

**Acceptance Scenarios**:

1. **Given** a stopped meeting started at 14:30 on 7 October 2026 is shown, **When** the user presses `Download transcript`, **Then** one file named `Meeting — 07-10-2026 at 14h30.txt` is saved to Downloads.
2. **Given** that file, **When** it is read, **Then** every line is `[mm:ss] Speaker: text` in time order, lines are separated by exactly one blank line, there is no header, footer, chat or AI text, and each speaker is the label the panel shows now (a name, the user's name, a single-line correction, or "Others").
3. **Given** the user renamed a speaker or corrected a line before downloading, **When** they download, **Then** the file shows the corrected names.
4. **Given** a meeting longer than an hour, **When** it is downloaded, **Then** a line at 1 h 15 min 12 s reads `[75:12] …`.

---

### User Story 2 - Download while the meeting is still running (Priority: P2)

Mid-meeting, the user wants what has been said so far — to share a catch-up, or as a safety copy. The button is there during the meeting and saves the transcript so far.

**Why this priority**: Useful but secondary to the after-meeting case; transcription carries on regardless.

**Independent Test**: With a running meeting fed by a recorded transcription fixture, press `Download transcript`; the file holds the finished, settled lines shown so far and no in-progress text, and transcription continues.

**Acceptance Scenarios**:

1. **Given** a running meeting with finished lines and an in-progress line, **When** the user downloads, **Then** the file holds the finished lines and not the in-progress text.
2. **Given** a finished line whose name is still pending (`…`), **When** the user downloads, **Then** that line is not in the file; a download after it settles includes it with its name.
3. **Given** a download during the meeting, **When** it completes, **Then** transcription, the status line and the panel carry on unchanged.

---

### User Story 3 - Nothing to download (Priority: P3)

Before any meeting, or right after Start before the first line, there is nothing to save, and the panel offers nothing to press.

**Why this priority**: Prevents empty files; small.

**Independent Test**: Render the panel with no meeting, and with a running meeting with no finished lines; no `Download transcript` button exists. Add a finished line; the button appears.

**Acceptance Scenarios**:

1. **Given** no meeting has ever been transcribed, **When** the panel opens, **Then** there is no `Download transcript` button.
2. **Given** a meeting that has only in-progress or pending lines, **When** the panel shows it, **Then** there is no `Download transcript` button.
3. **Given** the transcript was deleted, **When** the panel shows the next most recent meeting or none, **Then** the button follows that meeting or is absent.

### Edge Cases

- Two downloads of the same meeting, or two meetings started in the same minute: Chrome keeps both files, adding its own numbered suffix to the second; the app never overwrites a file.
- Greek or mixed-language text: saved as UTF-8 and reads back unchanged.
- A line with line breaks or runs of spaces: written as one line with single spaces.
- A label correction made while the meeting runs: the next download uses it.
- The panel is reopened mid-meeting: the button reflects the transcript the panel now shows.
- A very long meeting (3 hours, about 5,000 lines): the download is produced without a visible pause in the panel.
- Chrome's "Ask where to save" setting: Chrome's dialog opens with the name filled in.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The side panel MUST show a `Download transcript` button for the meeting it shows — running, or the most recent stored meeting — placed after the last transcript line, before `Delete transcript` when that is shown.
- **FR-002**: The button MUST be absent when no meeting is shown, and when the meeting shown has no line that would be written to the file (FR-006). (Amended 2026-10-12, feature 013, design decision 75: a meeting with kept Meet captions and no such line still shows the button, which saves the captions file alone.)
- **FR-003**: Pressing it MUST save exactly one file to the browser's download location, without leaving the panel and without changing the meeting, its labels or transcription. (Amended 2026-10-12, feature 013, design decisions 67 and 68: still exactly one file per press. For a meeting with kept Meet captions that file is a `.zip` holding this transcript file and the captions file; without captions it is the transcript `.txt` as here. See `specs/013-captions-download/spec.md`.)
- **FR-004**: The file MUST be named `Meeting — DD-MM-YYYY at HHhMM.txt` from the local date and time the meeting started, exactly as 004 FR-017. (Amended 2026-10-12, feature 013, design decision 70: every transcript downloaded from the panel is named `Meeting — DD-MM-YYYY at HHhMM — Transcript.txt`, on its own or inside a zip. `Meeting — DD-MM-YYYY at HHhMM.txt` remains the name of 004's inbox export only.)
- **FR-005**: The body MUST follow 004 FR-018 and FR-019: one `[mm:ss] Speaker: text` line per transcript line in time order, exactly one blank line between lines, no header or footer, minutes counting past 59, and `Speaker` the line's current display label (name, user's name, single-line correction, or "Others"). The file ends with one newline after the last line.
- **FR-006**: The file MUST contain only finished lines whose speaker is settled: in-progress text and lines whose name is pending are left out. Lines whose text is empty after collapsing whitespace are left out.
- **FR-007**: Line text and labels MUST be written on a single line, with runs of whitespace (including line breaks) collapsed to one space.
- **FR-008**: The file MUST NOT contain chat questions, answers, model names, status text or any AI-generated text (constitution II).
- **FR-009**: The app MUST request the exact FR-004 name every time and MUST NOT overwrite an existing file; when a file of that name exists, the browser's own uniquified name is accepted.
- **FR-010**: Building the file name and body MUST be one platform-free formatter that 004 reuses for its inbox export, so both produce identical files for the same meeting. (Amended 2026-10-12, decision 70: identical bodies; the download and the inbox export now differ in name.)
- **FR-011**: The download MUST NOT send the transcript anywhere over the network (constitution I) and MUST NOT need a new browser permission.
- **FR-012**: The only new user-facing string is the button label `Download transcript`, recorded in the copy review and checked against `embody-dont-announce`.

### Key Entities

- **Transcript file**: name (from the meeting's start time) and body (settled transcript lines with current labels). Built, not stored: 007 keeps nothing new.
- **Meeting shown**: the running meeting or the most recent stored one, with its lines and label corrections (existing data from 001/002).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of files produced from the fixture suite match the 004 format exactly (name pattern, line pattern, one blank line between lines, nothing else).
- **SC-002**: From a stopped meeting on screen, the file is in Downloads within 1 second of one press.
- **SC-003**: A 3-hour transcript (about 5,000 lines) downloads without the panel becoming unresponsive for more than 200 ms.
- **SC-004**: The extension's permission list after 007 is identical to before (no new install or update warning).
- **SC-005**: A file downloaded from the panel is accepted by the knowledge-base workflow like an existing inbox drop, without manual edits.

## Assumptions

- The meeting shown in the panel is the existing "running or most recent stored" meeting from 001's panel; 007 adds no history and no way to pick an older meeting (004 adds that and its own export button, reusing the formatter).
- The button's place follows 006 FR-013 (after the last line); the header is unchanged.
- Chrome's download location and "Ask where to save" setting are the user's; the app does not choose a folder (004 adds the granted inbox folder).
- Pending lines settle about 6 s after they end (design decision 37), so leaving them out costs at most the last few seconds of a mid-meeting download.
- A stopped meeting read from storage never has pending lines (002), so a download after Stop contains every finished line.
- No confirmation message after download: Chrome's own download indicator shows the file.
