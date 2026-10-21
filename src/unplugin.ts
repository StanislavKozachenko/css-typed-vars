import { createUnplugin } from 'unplugin';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { scanCss, scanUsage, type ScannedCss } from './scanner.js';
import { generateJs, generateDeclaration, warnOnCollisions, type NamingConvention, type GeneratorOptions } from './generator.js';
import { assertPruneCompatible, partitionUnused } from './prune.js';

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
  /** Prune generated vars with no detected `cssVars.<key>` (or `cssVars.<group>.<key>`) usage. Requires `usage`. */
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
  assertPruneCompatible(options);

  let cachedScan: Promise<ScannedCss> | null = null;

  const scan = () => scanCss(options.input, options.exclude, options.selectors);

  // When `prune` is set, drops names with no detected `cssVars.<key>` usage
  // (warning about it). A no-op otherwise.
  const applyPrune = async (names: string[]): Promise<string[]> => {
    if (!options.prune) return names;
    const usage = await scanUsage(options.usage!, options.usageExclude);
    const { used, unused } = partitionUnused(names, usage, options);
    if (unused.length > 0) {
      console.warn(`css-typed-vars: pruned ${unused.length} unused variable(s): ${unused.join(', ')}`);
    }
    return used;
  };

  const generatorOptions = ({ declarations, properties }: ScannedCss): GeneratorOptions => ({
    prefix: options.prefix,
    naming: options.naming,
    declarations,
    group: options.group,
    properties,
  });

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
          const scanned = await scanPromise;
          if (myGeneration !== generation) return;
          const names = await resolveNames(scanned.declarations);
          if (myGeneration !== generation) return;

          const dtsPath = getDtsPath(options);
          if (dtsPath) {
            const content = generateDeclaration(names, generatorOptions(scanned));
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
      const scanned = await cachedScan;
      const names = await resolveNames(scanned.declarations);
      const dtsPath = getDtsPath(options);
      if (!dtsPath) return;
      await writeFile(dtsPath, generateDeclaration(names, generatorOptions(scanned)), 'utf8');
    },

    resolveId(id: string) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },

    async load(id: string) {
      if (id === RESOLVED_ID) {
        const scanned = await (cachedScan ?? scan());
        const names = await applyPrune([...scanned.declarations.keys()].sort());
        return generateJs(names, generatorOptions(scanned));
      }
    },
  };
});
