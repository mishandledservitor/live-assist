// pnpm spike:language [dir] — Spike B (research R8). See spikes/README.md.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClip16k, nodeAudioFileDeps } from './lib/audio-file';
import {
  LANGUAGE_CONFIGS,
  pairClips,
  recommendLanguage,
  renderLanguageFindings,
  scoreClip,
  summarize,
  type ClipScore,
} from './lib/language';
import { nodeConnect, requireApiKey, streamClip } from './lib/stream';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FINDINGS = join(ROOT, 'specs/001-capture-live-transcript/spike-findings/language.md');
const RESULTS_DIR = join(ROOT, 'spikes/data/language/results');

async function main(): Promise<void> {
  const apiKey = requireApiKey(process.env);
  const dir = process.argv[2] ?? join(ROOT, 'spikes/data/language');
  const { clips, missingReference, missingAudio } = pairClips(await readdir(dir));
  for (const f of missingReference) console.warn(`skipped ${f}: no ${f.replace(/\.[^.]+$/, '')}.txt reference`);
  for (const f of missingAudio) console.warn(`skipped ${f}: no matching audio clip`);
  if (clips.length === 0) throw new Error(`No clip/reference pairs in ${dir} (name.wav or name.mp3 + name.txt).`);

  const audioDeps = await nodeAudioFileDeps();
  const rows: ClipScore[] = [];
  const raw: unknown[] = [];
  for (const [i, clip] of clips.entries()) {
    const pcm = await loadClip16k(join(dir, clip.audio), audioDeps);
    const reference = await readFile(join(dir, clip.reference), 'utf8');
    const durationMs = Math.round((pcm.length / 16000) * 1000);
    console.log(
      `[${i + 1}/${clips.length}] ${clip.name} (${(durationMs / 1000).toFixed(0)} s): streaming ${LANGUAGE_CONFIGS.length} configs in parallel, real time…`,
    );
    const results = await Promise.all(
      LANGUAGE_CONFIGS.map((c) => streamClip(pcm, c.config, { apiKey, connect: nodeConnect })),
    );
    results.forEach((r, j) => {
      const config = LANGUAGE_CONFIGS[j]!.id;
      const score = r.error ? { wer: NaN, cer: NaN } : scoreClip(reference, r.segments);
      rows.push({ clip: clip.name, config, ...score, durationMs, error: r.error?.kind ?? null });
      raw.push({ clip: clip.name, config, sessionId: r.sessionId, error: r.error, segments: r.segments });
      console.log(
        `    ${config.padEnd(6)} ${r.error ? `error: ${r.error.message}` : `WER ${pct(score.wer)}  CER ${pct(score.cer)}`}`,
      );
    });
  }

  const summary = summarize(
    rows,
    LANGUAGE_CONFIGS.map((c) => c.id),
  );
  const recommendation = recommendLanguage(summary);
  const date = new Date().toISOString().slice(0, 10);

  await mkdir(RESULTS_DIR, { recursive: true });
  const rawPath = join(RESULTS_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(rawPath, JSON.stringify({ date, rows, raw }, null, 2));
  await writeFile(FINDINGS, renderLanguageFindings({ date, rows, summary, recommendation }));

  console.log('\nConfig  Clips  Mean WER  Mean CER');
  for (const s of summary)
    console.log(`${s.config.padEnd(7)} ${String(s.clips).padEnd(6)} ${pct(s.meanWer).padEnd(9)} ${pct(s.meanCer)}`);
  console.log(`\n${recommendation.text}\n\nFindings: ${FINDINGS}\nRaw results (gitignored): ${rawPath}`);
}

const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)} %` : '—');

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
