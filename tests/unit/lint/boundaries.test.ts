// T001: layer boundaries in eslint.config.js (plan: Meet layer). Lints in-memory probes at virtual paths, so no file
// in the repo has to break a rule for the rule to be checked.
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../../..');
// Probe files do not exist, so the type-aware project service is switched off and only the boundary rules run.
const BOUNDARY_RULES = new Set(['no-restricted-globals', 'no-restricted-imports']);
const eslint = new ESLint({
  cwd: ROOT,
  overrideConfig: { languageOptions: { parserOptions: { projectService: false } } },
  ruleFilter: ({ ruleId }) => BOUNDARY_RULES.has(ruleId),
});

async function ruleIds(path: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(ROOT, path) });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

describe('lint boundary: src/platforms (the Meet DOM layer)', () => {
  const probe = 'src/platforms/meet/__probe__.ts';

  it('may use the DOM', async () => {
    expect(await ruleIds(probe, 'export const n = document.querySelectorAll("div").length;\n')).toEqual([]);
  });

  it.each([
    ['chrome', 'export const id = chrome.runtime.id;\n'],
    ['browser', 'export const id = (browser as { id: string }).id;\n'],
    ['WebSocket', 'export const s = new WebSocket("wss://example.invalid");\n'],
    ['fetch', 'export const p = fetch("https://example.invalid");\n'],
  ])('may not use %s', async (_name, code) => {
    expect(await ruleIds(probe, code)).toContain('no-restricted-globals');
  });

  it('may not import idb', async () => {
    expect(await ruleIds(probe, 'import { openDB } from "idb";\nexport const o = openDB;\n')).toContain(
      'no-restricted-imports',
    );
  });
});

describe('lint boundary: who may import src/platforms', () => {
  const importPlatforms = 'import * as meet from "@/platforms/meet/locators";\nexport const m = meet;\n';
  const relativeImport = 'import * as meet from "../../platforms/meet/locators";\nexport const m = meet;\n';

  it.each([
    'src/core/__probe__.ts',
    'src/providers/__probe__.ts',
    'src/storage/__probe__.ts',
    'src/audio/__probe__.ts',
    'src/entrypoints/offscreen/__probe__.ts',
    'src/entrypoints/sidepanel/__probe__.ts',
    'src/entrypoints/background/__probe__.ts',
  ])('%s may not', async (path) => {
    expect(await ruleIds(path, importPlatforms)).toContain('no-restricted-imports');
    expect(await ruleIds(path, relativeImport)).toContain('no-restricted-imports');
  });

  it('src/entrypoints/meet.content may', async () => {
    const ids = await ruleIds('src/entrypoints/meet.content/__probe__.ts', importPlatforms);
    expect(ids).not.toContain('no-restricted-imports');
  });
});

// Red-team 2026-10-08 (001 T109, FR-003a): the side panel never reads the API key, so it may not even import the full
// settings store (which can); it uses PanelSettingsStore.
describe('lint boundary: the side panel and the key', () => {
  const probe = 'src/entrypoints/sidepanel/__probe__.ts';

  it.each([
    'import { SettingsStore } from "../../storage/settings-store";\nexport const s = SettingsStore;\n',
    'import { SettingsStore } from "@/storage/settings-store";\nexport const s = SettingsStore;\n',
    'import * as all from "../../storage/settings-store";\nexport const s = all;\n',
  ])('may not import the full settings store: %s', async (code) => {
    expect(await ruleIds(probe, code)).toContain('no-restricted-imports');
  });

  it('may import the panel store', async () => {
    const code =
      'import { PanelSettingsStore } from "../../storage/panel-settings-store";\nexport const s = PanelSettingsStore;\n';
    expect(await ruleIds(probe, code)).toEqual([]);
  });

  it('the background may still import the full store', async () => {
    const code = 'import { SettingsStore } from "../../storage/settings-store";\nexport const s = SettingsStore;\n';
    expect(await ruleIds('src/entrypoints/background/__probe__.ts', code)).toEqual([]);
  });
});

