# Quickstart: checking 018

```sh
pnpm exec vitest run tests/unit/sidepanel/settings.test.tsx tests/unit/sidepanel/chat-settings.test.tsx tests/unit/sidepanel/settings-screen.test.tsx tests/unit/copy
pnpm build:e2e && pnpm exec playwright test tests/e2e/panel-layout.spec.ts
```

Expected:

- The DOM tests find the three groups in order with the contents of [contracts/settings-ui.md](contracts/settings-ui.md), the key block states, only the selected provider's key, the retention texts beside their keys, and none of the deleted strings.
- The e2e layout case finds no horizontal scroll at 320 px, each field and its button on one line at 380 px, and the Settings screen's scroll height at 380 px at most two thirds of the pre-018 value (SC-002).

By hand (built extension, `pnpm build`, load unpacked): open Settings at the panel's usual width; press `Replace` on the ElevenLabs key, press Escape (line back unchanged), press it again and save a key; switch `Answers from` and see the other provider's key and retention text; untick `Ask questions about the meeting` and see only the heading and the tick box.

## SC-002 measurement

Settings screen scroll height at 380 px with the seeded settings of the e2e case, macOS, 2026-10-22: 1762 px before 018, 1146 px after (35% shorter; SC-002 asks for at most 1174 px).
