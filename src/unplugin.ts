import { createUnplugin } from 'unplugin';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { scanCss, scanUsedKeys, type ScannedCss } from './scanner.js';
import { generateJs, generateDeclaration, warnOnCollisions, computeKey, type NamingConvention } from './generator.js';

export interface Options {
  input: string | string[];
  /**
   * Where to write the TypeScript declaration file for `css-typed-vars/vars`.
   * - `undefined` (default): write to the package's own dist directory inside node_modules
   * - `string`: write to the specified path relative to project root
   * - `false`: skip writing
   */
  dts?: string | false;
  exclude?: string | string[];
  prefix?: string;
  naming?: NamingConvention;
  selectors?: string[];
  group?: boolean;
  /** Prune generated vars with no detected `cssVars.<key>` usage. Requires `usage`, and can't be combined with `group`. */
  prune?: boolean;
  /** Glob(s) of source files to scan for `cssVars` usage. Required when `prune` is true. */
  usage?: string | string[];
  usageExclude?: string | string[];
}

const VIRTUAL_ID = 'css-typed-vars/vars';
const RESOLVED_ID = '\0css-typed-vars/vars';

// __dirname is injected by tsup (shims: true) for ESM; native in CJS
declare const __dirname: string;

function getDtsPath(options: Options): string | null {
  if (options.dts === false) return null;
  return options.dts
    ? resolve(process.cwd(), options.dts)
    : join(__dirname, 'generated.d.ts');
}

export default createUnplugin((options: Options) => {
  if (options.prune) {
    if (options.group) throw new Error('css-typed-vars: "prune" cannot be combined with "group".');
    if (!options.usage) throw new Error('css-typed-vars: "prune" requires "usage" (glob(s) of source files to scan).');
  }

  let cachedScan: Promise<ScannedCss> | null = null;

  const scan = () => scanCss(options.input, options.exclude, options.selectors);

  // When `prune` is set, drops names with no detected `cssVars.<key>` usage
  // (warning about it). A no-op otherwise.
  const applyPrune = async (names: string[]): Promise<string[]> => {
    if (!options.prune) return names;
    const usedKeys = await scanUsedKeys(options.usage!, options.usageExclude);
    const isUsed = (name: string) => usedKeys.has(computeKey(name, options.prefix, options.naming));
    const unused = names.filter((name) => !isUsed(name));
    if (unused.length > 0) {
      console.warn(`css-typed-vars: pruned ${unused.length} unused variable(s): ${unused.join(', ')}`);
    }
    return names.filter(isUsed);
  };

  // Sorts the scanned names, warns on key collisions, and applies pruning.
  const resolveNames = async (declarations: Map<string, string>): Promise<string[]> => {
    const names = [...declarations.keys()].sort();
    warnOnCollisions(names, options.prefix, options.naming);
    return applyPrune(names);
  };

  return {
    name: 'css-typed-vars',

    vite: {
      enforce: 'pre' as const,

      configureServer(server: any) {
        let generation = 0;
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let writeQueue: Promise<void> = Promise.resolve();

        const rescan = async () => {
          const myGeneration = ++generation;
          const scanPromise = scan();
          cachedScan = scanPromise;
          const { declarations, properties } = await scanPromise;
          if (myGeneration !== generation) return;
          const names = await resolveNames(declarations);
          if (myGeneration !== generation) return;

          const dtsPath = getDtsPath(options);
          if (dtsPath) {
            const content = generateDeclaration(names, options.prefix, options.naming, declarations, options.group, properties);
            // Writes are serialized (not just generation-gated before starting) so a slower
            // write for an older generation can never complete after a newer one's and clobber it.
            writeQueue = writeQueue.then(async () => {
              if (myGeneration !== generation) return;
              await writeFile(dtsPath, content, 'utf8');
            }).catch(console.error);
            await writeQueue;
          }
          if (myGeneration !== generation) return;

          const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
          if (mod) {
            server.moduleGraph.invalidateModule(mod);
            server.ws.send({ type: 'full-reload' });
          }
        };

        const handle = (file: string) => {
          if (!/\.(css|scss|less)$/i.test(file)) return;
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            rescan().catch(console.error);
          }, 100);
        };

        server.watcher.on('change', handle);
        server.watcher.on('add', handle);
        server.watcher.on('unlink', handle);
      },
    },

    async buildStart() {
      cachedScan = scan();
      const { declarations, properties } = await cachedScan;
      const names = await resolveNames(declarations);
      const dtsPath = getDtsPath(options);
      if (!dtsPath) return;
      await writeFile(dtsPath, generateDeclaration(names, options.prefix, options.naming, declarations, options.group, properties), 'utf8');
    },

    resolveId(id: string) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },

    async load(id: string) {
      if (id === RESOLVED_ID) {
        const { declarations, properties } = await (cachedScan ?? scan());
        const names = await applyPrune([...declarations.keys()].sort());
        return generateJs(names, options.prefix, options.naming, declarations, options.group, properties);
      }
    },
  };
});
