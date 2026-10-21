import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { scanCss, scanVarDeclarations, scanUsage } from './scanner.js';
import { generateCode, generateJs, generateDeclaration, warnOnCollisions, type NamingConvention, type GeneratorOptions } from './generator.js';
import { assertPruneCompatible, partitionUnused } from './prune.js';

export { parseVarNames, parseVarDeclarations, parsePropertyRules, type PropertyRule } from './parser.js';
export { generateCode, generateJs, generateDeclaration } from './generator.js';
export { scanVarNames, scanVarDeclarations, scanCss, scanUsedKeys } from './scanner.js';
export type { NamingConvention, GeneratorOptions } from './generator.js';

export interface GenerateOptions {
  input: string | string[];
  output: string;
  exclude?: string | string[];
  prefix?: string;
  naming?: NamingConvention;
  selectors?: string[];
  group?: boolean;
  /** Prune generated vars with no detected `cssVars.<key>` (or `cssVars.<group>.<key>`) usage. Requires `usage`. */
  prune?: boolean;
  /** Glob(s) of source files to scan for `cssVars` usage. Required when `prune` is true, or when calling `findUnusedVars`. */
  usage?: string | string[];
  usageExclude?: string | string[];
  /** Also emit the `CssVarRef` type and `getCssVar`/`setCssVar` runtime helpers. */
  helpers?: boolean;
}

// Reports CSS variables with no detected `cssVars.<key>` usage in the given
// source files, without writing or pruning anything. Backs `--prune-check`.
export async function findUnusedVars(
  options: Pick<GenerateOptions, 'input' | 'exclude' | 'selectors' | 'prefix' | 'naming' | 'group' | 'usage' | 'usageExclude'>,
): Promise<string[]> {
  if (!options.usage) throw new Error('css-typed-vars: findUnusedVars requires "usage" (glob(s) of source files to scan).');
  const [declarations, usage] = await Promise.all([
    scanVarDeclarations(options.input, options.exclude, options.selectors),
    scanUsage(options.usage, options.usageExclude),
  ]);
  const names = [...declarations.keys()].sort();
  return partitionUnused(names, usage, options).unused;
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
    const usage = await scanUsage(options.usage!, options.usageExclude);
    const { used, unused } = partitionUnused(names, usage, options);
    if (unused.length > 0) {
      console.warn(`css-typed-vars: pruned ${unused.length} unused variable(s): ${unused.join(', ')}`);
    }
    names = used;
  }

  const outPath = resolve(options.output);
  const generatorOptions: GeneratorOptions = {
    prefix: options.prefix,
    naming: options.naming,
    declarations,
    group: options.group,
    properties,
    helpers: options.helpers,
  };

  const jsExtMatch = /\.(m|c)?js$/i.exec(options.output);
  if (jsExtMatch) {
    const content = generateJs(names, generatorOptions);
    const dtsPath = outPath.slice(0, -jsExtMatch[0].length) + '.d.ts';
    const dtsContent = generateDeclaration(names, generatorOptions);
    return { outPath, content, dtsPath, dtsContent };
  }
  return { outPath, content: generateCode(names, generatorOptions) };
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
