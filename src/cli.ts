#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { watch } from 'chokidar';
import { scanVarNames } from './scanner.js';
import { generateCode } from './generator.js';

const args = process.argv.slice(2);
const getArg = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};
const watchMode = args.includes('--watch');

interface Config {
  input?: string | string[];
  output?: string;
}

async function loadConfig(): Promise<Config> {
  const candidates = [
    'css-typed-vars.config.js',
    'css-typed-vars.config.mjs',
    'css-typed-vars.config.json',
  ];
  for (const file of candidates) {
    const path = resolve(process.cwd(), file);
    try {
      if (file.endsWith('.json')) {
        const content = await readFile(path, 'utf8');
        return JSON.parse(content) as Config;
      } else {
        const mod = await import(pathToFileURL(path).href) as { default: Config };
        return mod.default;
      }
    } catch {
      // file not found or parse error — try next
    }
  }
  return {};
}

async function run(input: string | string[], output: string): Promise<void> {
  const names = await scanVarNames(input);
  const code = generateCode(names);
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(output, code, 'utf8');
  console.log(`Generated ${names.length} variables → ${output}`);
}

async function main(): Promise<void> {
  const config = await loadConfig();
  const input = getArg('--input') ?? config.input;
  const output = getArg('--output') ?? config.output;

  if (!input || !output) {
    console.error('Usage: css-typed-vars --input <glob> --output <file> [--watch]');
    console.error('Or add a css-typed-vars.config.js file with input and output fields.');
    process.exit(1);
  }

  await run(input, output);

  if (watchMode) {
    const patterns = Array.isArray(input) ? input : [input];
    watch(patterns).on('change', (file) => {
      console.log(`Changed: ${file}`);
      run(input, output).catch(console.error);
    });
    console.log('Watching for changes...');
  }
}

main().catch(console.error);