// 003 T018 (research R2, constitution V): only the chat adapters know a vendor's wire format, so only
// src/providers/chat/ may import the vendor SDKs.
describe('lint boundary: the chat SDKs', () => {
  const imports = [
    'import Anthropic from "@anthropic-ai/sdk";\nexport const a = Anthropic;\n',
    'import { APIError } from "@anthropic-ai/sdk/core/error";\nexport const a = APIError;\n',
    'import OpenAI from "openai";\nexport const o = OpenAI;\n',
    'import { APIError } from "openai/error";\nexport const o = APIError;\n',
  ];

  it.each(
    [
      'src/core/chat/__probe__.ts',
      'src/providers/__probe__.ts',
      'src/providers/credentials/__probe__.ts',
      'src/storage/__probe__.ts',
      'src/audio/__probe__.ts',
      'src/platforms/meet/__probe__.ts',
      'src/entrypoints/background/__probe__.ts',
      'src/entrypoints/offscreen/__probe__.ts',
      'src/entrypoints/sidepanel/__probe__.ts',
      'src/entrypoints/meet.content/__probe__.ts',
      'spikes/__probe__.ts',
    ].flatMap((path) => imports.map((code) => [path, code] as const)),
  )('%s may not: %s', async (path, code) => {
    expect(await ruleIds(path, code)).toContain('no-restricted-imports');
  });

  it.each(imports)('src/providers/chat may: %s', async (code) => {
    expect(await ruleIds('src/providers/chat/__probe__.ts', code)).toEqual([]);
  });

  it('src/providers/chat still may not import the Meet layer', async () => {
    const code = 'import * as meet from "@/platforms/meet/locators";\nexport const m = meet;\n';
    expect(await ruleIds('src/providers/chat/__probe__.ts', code)).toContain('no-restricted-imports');
  });
});

// 013 T050 (decision 72, SC-006, constitution II): kept caption text is for the download only. Ask, naming and the
// transcript model cannot even import the folder that holds it.
describe('lint boundary: who may import src/core/captions', () => {
  const imports = [
    'import type { StoredCaptionTurn } from "../captions/model";\nexport type T = StoredCaptionTurn;\n',
    'import { CaptionLog } from "../captions/caption-log";\nexport const c = CaptionLog;\n',
    'import { CaptionLog } from "@/core/captions/caption-log";\nexport const c = CaptionLog;\n',
    'import * as captions from "../captions";\nexport const c = captions;\n',
  ];

  it.each(['src/core/chat/__probe__.ts', 'src/core/speakers/__probe__.ts', 'src/core/transcript/__probe__.ts'])(
    '%s may not',
    async (path) => {
      for (const code of imports) expect(await ruleIds(path, code)).toContain('no-restricted-imports');
    },
  );

  it.each([
    'src/core/session/__probe__.ts',
    'src/core/export/__probe__.ts',
    'src/core/captions/__probe__.ts',
    'src/storage/__probe__.ts',
  ])('%s may', async (path) => {
    for (const code of imports) expect(await ruleIds(path, code)).toEqual([]);
  });

  it('the three folders keep every other core boundary', async () => {
    for (const path of [
      'src/core/chat/__probe__.ts',
      'src/core/speakers/__probe__.ts',
      'src/core/transcript/__probe__.ts',
    ]) {
      expect(await ruleIds(path, 'import { openDB } from "idb";\nexport const o = openDB;\n')).toContain(
        'no-restricted-imports',
      );
      expect(await ruleIds(path, 'import * as r from "../../storage/meeting-repo";\nexport const x = r;\n')).toContain(
        'no-restricted-imports',
      );
      expect(await ruleIds(path, 'import * as m from "@/platforms/meet/locators";\nexport const x = m;\n')).toContain(
        'no-restricted-imports',
      );
      expect(await ruleIds(path, 'export const id = chrome.runtime.id;\n')).toContain('no-restricted-globals');
      expect(
        await ruleIds(path, 'import { normaliseName } from "../transcript/labels";\nexport const n = normaliseName;\n'),
      ).toEqual([]);
    }
  });
});
