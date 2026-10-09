import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { scanCss, scanVarDeclarations, scanUsedKeys } from './scanner.js';
import { generateCode, generateJs, generateDeclaration, warnOnCollisions, computeKey, type NamingConvention } from './generator.js';

export { parseVarNames, parseVarDeclarations, parsePropertyRules, type PropertyRule } from './parser.js';
export { generateCode, generateJs, generateDeclaration } from './generator.js';
export { scanVarNames, scanVarDeclarations, scanCss, scanUsedKeys } from './scanner.js';
export type { NamingConvention } from './generator.js';

export interface GenerateOptions {
  input: string | string[];
  output: string;
  exclude?: string | string[];
  prefix?: string;
  naming?: NamingConvention;
  selectors?: string[];
  group?: boolean;
  /** Prune generated vars with no detected `cssVars.<key>` usage. Requires `usage`, and can't be combined with `group`. */
  prune?: boolean;
  /** Glob(s) of source files to scan for `cssVars` usage. Required when `prune` is true, or when calling `findUnusedVars`. */
  usage?: string | string[];
  usageExclude?: string | string[];
}

function assertPruneCompatible(options: Pick<GenerateOptions, 'prune' | 'group' | 'usage'>): void {
  if (!options.prune) return;
  if (options.group) throw new Error('css-typed-vars: "prune" cannot be combined with "group".');
  if (!options.usage) throw new Error('css-typed-vars: "prune" requires "usage" (glob(s) of source files to scan).');
}

// Drops names whose computed key has no detected usage, returning what's left
// plus the dropped names (for a caller to warn/report with).
function partitionUnused(
  names: string[],
  usedKeys: Set<string>,
  prefix: string | undefined,
  naming: NamingConvention | undefined,
): { used: string[]; unused: string[] } {
  const used: string[] = [];
  const unused: string[] = [];
  for (const name of names) {
    (usedKeys.has(computeKey(name, prefix, naming)) ? used : unused).push(name);
  }
  return { used, unused };
}

// Reports CSS variables with no detected `cssVars.<key>` usage in the given
// source files, without writing or pruning anything. Backs `--prune-check`.
export async function findUnusedVars(
  options: Pick<GenerateOptions, 'input' | 'exclude' | 'selectors' | 'prefix' | 'naming' | 'usage' | 'usageExclude'>,
): Promise<string[]> {
  if (!options.usage) throw new Error('css-typed-vars: findUnusedVars requires "usage" (glob(s) of source files to scan).');
  const [declarations, usedKeys] = await Promise.all([
    scanVarDeclarations(options.input, options.exclude, options.selectors),
    scanUsedKeys(options.usage, options.usageExclude),
  ]);
  const names = [...declarations.keys()].sort();
  return partitionUnused(names, usedKeys, options.prefix, options.naming).unused;
}

interface ComputedOutput {
  outPath: string;
  content: string;
  dtsPath?: string;
  dtsContent?: string;
}

async function computeOutputs(options: GenerateOptions): Promise<ComputedOutput> {
  assertPruneCompatible(options);
  const { declarations, properties } = await scanCss(options.input, options.exclude, options.selectors);
  let names = [...declarations.keys()].sort();
  if (names.length === 0) {
    console.warn('css-typed-vars: no CSS custom properties found.');
  }
  warnOnCollisions(names, options.prefix, options.naming);

  if (options.prune) {
    const usedKeys = await scanUsedKeys(options.usage!, options.usageExclude);
    const { used, unused } = partitionUnused(names, usedKeys, options.prefix, options.naming);
    if (unused.length > 0) {
      console.warn(`css-typed-vars: pruned ${unused.length} unused variable(s): ${unused.join(', ')}`);
    }
    names = used;
  }

  const outPath = resolve(options.output);

  const jsExtMatch = /\.(m|c)?js$/i.exec(options.output);
  if (jsExtMatch) {
    const content = generateJs(names, options.prefix, options.naming, declarations, options.group, properties);
    const dtsPath = outPath.slice(0, -jsExtMatch[0].length) + '.d.ts';
    const dtsContent = generateDeclaration(names, options.prefix, options.naming, declarations, options.group, properties);
    return { outPath, content, dtsPath, dtsContent };
  }
  return { outPath, content: generateCode(names, options.prefix, options.naming, declarations, options.group, properties) };
}

export async function generate(options: GenerateOptions): Promise<void> {
  const { outPath, content, dtsPath, dtsContent } = await computeOutputs(options);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, content, 'utf8');
  if (dtsPath && dtsContent !== undefined) {
    await writeFile(dtsPath, dtsContent, 'utf8');
  }
}

// Computes the output in-memory and compares it against what's already on
// disk, without writing. Returns true when everything is up to date.
export async function checkGenerated(options: GenerateOptions): Promise<boolean> {
  const { outPath, content, dtsPath, dtsContent } = await computeOutputs(options);
  const current = await readFile(outPath, 'utf8').catch(() => null);
  if (current !== content) return false;
  if (dtsPath && dtsContent !== undefined) {
    const currentDts = await readFile(dtsPath, 'utf8').catch(() => null);
    if (currentDts !== dtsContent) return false;
  }
  return true;
}
