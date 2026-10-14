# Contributing to live-assist

Bug reports, fixes and new features are all welcome.

## Before you start

- **For a security problem,** such as a way to expose an API key or a transcript, do not open a public issue. Report it privately from the repository's **Security** tab with **Report a vulnerability**.
- **For a bug,** open an issue that says what you did, what you expected and what happened instead. Include your Chrome version and the meeting platform (Google Meet, Zoom or Teams). Never paste an API key, a transcript of a real meeting or real people's names.
- **For a new feature or a change in behaviour,** open an issue first and describe the problem it solves. Agreeing on the idea before you write code saves you from building something that won't be merged.
- **For a typo or a small fix,** go straight to a pull request.

## Setting up

You need Node.js 24 and pnpm, which Corepack provides.

```sh
git clone https://github.com/<your-account>/live-assist.git
cd live-assist
corepack enable
pnpm install
pnpm dev
```

`pnpm dev` opens a Chrome window with the extension loaded and reloads it as you edit. The README explains how to get the ElevenLabs and OpenAI or Anthropic keys you need to try it in a real meeting. No automated test needs a key.

## How changes are made here

**Every change to what a user sees starts with a spec.** The project uses [Spec Kit](https://github.com/github/spec-kit). A feature has its own folder under `specs/` with a `spec.md` (what it does and why), a `plan.md` (how it is built) and a `tasks.md` (the steps). If your change adds or alters behaviour, add or update the spec in the same pull request. A fix that makes the code match an existing spec does not need a new one. The rules that outrank everything else are in `.specify/memory/constitution.md`, and past design decisions with their reasons are in `.specify/memory/design-decisions.md`.

**Tests come first.** Write a test that fails because the behaviour is missing, then write the code that makes it pass, then tidy up with the tests still passing. A pull request that changes behaviour without a test for it will be asked for one.

**Tests run on recorded data.** Automated tests use the recorded ElevenLabs responses and synthetic audio in `tests/fixtures/`, with fakes in `tests/support/`. Never add a real API key, real meeting audio, a real transcript or real people's names to the repository. Fixture people use generic names such as John Doe and Jane Smith.

**Text a user sees follows the copy rule.** Every string in the panel, settings, status lines and error messages says what something does or what to do, without narrating the screen or reassuring the reader. The full rule is in the Conventions section of [`CLAUDE.md`](CLAUDE.md). New strings are recorded in `specs/006-panel-redesign/copy-review.md`, and a test checks them.

**The code is split into layers.** `src/core/` holds logic that runs anywhere and must not use `chrome`, the DOM or the network; ESLint enforces this. Vendor protocols live in `src/providers/`, and Chrome APIs are wired up only in `src/entrypoints/`. The README's Development section and [`CLAUDE.md`](CLAUDE.md) describe the layout in more detail.

## Before you open a pull request

Run the same checks as CI:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm build:e2e && pnpm test:e2e
```

Then open the pull request against `main`:

- Keep it to one change, and say in the description what it does and why. Link the issue it closes.
- If it changes what a user sees, add a line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md), written for the people who use the extension.
- CI must pass. On your first pull request, CI starts once a maintainer approves the run.
- Expect review comments; a maintainer merges the pull request once it is ready.

## Using coding agents

[`CLAUDE.md`](CLAUDE.md) holds the working rules for AI coding agents, and the Spec Kit commands are in `.claude/skills/`. Contributions written with an agent are welcome on the same terms as any other: the spec, the tests and the checks above all apply, and you are responsible for what you submit.

## Licence

live-assist is released under the MIT licence. By opening a pull request, you agree that your contribution is released under the same licence.
