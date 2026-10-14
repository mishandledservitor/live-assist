// 006 copy scanner (research R5): collects the user-facing text a source file can show — string literals, template
// pieces and JSX text, never comments or identifiers — so the copy-review fixture can be checked at the literal.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export interface CopyEntry {
  id: string;
  enabled: boolean;
  /** Checked on the rendered DOM, not by the text scan. */
  dom?: boolean;
  absent: string[];
  present: string[];
}

export interface CopyFixture {
  entries: CopyEntry[];
}

const ENTITIES: Record<string, string> = {
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&lsquo;': '‘',
  '&rsquo;': '’',
  '&apos;': "'",
  '&quot;': '"',
  '&amp;': '&',
  '&nbsp;': ' ',
  '&hellip;': '…',
};

const decode = (text: string) => text.replace(/&[a-z]+;/g, (e) => ENTITIES[e] ?? e);
/** JSX text and HTML text wrap across source lines; what the user sees has single spaces. */
const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Every string the user could see from one TypeScript/TSX source text. */
export function collectStrings(source: string, fileName = 'source.tsx'): string[] {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, kind);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    )
      out.push(node.text);
    else if (ts.isJsxText(node)) {
      const text = collapse(decode(node.text));
      if (text !== '') out.push(text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

/** The visible text of an HTML file (tags, comments and attributes other than title/alt/aria-label dropped). */
export function collectHtmlStrings(html: string): string[] {
  const out: string[] = [];
  const noComments = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  for (const m of noComments.matchAll(/\s(?:title|alt|aria-label)="([^"]*)"/g)) out.push(decode(m[1] ?? ''));
  for (const piece of noComments.split(/<[^>]*>/)) {
    const text = collapse(decode(piece));
    if (text !== '') out.push(text);
  }
  return out;
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/** All user-facing strings in `src/` (minus the dev-only spike recorder) and `wxt.config.ts`, by file. */
export function collectProjectStrings(root: string): Map<string, string[]> {
  const byFile = new Map<string, string[]>();
  const files = filesUnder(join(root, 'src')).filter((f) => !f.includes(join('entrypoints', 'spike-recorder')));
  for (const f of [...files, join(root, 'wxt.config.ts')]) {
    const text = readFileSync(f, 'utf8');
    if (/\.tsx?$/.test(f)) byFile.set(f, collectStrings(text, f));
    else if (f.endsWith('.html')) byFile.set(f, collectHtmlStrings(text));
  }
  return byFile;
}

/** Problems for one entry against the collected strings: absent fragments found, present fragments missing. */
export function checkEntry(entry: CopyEntry, byFile: Map<string, string[]>): string[] {
  const problems: string[] = [];
  for (const fragment of entry.absent) {
    for (const [file, strings] of byFile) {
      if (strings.some((s) => s.includes(fragment))) problems.push(`${entry.id}: "${fragment}" still in ${file}`);
    }
  }
  for (const fragment of entry.present) {
    const found = [...byFile.values()].some((strings) => strings.some((s) => s.includes(fragment)));
    if (!found) problems.push(`${entry.id}: "${fragment}" not found`);
  }
  return problems;
}

export function loadCopyFixture(root: string): CopyFixture {
  return JSON.parse(readFileSync(join(root, 'tests/fixtures/copy/copy-review.json'), 'utf8')) as CopyFixture;
}
