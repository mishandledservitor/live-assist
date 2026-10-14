// Spike B (research R8): mixed Greek/English recognition per language configuration.
import { cer, wer } from './scoring';
import type { StreamConfig } from './stream';

export interface LanguageConfig {
  id: string;
  label: string;
  config: StreamConfig;
}

export const LANGUAGE_CONFIGS: readonly LanguageConfig[] = [
  { id: 'auto', label: 'Automatic detection (no language_code)', config: { language: { kind: 'auto' } } },
  { id: 'el', label: 'language_code=el', config: { language: { kind: 'fixed', code: 'el' } } },
  { id: 'en', label: 'language_code=en', config: { language: { kind: 'fixed', code: 'en' } } },
  {
    id: 'el+en',
    label: 'language_code=el + secondary_languages=[en]',
    config: { language: { kind: 'fixed', code: 'el' }, secondaryLanguages: ['en'] },
  },
];

const AUDIO_EXT = /\.(wav|mp3|m4a|aac|ogg|oga|opus|flac|webm|mp4)$/i;
const TEXT_EXT = /\.txt$/i;

export interface ClipPair {
  name: string;
  audio: string;
  reference: string;
}

export function pairClips(files: readonly string[]): {
  clips: ClipPair[];
  missingReference: string[];
  missingAudio: string[];
} {
  const texts = new Map(files.filter((f) => TEXT_EXT.test(f)).map((f) => [f.replace(TEXT_EXT, ''), f]));
  const clips: ClipPair[] = [];
  const missingReference: string[] = [];
  const used = new Set<string>();
  for (const f of [...files].sort()) {
    if (!AUDIO_EXT.test(f)) continue;
    const name = f.replace(AUDIO_EXT, '');
    const reference = texts.get(name);
    if (reference === undefined) missingReference.push(f);
    else {
      clips.push({ name, audio: f, reference });
      used.add(name);
    }
  }
  const missingAudio = [...texts.entries()].filter(([name]) => !used.has(name)).map(([, f]) => f);
  return { clips, missingReference, missingAudio: missingAudio.sort() };
}

export function scoreClip(
  reference: string,
  segments: readonly { text: string; startMs: number }[],
): { wer: number; cer: number } {
  const hypothesis = [...segments]
    .sort((a, b) => a.startMs - b.startMs)
    .map((s) => s.text)
    .join(' ');
  return { wer: wer(reference, hypothesis), cer: cer(reference, hypothesis) };
}

export interface ClipScore {
  clip: string;
  config: string;
  wer: number;
  cer: number;
  durationMs: number;
  /** Error kind when the session failed; its scores are not used. */
  error: string | null;
}

export interface ConfigSummary {
  config: string;
  meanWer: number;
  meanCer: number;
  clips: number;
}

/** Means per config over the clips on which every config succeeded, so configs are compared on equal footing. */
export function summarize(rows: readonly ClipScore[], configs: readonly string[]): ConfigSummary[] {
  const clips = [...new Set(rows.map((r) => r.clip))].filter((clip) =>
    configs.every((c) => rows.some((r) => r.clip === clip && r.config === c && r.error === null)),
  );
  return configs.map((config) => {
    const ok = rows.filter((r) => r.config === config && r.error === null && clips.includes(r.clip));
    const mean = (f: (r: ClipScore) => number) =>
      ok.length === 0 ? NaN : ok.reduce((a, r) => a + f(r), 0) / ok.length;
    return { config, meanWer: mean((r) => r.wer), meanCer: mean((r) => r.cer), clips: ok.length };
  });
}

export const CLEAR_WIN = 0.1;

export interface LanguageRecommendation {
  best: string | null;
  /** True when the result would change what "Automatic" sends — a spec change for the user (T083). */
  specChange: boolean;
  text: string;
}

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;

