# Spike A findings: echo without headphones

**Not yet run.** Steps: `spikes/README.md` → "Spike A" (also quickstart.md). Running `pnpm spike:echo spikes/data/echo` replaces this file with the measured results; then review it, fill in "Your notes" and commit it (task T048).

## Duplication per run

| Run | Condition | Remote lines | Duplicated remote lines | Rate | Mic lines | Echo cancellation applied | Duration |
|-----|-----------|--------------|-------------------------|------|-----------|---------------------------|----------|
| 1 | headphones-aec-on | | | | | | |
| 2 | speakers-aec-on | | | | | | |
| 3 | speakers-aec-off | | | | | | |
| 4 | speakers-aec-all (if offered) | | | | | | |

## Recommendation

Pending. Rule (research R7): if run 2 duplicates more than 5 % of remote lines, the FR-028 headphones notice ships (T087–T088) and an echo-suppression filter is proposed as a follow-up; otherwise the notice is not shown.

## Your notes

- Setup (laptop model, speaker volume, room, who was reading):
- Did the duplicated lines in the raw results look like real echoes?
- Decision (T048): headphones notice ships / does not ship
