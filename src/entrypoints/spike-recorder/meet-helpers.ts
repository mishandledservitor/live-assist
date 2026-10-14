// DEV-ONLY (spike build): file names and inputs for the recorder page's Meet helpers (002 T067, research R11).
// Everything is saved under Downloads/live-assist-meet/; nothing is sent anywhere.

export const MEET_DOWNLOAD_DIR = 'live-assist-meet';

const pad = (n: number) => String(n).padStart(2, '0');

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function meetDownloadPath(kind: 'snapshot' | 'trace' | 'key', label: string, at: Date): string {
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
  const name = slug(label) || kind;
  if (kind === 'snapshot') return `${MEET_DOWNLOAD_DIR}/${stamp}-${name}.html`;
  if (kind === 'trace') return `${MEET_DOWNLOAD_DIR}/${stamp}-trace.json`;
  return `${MEET_DOWNLOAD_DIR}/${stamp}-${name}-names-key-DO-NOT-COMMIT.txt`;
}

/** Names typed one per line or separated by commas. */
export function parseNameList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((n) => n.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function keyFileText(key: Record<string, string>): string {
  const lines = Object.entries(key).map(([placeholder, name]) => `${placeholder} = ${name}`);
  return `Placeholder key for your own review. Never commit this file or copy it into the repo.\n\n${lines.join('\n')}\n`;
}

export interface SavedFile {
  filename: string;
  text: string;
  type: string;
}

/** A saved alignment trace: the trace itself and its placeholder key (retest 2026-10-08, T100). */
export function traceFiles(saved: { trace: unknown; key: Record<string, string> }, at: Date): SavedFile[] {
  return [
    {
      filename: meetDownloadPath('trace', '', at),
      text: `${JSON.stringify(saved.trace, null, 2)}\n`,
      type: 'application/json',
    },
    { filename: meetDownloadPath('key', 'trace', at), text: keyFileText(saved.key), type: 'text/plain' },
  ];
}

/** A file as a data URL: the service worker that saves traces has no blob URLs. */
export function dataUrl(text: string, type: string): string {
  return `data:${type};charset=utf-8,${encodeURIComponent(text)}`;
}