export function recommendLanguage(summary: readonly ConfigSummary[]): LanguageRecommendation {
  const ranked = summary.filter((s) => s.clips > 0 && Number.isFinite(s.meanCer)).sort((a, b) => a.meanCer - b.meanCer);
  const best = ranked[0];
  if (!best) return { best: null, specChange: false, text: 'Inconclusive: no clip was transcribed by every config.' };
  if (best.config === 'auto') {
    return {
      best: 'auto',
      specChange: false,
      text: `Keep Automatic detection as the default (FR-014): it has the lowest mean CER (${pct(best.meanCer)}).`,
    };
  }
  const next = ranked[1];
  const margin = next && next.meanCer > 0 ? (next.meanCer - best.meanCer) / next.meanCer : 1;
  if (margin < CLEAR_WIN) {
    return {
      best: best.config,
      specChange: false,
      text: `${best.config} has the lowest mean CER (${pct(best.meanCer)}) but it is not a clear win (${pct(margin)} better than ${next?.config ?? 'the rest'}, below the 10 % bar); keep Automatic detection as the default.`,
    };
  }
  return {
    best: best.config,
    specChange: true,
    text: `${best.config} wins clearly: mean CER ${pct(best.meanCer)}, ${pct(margin)} better than ${next?.config ?? 'the rest'}. Per research R8 this changes what "Automatic" should send, which is a new setting — raise it with the user as a spec change (task T083) rather than building it.`,
  };
}

export interface LanguageFindingsInput {
  date: string;
  rows: readonly ClipScore[];
  summary: readonly ConfigSummary[];
  recommendation: LanguageRecommendation;
}

export function renderLanguageFindings(input: LanguageFindingsInput): string {
  const configLabel = (id: string) => LANGUAGE_CONFIGS.find((c) => c.id === id)?.label ?? id;
  const clips = [...new Set(input.rows.map((r) => r.clip))];
  const errors = input.rows.filter((r) => r.error !== null);
  const lines = [
    '# Spike B findings: mixed Greek/English recognition',
    '',
    `Generated by \`pnpm spike:language\` on ${input.date}. Method: research R8 (each clip streamed in real time through ElevenLabs Scribe v2 Realtime once per configuration; WER and CER against your reference after normalisation — case, punctuation, Greek tonos and final sigma folded). Only metrics are recorded here; the recognised text stays in the gitignored \`spikes/data/language/results/\`.`,
    '',
    '## Summary (mean over clips every configuration transcribed)',
    '',
    '| Config | Clips | Mean WER | Mean CER |',
    '|--------|-------|----------|----------|',
    ...input.summary.map((s) => `| ${s.config} | ${s.clips} | ${pct(s.meanWer)} | ${pct(s.meanCer)} |`),
    '',
    'Configs: ' + LANGUAGE_CONFIGS.map((c) => `\`${c.id}\` = ${c.label}`).join('; ') + '.',
    '',
    '## Recommendation',
    '',
    input.recommendation.text,
    '',
    '## Per clip',
    '',
    '| Clip | Duration | Config | WER | CER | Error |',
    '|------|----------|--------|-----|-----|-------|',
    ...clips.flatMap((clip) =>
      input.rows
        .filter((r) => r.clip === clip)
        .map(
          (r) =>
            `| ${r.clip} | ${(r.durationMs / 1000).toFixed(0)} s | ${r.config} | ${r.error ? '—' : pct(r.wer)} | ${r.error ? '—' : pct(r.cer)} | ${r.error ?? ''} |`,
        ),
    ),
    '',
    '## Errors',
    '',
    errors.length === 0 ? 'None.' : errors.map((r) => `- ${r.clip} / ${configLabel(r.config)}: ${r.error}`).join('\n'),
    '',
    '## Your notes',
    '',
    '- Clips used (what kind of speech, how much code-switching, recording conditions):',
    '- Does the recommendation match what you saw in the raw results?',
    '- Decision (T083): keep Automatic / raise a spec change for',
    '',
  ];
  return lines.join('\n');
}
