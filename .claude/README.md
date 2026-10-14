# .claude/

Local Claude Code config for this repo. Nothing here is required to start — this file just says where things go so the "do I need to create these?" question doesn't recur in every new repo.

- **`launch.json`** — dev-server / preview config. Not shipped empty: `/run` and the preview tooling create it when there's actually something to launch. Add it by hand if you prefer.
- **`agents/`** — opt-in subagents. Add one only for real multi-step delegation worth isolating. An agent should be bespoke and substantial — don't ship placeholders.
- **`skills/`** — opt-in reusable procedures. Same rule: add when a cross-session procedure is worth packaging, not before.
- **`settings.local.json`** — personal, machine-local permission allow-list. Gitignored by default; commit it only to deliberately share config across machines.
- **`worktrees/`** — harness-managed; gitignored.
