import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { scanVarDeclarations } from './scanner.js';
import { generateCode, generateJs, generateDeclaration, warnOnCollisions, type NamingConvention } from './generator.js';

export { parseVarNames, parseVarDeclarations } from './parser.js';
export { generateCode, generateJs, generateDeclaration } from './generator.js';
export { scanVarNames, scanVarDeclarations } from './scanner.js';
export type { NamingConvention } from './generator.js';

export interface GenerateOptions {
  input: string | string[];
  output: string;
  exclude?: string | string[];
  prefix?: string;
  naming?: NamingConvention;
  selectors?: string[];
}

interface ComputedOutput {
  outPath: string;
  content: string;
  dtsPath?: string;
  dtsContent?: string;
}

async function computeOutputs(options: GenerateOptions): Promise<ComputedOutput> {
  const declarations = await scanVarDeclarations(options.input, options.exclude, options.selectors);
  const names = [...declarations.keys()].sort();
  if (names.length === 0) {
    console.warn('css-typed-vars: no CSS custom properties found.');
  }
  warnOnCollisions(names, options.prefix, options.naming);
  const outPath = resolve(options.output);

  const jsExtMatch = /\.(m|c)?js$/i.exec(options.output);
  if (jsExtMatch) {
    const content = generateJs(names, options.prefix, options.naming, declarations);
    const dtsPath = outPath.slice(0, -jsExtMatch[0].length) + '.d.ts';
    const dtsContent = generateDeclaration(names, options.prefix, options.naming, declarations);
    return { outPath, content, dtsPath, dtsContent };
  }
  return { outPath, content: generateCode(names, options.prefix, options.naming, declarations) };
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
