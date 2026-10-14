// pnpm eval:ask [--provider anthropic|openai] [--model <id>] — 003 answer-quality evaluation (research R12).
// Asks every question of tests/fixtures/chat/eval/*.json over its meeting with the app's own context builder, prompt
// and provider adapter, then scores citation precision (SC-002), "not in the transcript" (SC-003), answer language
// (SC-005), names given to "Others" lines, background for term questions (FR-007) and citations on facts from the chat
// itself (questions may carry earlier turns, replayed append-only). The key comes from the shell only; raw answers go
// to spikes/data/ (gitignored).
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChatError } from '../src/core/chat/provider';
import type { Meeting, TranscriptSegment } from '../src/core/transcript/model';
import { createChatProvider } from '../src/providers/chat/factory';
import {
  evalRequest,
  loadEvalSet,
  parseEvalArgs,
  renderSummary,
  requireChatKey,
  scoreAnswer,
  summarize,
  type AnswerScore,
} from './lib/ask-eval';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EVAL_DIR = join(ROOT, 'tests/fixtures/chat/eval');
const MEETINGS_DIR = join(ROOT, 'tests/fixtures/chat/meetings');
const RESULTS_DIR = join(ROOT, 'spikes/data/ask-eval');

async function main(): Promise<void> {
  const run = parseEvalArgs(process.argv.slice(2));
  const key = requireChatKey(run.provider, process.env);
  const provider = createChatProvider(run.provider, key, (input, init) => fetch(input, init));

  const meetings = new Map<string, { meeting: Meeting; segments: TranscriptSegment[] }>();
  for (const f of (await readdir(MEETINGS_DIR)).filter((n) => n.endsWith('.json')))
    meetings.set(f.replace(/\.json$/, ''), JSON.parse(await readFile(join(MEETINGS_DIR, f), 'utf8')) as never);

  const rows: AnswerScore[] = [];
  const raw: unknown[] = [];
  const files = (await readdir(EVAL_DIR)).filter((n) => n.endsWith('.json') && (!run.set || n === `${run.set}.json`));
  if (files.length === 0) throw new Error(`No evaluation set named ${run.set ?? '(any)'}.`);
  for (const file of files) {
    const set = loadEvalSet(JSON.parse(await readFile(join(EVAL_DIR, file), 'utf8')), (name) => {
      const m = meetings.get(name);
      if (!m) throw new Error(`${file}: no meeting fixture ${name}`);
      return m;
    });
    for (const question of set.questions) {
      const request = evalRequest(set, question, run.model);
      let answer = '';
      let error: string | null = null;
      try {
        for await (const event of provider.stream(request, new AbortController().signal))
          if (event.type === 'text') answer += event.text;
      } catch (e) {
        error = e instanceof ChatError ? e.kind : 'unknown';
      }
      const score = scoreAnswer(question, answer, set.segments, set.names);
      rows.push(score);
      raw.push({ set: set.name, question, answer, error, score });
      console.log(`${set.name}/${question.id} (${question.tag}, ${question.lang})${error ? ` error: ${error}` : ''}`);
    }
  }

  const summary = renderSummary(summarize(rows), run);
  await mkdir(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await writeFile(
    join(RESULTS_DIR, `${stamp}-${run.provider}-${run.model}.json`),
    JSON.stringify({ run, raw }, null, 2),
  );
  console.log(`\n${summary}`);
  console.log(`Raw answers: spikes/data/ask-eval/. Copy the table into specs/003-ask-the-transcript/manual-check.md.`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'eval:ask failed');
  process.exitCode = 1;
});
