# Data model: Settings layout (018)

No stored data changes (FR-010). `Settings`, its defaults, the ElevenLabs credential and the two chat credentials are read and written exactly as before.

UI state only (component state, never stored):

| Component | State | Values |
|-----------|-------|--------|
| `KeyBlock` | `editing` | `false` (closed line) / `true` (field open); always open while no key is saved |
| `KeyBlock` | `value`, `checking`, `message` | field text (cleared after a chat check, as before), check in flight, last status or error line |
| `Settings` (ElevenLabs block) | `confirmRemove` | the existing remove confirmation |
| `ChatSettings` | `hints` | `{ anthropic, openai }`; both kept, only `hints[chat.provider]` shown |
