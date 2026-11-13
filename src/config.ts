import type { Config } from './index.js';

// Every option a config file can set (also what schema.json describes).
export const CONFIG_KEYS = [
  'input', 'output', 'exclude', 'prefix', 'naming', 'selectors', 'themes',
  'group', 'prune', 'usage', 'usageExclude', 'helpers', 'refsIgnore',
] as const satisfies ReadonlyArray<keyof Config>;

// Fails to compile when `Config` gains an option that CONFIG_KEYS is missing.
type AssertNever<T extends never> = T;
export type AllConfigKeysListed = AssertNever<Exclude<keyof Config, (typeof CONFIG_KEYS)[number]>>;
