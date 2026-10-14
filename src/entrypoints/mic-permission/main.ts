// Thin page glue around permission.ts (tested). Opened from setup and from Settings → Microphone.
import { MIC_PERMISSION_TEXT, requestMicPermission } from './permission';

const el = (id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`mic-permission page: #${id} missing`);
  return node;
};

const result = el('result');
const again = el('again') as HTMLButtonElement;
el('title').textContent = MIC_PERMISSION_TEXT.title;
el('why').textContent = MIC_PERMISSION_TEXT.why;
document.title = MIC_PERMISSION_TEXT.title;

async function ask(): Promise<void> {
  again.hidden = true;
  result.textContent = 'Asking Chrome for microphone access…';
  const outcome = await requestMicPermission(navigator.mediaDevices);
  result.textContent = MIC_PERMISSION_TEXT.result[outcome];
  result.dataset.outcome = outcome;
  again.hidden = outcome === 'granted';
}

again.addEventListener('click', () => void ask());
void ask();
