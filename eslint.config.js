// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Browser/extension surfaces that src/core must never touch (plan: core runs in plain Node Vitest).
const CORE_FORBIDDEN_GLOBALS = [
  'chrome',
  'browser',
  'window',
  'document',
  'navigator',
  'indexedDB',
  'localStorage',
  'AudioContext',
  'WebSocket',
  'fetch',
].map((name) => ({ name, message: 'src/core is platform-free: inject this dependency instead.' }));

// The Meet DOM layer (002 plan): it reads the page, so it may use the DOM, but it never talks to the extension, the
// network or storage itself — the content-script entrypoint wires it to chrome.runtime.
const PLATFORMS_FORBIDDEN_GLOBALS = ['chrome', 'browser', 'WebSocket', 'fetch'].map((name) => ({
  name,
  message: 'src/platforms reads the page only: the meet.content entrypoint does the messaging.',
}));

// Only src/entrypoints/meet.content may import the platform DOM layer.
const PLATFORMS_IMPORT = {
  group: ['**/platforms', '**/platforms/**'],
  message: 'Only src/entrypoints/meet.content may import src/platforms (core reaches Meet through the bridge).',
};

// 003 (research R2, constitution V): only the chat adapters in src/providers/chat may import the vendor SDKs.
const CHAT_SDK_IMPORT = {
  group: ['@anthropic-ai/sdk', '@anthropic-ai/sdk/*', 'openai', 'openai/*'],
  message: 'Only src/providers/chat may import a chat SDK: go through the ChatProvider contract (003 research R2).',
};

// 013 (decision 72, SC-006, constitution II): kept caption text is for the download only.
const CAPTIONS_IMPORT = {
  group: ['**/captions', '**/captions/**'],
  message: "Ask, naming and the transcript model never see Meet's kept captions: do not import src/core/captions here.",
};

// What nothing in src/core may import.
const CORE_IMPORT_PATTERNS = [
  {
    group: ['wxt', 'wxt/*', '@wxt-dev/*', 'react', 'react-dom', 'react-dom/*', 'idb'],
    message: 'src/core is platform-free: no extension, DOM or storage modules.',
  },
  {
    group: ['**/entrypoints/**', '**/storage/**', '**/audio/**', '**/providers/**'],
    message: 'src/core must not depend on outer layers.',
  },
  PLATFORMS_IMPORT,
  CHAT_SDK_IMPORT,
];

export default tseslint.config(
  {
    ignores: [
      '.output/**',
      '.wxt/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'spikes/data/**',
      '.codegraph/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Playwright fixtures use a `use` callback that is not a React hook.
    files: ['src/**/*.{ts,tsx}', 'tests/unit/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Logging goes through src/core/log.ts, which redacts secrets and drops audio (T090, FR-003).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/core/log.ts'],
    rules: { 'no-console': 'error' },
  },
  {
    // Files no later block restricts (e.g. the Meet content script, spikes) still may not import a chat SDK.
    files: ['src/**/*.{ts,tsx}', 'spikes/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [CHAT_SDK_IMPORT] }] },
  },
  {
    files: ['src/core/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: CORE_IMPORT_PATTERNS }],
      'no-restricted-globals': ['error', ...CORE_FORBIDDEN_GLOBALS],
    },
  },
  {
    // The core rules again (a later block replaces the rule, it does not add to it), plus the captions folder.
    files: ['src/core/chat/**', 'src/core/speakers/**', 'src/core/transcript/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [...CORE_IMPORT_PATTERNS, CAPTIONS_IMPORT] }] },
  },
  {
    files: ['src/providers/**', 'src/storage/**', 'src/audio/**', 'src/entrypoints/**'],
    ignores: ['src/entrypoints/meet.content/**', 'src/entrypoints/sidepanel/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [PLATFORMS_IMPORT, CHAT_SDK_IMPORT] }] },
  },
  {
    // The one place the chat SDKs are allowed (003 research R2).
    files: ['src/providers/chat/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [PLATFORMS_IMPORT] }] },
  },
  {
    // Red-team 2026-10-08 (001 FR-003a): the side panel never reads the API key, so it may not import the full store.
    files: ['src/entrypoints/sidepanel/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            PLATFORMS_IMPORT,
            CHAT_SDK_IMPORT,
            {
              group: ['**/storage/settings-store', '@/storage/settings-store'],
              message: 'The side panel never reads the key: use storage/panel-settings-store (001 FR-003a).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/platforms/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['idb'], message: 'src/platforms reads the page only: no storage.' },
            {
              group: [
                'wxt',
                'wxt/*',
                '@wxt-dev/*',
                '**/entrypoints/**',
                '**/storage/**',
                '**/audio/**',
                '**/providers/**',
              ],
              message: 'src/platforms depends on src/core only.',
            },
            CHAT_SDK_IMPORT,
          ],
        },
      ],
      'no-restricted-globals': ['error', ...PLATFORMS_FORBIDDEN_GLOBALS],
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
