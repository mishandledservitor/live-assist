// File names of what a meeting is saved as (013 decisions 69 and 70; 004 FR-017). One base, from the local date and
// time the meeting started, and what each file is after it. Platform-free.

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `Meeting — DD-MM-YYYY at HHhMM`, local time, 24-hour clock. */
export function meetingBaseName(startedAt: number): string {
  const d = new Date(startedAt);
  const date = `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
  return `Meeting — ${date} at ${pad2(d.getHours())}h${pad2(d.getMinutes())}`;
}

/** live-assist's transcript as a panel download, on its own or inside the zip. */
export function transcriptDownloadName(startedAt: number): string {
  return `${meetingBaseName(startedAt)} — Transcript.txt`;
}

/** Meet's own captions of the meeting, on their own or inside the zip. */
export function captionsFileName(startedAt: number): string {
  return `${meetingBaseName(startedAt)} — Meet captions.txt`;
}

/** The one file a press saves when the meeting has both. */
export function downloadZipName(startedAt: number): string {
  return `${meetingBaseName(startedAt)}.zip`;
}
