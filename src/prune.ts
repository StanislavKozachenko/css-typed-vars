import { computeKeyPath, type NamingConvention } from './generator.js';
import type { CssVarsUsage } from './scanner.js';

export function assertPruneCompatible(options: { prune?: boolean; usage?: string | string[] }): void {
  if (options.prune && !options.usage) {
    throw new Error('css-typed-vars: "prune" requires "usage" (glob(s) of source files to scan).');
  }
}

interface KeyOptions {
  prefix?: string;
  naming?: NamingConvention;
  group?: boolean;
}

// A flat key counts as used on any access to it. A grouped leaf counts as used
// when accessed directly (`cssVars.color.primary`) or when its whole group is
// referenced (`cssVars.color`), since the group object may be used as a whole.
function isUsed(name: string, usage: CssVarsUsage, options: KeyOptions): boolean {
  const [key, leaf] = computeKeyPath(name, options.prefix, options.naming, options.group);
  if (leaf === undefined) return usage.keys.has(key);
  return usage.wholeKeys.has(key) || usage.paths.has(`${key}\0${leaf}`);
}

// Splits names into those with detected usage and those without, for a caller
// to prune and warn/report with.
export function partitionUnused(
  names: string[],
  usage: CssVarsUsage,
  options: KeyOptions,
): { used: string[]; unused: string[] } {
  const used: string[] = [];
  const unused: string[] = [];
  for (const name of names) {
    (isUsed(name, usage, options) ? used : unused).push(name);
  }
  return { used, unused };
}
