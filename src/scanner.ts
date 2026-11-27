import { readFile } from 'node:fs/promises';
import { dirname, posix, relative, resolve } from 'node:path';
import picomatch from 'picomatch';
import { glob } from 'tinyglobby';
import { parseThemedDeclarations, parsePropertyRules, parseVarReferences, parseDeclaredNames, parseSourceVarReferences, parseSourceDeclaredNames, type PropertyRule, type VarDoc, type VarReference } from './parser.js';

function normalizePatterns(patterns: string | string[]): string[] {
  return (Array.isArray(patterns) ? patterns : [patterns]).map((p) => p.replace(/\\/g, '/'));
}

// Orders a glob's matches: a directory's files before its subdirectories',
// each alphabetically — so `styles/tokens.css` comes before `styles/themes/dark.css`.
function comparePaths(a: string, b: string): number {
  const as = a.split('/');
  const bs = b.split('/');
  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    if (as[i] === bs[i]) continue;
    const aIsFile = i === as.length - 1;
    const bIsFile = i === bs.length - 1;
    if (aIsFile !== bIsFile) return aIsFile ? -1 : 1;
    return as[i] < bs[i] ? -1 : 1;
  }
  return as.length - bs.length;
}

// Ignore globs are matched against a path in the same form as the glob that
// found it: relative to the working directory, or absolute for an absolute
// glob — so `**/vendor/**` excludes from `/abs/styles/**/*.css` too.
async function globFiles(pattern: string, ignore: string[]): Promise<string[]> {
  if (!/^(?:[A-Za-z]:)?\//.test(pattern)) {
    return glob(pattern, { absolute: true, ignore, expandDirectories: false });
  }
  // tinyglobby would walk from the working directory and match the absolute
  // glob against real directory names, missing one written through a Windows
  // 8.3 short name (`C:/Users/LONGNA~1/...`, as os.tmpdir() returns): walk
  // from the glob's static base instead, and apply the ignore globs here.
  const { base, glob: rest, isGlob } = picomatch.scan(pattern);
  const [cwd, relativeGlob] = isGlob ? [base, rest] : [posix.dirname(pattern), posix.basename(pattern)];
  const matches = await glob(relativeGlob, { cwd, absolute: true, expandDirectories: false });
  if (ignore.length === 0) return matches;
  const isIgnored = picomatch(ignore, { dot: true });
  return matches.filter((file) => !isIgnored(file));
}

// The files the globs match, absolute, in the order they're read — which
// decides the value that wins for a variable declared in several files: globs
// in the given order (a file matched again by a later glob moves there), and
// each glob's matches ordered by comparePaths. Negated globs (`!vendor/**`)
// exclude files from all of them, like `exclude`.
export async function findFiles(patterns: string | string[], exclude?: string | string[]): Promise<string[]> {
  const normalized = normalizePatterns(patterns);
  const ignore = [
    ...(exclude ? normalizePatterns(exclude) : []),
    ...normalized.filter((p) => p.startsWith('!')).map((p) => p.slice(1)),
  ];
  const perGlob = await Promise.all(normalized.filter((p) => !p.startsWith('!')).map((p) => globFiles(p, ignore)));
  const files = perGlob.flatMap((matches) => matches.sort(comparePaths));
  // Keep each file's last occurrence.
  return [...new Set(files.reverse())].reverse();
}

