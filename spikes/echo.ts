// pnpm spike:echo [dir] — Spike A (research R7). See spikes/README.md.
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClip16k, nodeAudioFileDeps } from './lib/audio-file';
import { recommendEcho, renderEchoFindings, scoreRun, type EchoRunResult } from './lib/echo';
import { parseRunMeta } from './lib/echo-runs';
import { nodeConnect, requireApiKey, streamClip } from './lib/stream';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FINDINGS = join(ROOT, 'specs/001-capture-live-transcript/spike-findings/echo.md');
const RESULTS_DIR = join(ROOT, 'spikes/data/echo/results');

async function isRunFolder(path: string): Promise<boolean> {
  try {
    const files = await readdir(path);
    return ['run.json', 'tab.wav', 'mic.wav'].every((f) => files.includes(f));
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const apiKey = requireApiKey(process.env);
  const dir = process.argv[2] ?? join(ROOT, 'spikes/data/echo');
  const folders: string[] = [];
  for (const name of (await readdir(dir)).sort()) {
    const path = join(dir, name);
    if ((await stat(path)).isDirectory() && (await isRunFolder(path))) folders.push(name);
  }
  if (folders.length === 0) {
    throw new Error(`No run folders in ${dir} (each needs run.json, tab.wav and mic.wav from the recorder page).`);
  }

  const audioDeps = await nodeAudioFileDeps();
  const results: EchoRunResult[] = [];
  const raw: unknown[] = [];
  let chromeVersion: string | null = null;
  for (const [i, folder] of folders.entries()) {
    const path = join(dir, folder);
    const meta = parseRunMeta(JSON.parse(await readFile(join(path, 'run.json'), 'utf8')));
    if (!meta) {
      console.warn(`skipped ${folder}: run.json is not a recorder run file`);
      continue;
    }
    chromeVersion ??= meta.chromeVersion;
    const [tabPcm, micPcm] = await Promise.all([
      loadClip16k(join(path, 'tab.wav'), audioDeps),
      loadClip16k(join(path, 'mic.wav'), audioDeps),
    ]);
    console.log(
      `[${i + 1}/${folders.length}] ${folder} (${meta.condition}, ${(meta.durationMs / 1000).toFixed(0)} s): streaming tab and mic in parallel, real time…`,
    );
    const config = { language: { kind: 'auto' as const } };
    const [tab, mic] = await Promise.all([
      streamClip(tabPcm, config, { apiKey, connect: nodeConnect }),
      streamClip(micPcm, config, { apiKey, connect: nodeConnect }),
    ]);
    const errors = [
      ...(tab.error ? [`tab: ${tab.error.message}`] : []),
      ...(mic.error ? [`mic: ${mic.error.message}`] : []),
    ];
    const result = scoreRun(folder, meta, { tab: tab.segments, mic: mic.segments, errors });
    results.push(result);
    raw.push({ folder, meta, tab, mic, pairs: result.echo.pairs });
    console.log(
      `    remote lines ${result.echo.remoteLines}, duplicated ${result.echo.duplicatedRemoteLines} (${(result.echo.rate * 100).toFixed(1)} %)${errors.length ? `, errors: ${errors.join('; ')}` : ''}`,
    );
  }

  const recommendation = recommendEcho(results);
  const date = new Date().toISOString().slice(0, 10);
  await mkdir(RESULTS_DIR, { recursive: true });
  const rawPath = join(RESULTS_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(rawPath, JSON.stringify({ date, results, raw }, null, 2));
  await writeFile(FINDINGS, renderEchoFindings({ date, chromeVersion, results, recommendation }));
  console.log(`\n${recommendation.text}\n\nFindings: ${FINDINGS}\nRaw results (gitignored): ${rawPath}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
