import { createUnplugin } from 'unplugin';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { scanVarNames } from './scanner.js';
import { generateJs, generateDeclaration } from './generator.js';

export interface Options {
  input: string | string[];
  /**
   * Where to write the TypeScript declaration file for `css-typed-vars/vars`.
   * - `undefined` (default): write to the package's own dist directory inside node_modules
   * - `string`: write to the specified path relative to project root
   * - `false`: skip writing
   */
  dts?: string | false;
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

export default createUnplugin((options: Options) => ({
  name: 'css-typed-vars',

  vite: {
    enforce: 'pre' as const,

    configureServer(server: any) {
      server.watcher.on('change', async (file: string) => {
        if (!/\.(css|scss|less)$/i.test(file)) return;

        const names = await scanVarNames(options.input);

        const dtsPath = getDtsPath(options);
        if (dtsPath) {
          await writeFile(dtsPath, generateDeclaration(names), 'utf8');
        }

        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        }
      });
    },
  },

  async buildStart() {
    const dtsPath = getDtsPath(options);
    if (!dtsPath) return;
    const names = await scanVarNames(options.input);
    await writeFile(dtsPath, generateDeclaration(names), 'utf8');
  },

  resolveId(id: string) {
    if (id === VIRTUAL_ID) return RESOLVED_ID;
  },

  async load(id: string) {
    if (id === RESOLVED_ID) {
      const names = await scanVarNames(options.input);
      return generateJs(names);
    }
  },
}));
