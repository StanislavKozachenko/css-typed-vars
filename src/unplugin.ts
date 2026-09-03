import { createUnplugin } from 'unplugin';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { scanVarNames } from './scanner.js';
import { generateJs, generateDeclaration, warnOnCollisions, type NamingConvention } from './generator.js';

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
  let cachedNames: Promise<string[]> | null = null;

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
          const namesPromise = scanVarNames(options.input, options.exclude, options.selectors);
          cachedNames = namesPromise;
          const names = await namesPromise;
          if (myGeneration !== generation) return;
          warnOnCollisions(names, options.prefix, options.naming);

          const dtsPath = getDtsPath(options);
          if (dtsPath) {
            const content = generateDeclaration(names, options.prefix, options.naming);
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
      cachedNames = scanVarNames(options.input, options.exclude, options.selectors);
      const names = await cachedNames;
      warnOnCollisions(names, options.prefix, options.naming);
      const dtsPath = getDtsPath(options);
      if (!dtsPath) return;
      await writeFile(dtsPath, generateDeclaration(names, options.prefix, options.naming), 'utf8');
    },

    resolveId(id: string) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },

    async load(id: string) {
      if (id === RESOLVED_ID) {
        const names = await (cachedNames ?? scanVarNames(options.input, options.exclude, options.selectors));
        return generateJs(names, options.prefix, options.naming);
      }
    },
  };
});
