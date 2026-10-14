# Spike B findings: mixed Greek/English recognition

**Not yet run.** Steps: `spikes/README.md` → "Spike B" (also quickstart.md). Running `pnpm spike:language spikes/data/language` replaces this file with the measured results; then review it, fill in "Your notes" and commit it (task T047).

## Summary (mean over clips every configuration transcribed)

| Config | Clips | Mean WER | Mean CER |
|--------|-------|----------|----------|
| auto | | | |
| el | | | |
| en | | | |
| el+en | | | |

Configs: `auto` = automatic detection (no language_code); `el` = language_code=el; `en` = language_code=en; `el+en` = language_code=el + secondary_languages=[en].

## Recommendation

Pending. Rule (research R8): the configuration with the lowest mean CER is recommended; if `el+en` wins clearly (≥ 10 % relative), it is raised as a spec change (task T083) rather than built.

## Per clip

| Clip | Duration | Config | WER | CER | Error |
|------|----------|--------|-----|-----|-------|

## Your notes

- Clips used (what kind of speech, how much code-switching, recording conditions):
- Does the recommendation match what you saw in the raw results?
- Decision (T083): keep Automatic / raise a spec change for