// Builds a predicate telling whether a file (absolute, or relative to `cwd`)
// is one the given globs would scan — so a watcher can react to exactly the
// files a scan reads. Patterns are relative to `cwd`, like the scans' globs.
export function createFileMatcher(
  patterns: string | string[],
  exclude?: string | string[],
  cwd: string = process.cwd(),
): (file: string) => boolean {
  const compile = (globs: string | string[]) => picomatch(normalizePatterns(globs).map((p) => p.replace(/^\.\//, '')));
  const include = compile(patterns);
  const ignore = exclude ? compile(exclude) : () => false;
  return (file) => {
    const absolute = resolve(cwd, file).replace(/\\/g, '/');
    const fromCwd = relative(cwd, absolute).replace(/\\/g, '/');
    const matches = (test: (path: string) => boolean) => test(fromCwd) || test(absolute);
    return matches(include) && !matches(ignore);
  };
}

export interface WatchRoot {
  /** Absolute directory a glob is rooted at. */
  dir: string;
  /** How many directory levels below `dir` a match can be (0: directly inside), or undefined for any. */
  depth?: number;
}

// The static directory each glob is rooted at (`../shared/**/*.css` -> `../shared`),
// absolute and deduplicated — what a watcher needs to cover to see every file
// the globs can match, without relying on it supporting glob patterns — and
// how deep below it a match can be (`styles/*.css` -> 0, `src/**/*.css` -> any),
// so a watcher doesn't descend into directories that can't hold one (node_modules).
export function globWatchRoots(patterns: string | string[], cwd: string = process.cwd()): WatchRoot[] {
  const roots = new Map<string, number | undefined>();
  for (const pattern of normalizePatterns(patterns)) {
    const { base, glob, isGlob } = picomatch.scan(pattern);
    // A plain file path: watch its directory, so the file is seen even when it's created later.
    const dir = resolve(cwd, isGlob ? base || '.' : dirname(pattern));
    // `**`, or a brace spanning directories (`{a/b,c}`), can match at any depth.
    const depth = !isGlob ? 0 : /\*\*|\{[^}]*\//.test(glob) ? undefined : glob.split('/').length - 1;
    const previous = roots.get(dir);
    const unlimited = (roots.has(dir) && previous === undefined) || depth === undefined;
    roots.set(dir, unlimited ? undefined : Math.max(previous ?? 0, depth));
  }
  return [...roots].map(([dir, depth]) => (depth === undefined ? { dir } : { dir, depth }));
}

export function globBaseDirs(patterns: string | string[], cwd: string = process.cwd()): string[] {
  return globWatchRoots(patterns, cwd).map((root) => root.dir);
}

export interface ScannedCss {
  declarations: Map<string, string>;
  properties: Map<string, PropertyRule>;
  /** Per theme name (from the `themes` option), the values declared for it. Empty without `themes`. */
  themes: Map<string, Map<string, string>>;
  /** `/** ... *\/` doc comments placed directly before a declaration. */
  docs: Map<string, VarDoc>;
  /** Every file the globs matched, absolute — what the scan's result depends on. */
  files: string[];
}

// Every var name found, sorted — base declarations plus any declared only
// inside a theme block.
export function collectVarNames(scanned: ScannedCss): string[] {
  const names = new Set(scanned.declarations.keys());
  for (const values of scanned.themes.values()) {
    for (const name of values.keys()) names.add(name);
  }
  return [...names].sort();
}

// Reads are run concurrently for speed, but merged sequentially in findFiles'
// order, so a name declared in multiple files always resolves to the same
// "last file wins" value regardless of I/O timing. Each
// matched file is read exactly once and parsed for both declarations and
// @property rules, so callers needing both never double up on file I/O.
export async function scanCss(
  patterns: string | string[],
  exclude?: string | string[],
  selectors?: string[],
  themes: Record<string, string> = {},
): Promise<ScannedCss> {
  const files = await findFiles(patterns, exclude);
  const perFile = await Promise.all(
    files.map(async (file) => {
      let css: string;
      try {
        css = await readFile(file, 'utf8');
      } catch (err) {
        console.warn(`css-typed-vars: skipping "${file}": ${(err as Error).message}`);
        return null;
      }
      return { ...parseThemedDeclarations(css, selectors, themes), properties: parsePropertyRules(css) };
    }),
  );
  const declarations = new Map<string, string>();
  const properties = new Map<string, PropertyRule>();
  const themeValues = new Map(Object.keys(themes).map((theme) => [theme, new Map<string, string>()]));
  const docs = new Map<string, VarDoc>();
  for (const result of perFile) {
    if (!result) continue;
    for (const [name, value] of result.declarations) declarations.set(name, value);
    for (const [name, rule] of result.properties) properties.set(name, rule);
    for (const [name, doc] of result.docs) docs.set(name, doc);
    for (const [theme, values] of result.themes) {
      for (const [name, value] of values) themeValues.get(theme)!.set(name, value);
    }
  }
  return { declarations, properties, themes: themeValues, docs, files };
}

export async function scanVarDeclarations(
  patterns: string | string[],
  exclude?: string | string[],
  selectors?: string[],
): Promise<Map<string, string>> {
  return (await scanCss(patterns, exclude, selectors)).declarations;
}

export async function scanVarNames(
  patterns: string | string[],
  exclude?: string | string[],
  selectors?: string[],
): Promise<string[]> {
  const declarations = await scanVarDeclarations(patterns, exclude, selectors);
  return [...declarations.keys()].sort();
}

// Matches `cssVars.foo` (dot access) and `cssVars['foo']`/`cssVars["foo"]` (bracket
// access) in source text, also through a renamed import in the same file
// (`import { cssVars as vars } ...` -> `vars.foo`), optional chaining
// (`cssVars?.foo`) and destructuring (`const { foo } = cssVars`). Textual, not AST-based — like
// the rest of this scanner — so it doesn't distinguish a real reference from one
// inside a comment or string, nor follow a re-export under another name.
const ROOT_RE = /\bcssVars\b/g;
// `import { a, cssVars as vars } from` / `import type { ... } from` / `import def, { ... } from`.
const IMPORT_RE = /\bimport\s+(?:type\s+)?(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s*from\b/g;
const ALIAS_RE = /(?:^|,)\s*(?:type\s+)?cssVars\s+as\s+([A-Za-z_$][\w$]*)\s*(?=,|$)/g;

// `cssVars`, plus any local name it's imported under in this file.
function rootPattern(text: string): RegExp {
  const aliases = new Set<string>();
  for (const [, specifiers] of text.matchAll(IMPORT_RE)) {
    for (const [, alias] of specifiers.matchAll(ALIAS_RE)) aliases.add(alias);
  }
  if (aliases.size === 0) return ROOT_RE;
  // An alias must stand on its own: not part of a longer name, nor a property (`obj.vars`).
  const names = [...aliases].map((alias) => alias.replace(/\$/g, '\\$')).join('|');
  return new RegExp(`${ROOT_RE.source}|(?<![\\w$.])(?:${names})(?![\\w$])`, 'g');
}

// `.key`, `['key']`, or either through optional chaining (`?.key`, `?.['key']`).
const ACCESS_RE = /\s*(?:\??\.\s*([A-Za-z_$][\w$]*)|(?:\?\.\s*)?\[\s*(['"`])((?:(?!\2).)*)\2\s*\])/y;

function readAccess(text: string, from: number): { key: string; end: number } | null {
  ACCESS_RE.lastIndex = from;
  const match = ACCESS_RE.exec(text);
  return match ? { key: match[1] ?? match[3], end: ACCESS_RE.lastIndex } : null;
}

export interface CssVarsUsage {
  /** Every first-level key accessed (`cssVars.<key>`), with or without further access. */
  keys: Set<string>;
  /** First-level keys referenced as a whole, with no second-level access after them. */
  wholeKeys: Set<string>;
  /** Second-level accesses (`cssVars.<key>.<leaf>`), as `[key, leaf]` joined with `\0`. */
  paths: Set<string>;
  /** Every source file the globs matched, absolute. */
  files: string[];
}

// One property of an object pattern: `key`, `key: alias`, `key = fallback` or `'quoted-key': alias`.
const PATTERN_KEY_RE = /^\s*(?:([A-Za-z_$][\w$]*)|(['"`])((?:(?!\2).)*)\2)\s*(?:[:=]|$)/;

// The keys of the object pattern that the expression starting at `at` is
// assigned to: `a` and `b` for the `cssVars` of `const { a, b: alias } = cssVars`.
// Empty when it isn't assigned to one. A nested pattern (`{ color: { primary } }`)
// and a `...rest` element aren't read.
function readPatternKeys(text: string, at: number): string[] {
  let i = at - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  if (text[i] !== '=') return [];
  i--;
  while (i >= 0 && /\s/.test(text[i])) i--;
  if (text[i] !== '}') return [];
  const open = text.lastIndexOf('{', i);
  if (open === -1) return [];
  const body = text.slice(open + 1, i);
  if (body.includes('}')) return [];
  const keys: string[] = [];
  for (const part of body.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').split(',')) {
    const match = PATTERN_KEY_RE.exec(part);
    if (match) keys.push(match[1] ?? match[3]);
  }
  return keys;
}

function extractUsage(text: string, into: CssVarsUsage): void {
  for (const root of text.matchAll(rootPattern(text))) {
    const first = readAccess(text, root.index + root[0].length);
    const second = first && readAccess(text, first.end);
    // Destructured from the object (`const { a } = cssVars`): like `cssVars.a`.
    // From one of its groups (`const { a } = cssVars.color`): like `cssVars.color.a`.
    const destructured = second ? [] : readPatternKeys(text, root.index);
    if (!first) {
      for (const key of destructured) {
        into.keys.add(key);
        into.wholeKeys.add(key);
      }
      continue;
    }
    into.keys.add(first.key);
    if (second) into.paths.add(`${first.key}\0${second.key}`);
    else if (destructured.length > 0) for (const leaf of destructured) into.paths.add(`${first.key}\0${leaf}`);
    else into.wholeKeys.add(first.key);
  }
}

// Scans source files (not CSS) for references to the generated `cssVars` object,
// one and two levels deep (the latter for grouped output). Backs the
// `prune`/`pruneCheck` unused-variable features.
export async function scanUsage(patterns: string | string[], exclude?: string | string[]): Promise<CssVarsUsage> {
  const files = await findFiles(patterns, exclude);
  const usage: CssVarsUsage = { keys: new Set(), wholeKeys: new Set(), paths: new Set(), files };
  const texts = await Promise.all(
    files.map(async (file) => {
      try {
        return await readFile(file, 'utf8');
      } catch (err) {
        console.warn(`css-typed-vars: skipping "${file}": ${(err as Error).message}`);
        return '';
      }
    }),
  );
  for (const text of texts) extractUsage(text, usage);
  return usage;
}


export interface FileReference extends VarReference {
  file: string;
}

// Reads every matched CSS file once, returning all `var()` references (with
// their file) and every custom property name declared across the files. With
// `source`, the files are source code (TS/JSX, Vue, HTML, ...) instead, read
// with parseSourceVarReferences / parseSourceDeclaredNames.
export async function scanReferences(
  patterns: string | string[],
  exclude?: string | string[],
  source = false,
): Promise<{ references: FileReference[]; declared: Set<string> }> {
  const parseReferences = source ? parseSourceVarReferences : parseVarReferences;
  const parseDeclared = source ? parseSourceDeclaredNames : parseDeclaredNames;
  const files = (await findFiles(patterns, exclude)).sort();
  const perFile = await Promise.all(
    files.map(async (file) => {
      try {
        return { file, css: await readFile(file, 'utf8') };
      } catch (err) {
        console.warn(`css-typed-vars: skipping "${file}": ${(err as Error).message}`);
        return null;
      }
    }),
  );
  const references: FileReference[] = [];
  const declared = new Set<string>();
  for (const result of perFile) {
    if (!result) continue;
    for (const ref of parseReferences(result.css)) references.push({ ...ref, file: result.file });
    for (const name of parseDeclared(result.css)) declared.add(name);
  }
  return { references, declared };
}

// The set of first-level keys found to be in use.
export async function scanUsedKeys(patterns: string | string[], exclude?: string | string[]): Promise<Set<string>> {
  return (await scanUsage(patterns, exclude)).keys;
}
