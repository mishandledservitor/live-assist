// pnpm spike:meet-trace <trace.json> <corrections.json> <name> [--clear-turns] [--origin <epoch ms>] — 002 T079/T071/T107.
// Writes tests/fixtures/meet/timelines/real-<name>.json and prints SC-001 / SC-002 for it. Needs no key or network.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTimeline } from '../tests/support/timeline';
import { parseCorrections, scoreTimeline, timelineFileName, traceToTimeline } from './lib/meet-trace';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'tests/fixtures/meet/timelines');
const USAGE =
  'Usage: pnpm spike:meet-trace <trace.json> <corrections.json> <name> [--clear-turns] [--origin <epoch ms>]';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const clearTurns = args.includes('--clear-turns');
  const o = args.indexOf('--origin');
  const originArg = o >= 0 ? args[o + 1] : undefined;
  if (o >= 0 && !/^\d+$/.test(originArg ?? '')) throw new Error(USAGE);
  const origin = originArg === undefined ? undefined : Number(originArg);
  const [tracePath, correctionsPath, name] = args.filter(
    (a, i) => a !== '--clear-turns' && !(o >= 0 && (i === o || i === o + 1)),
  );
  if (!tracePath || !correctionsPath || !name) throw new Error(USAGE);

  const trace: unknown = JSON.parse(await readFile(tracePath, 'utf8'));
  const corrections = parseCorrections(JSON.parse(await readFile(correctionsPath, 'utf8')));
  const timeline = traceToTimeline(trace as never, corrections, {
    clearTurns,
    ...(origin !== undefined && { origin }),
  });
  parseTimeline(JSON.parse(JSON.stringify(timeline)));

  const out = join(OUT_DIR, timelineFileName(name));
  await writeFile(out, `${JSON.stringify(timeline, null, 2)}\n`);
  const s = scoreTimeline(timeline);
  console.info(`Wrote ${out}`);
  console.info(
    `SC-001 named correctly: ${((s.correct / Math.max(1, s.total)) * 100).toFixed(1)}% (${s.correct}/${s.total}); SC-002 wrong confirmed names: ${s.wrongConfirmed}`,
  );
  for (const w of s.wrong) console.info(`  ${w.at} ${w.id}: expected ${w.expected}, rules say ${w.got}`);
  console.info('Next (T071): add the file name to the list in tests/unit/core/speakers/timelines.test.ts.');
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
