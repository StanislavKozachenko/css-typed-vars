# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.4.11] - 2026-08-03

### Fixed

- convert hyphenated prefix through the same case conversion as var names
- brace-depth-aware block extraction for nested rules and quoted braces

---


## [0.4.10] - 2026-07-29

### Fixed

- do not treat // in http(s):// URLs as a comment start

---


## [0.4.9] - 2026-07-20

### Fixed

- support --flag=value syntax
- warn on duplicate keys after naming collision

---


## [0.4.8] - 2026-06-29

### Fixed

- validate --naming value and exit with error on invalid input
- collapse consecutive dashes in camelCase and snake naming

### Changed

- use pull_request condition and cleaner check logic
- split into two jobs, skip changelog check on version bump push

---


## [0.4.7] - 2026-06-29

### Changed

- add release readiness guard to CI and release workflow
- push version bump directly to main in release workflow

---


## [0.4.6] - 2026-06-25

### Fixed

- avoid redundant scan in configureServer watch handler
- warn on malformed config file instead of silently ignoring it

---


## [0.4.5] - 2026-06-08

### Fixed

- support multiple --input flags

### Changed

- fix --selector flag description in README
- update CHANGELOG for v0.4.4
- add fetch-depth: 0 to release checkout for CHANGELOG generation

---


## [0.4.4] - 2026-06-05

### Fixed

- Generator now prefixes keys that start with a digit with `_` (e.g. `--1st-color` → `_1stColor`) — previously generated invalid JS identifiers
- CLI `--exclude` flag now collects all occurrences; `--exclude "**/a/**" --exclude "**/b/**"` previously dropped all but the first

### Changed

- Release workflow now includes `refactor`, `perf`, `docs`, and `ci` commits in CHANGELOG under `### Changed`

---


## [0.4.3] - 2026-06-01

### Fixed

- Vite plugin now reacts to `add` and `unlink` watcher events — adding or deleting a CSS file in dev server no longer requires a manual restart
- Vite plugin no longer runs two full file-system scans per build — `buildStart` and `load` now share a cached `scanVarNames` result

---

## [0.4.2] - 2026-05-08

### Fixed

- `scanVarNames` now returns variables in stable alphabetical order — previously `Promise.all` over multiple files produced non-deterministic results, causing unnecessary diffs in generated output on re-runs
- CLI `--selector` flag now collects all occurrences; previously only the first value was used, making `--selector .dark --selector .light` silently drop all but the first

---

## [0.4.1] - 2026-04-27

### Changed

- Release workflow switched from auto-trigger on push to `main` to manual `workflow_dispatch` with `patch` / `minor` / `major` input; the workflow now runs typecheck and tests before publishing and opens a version-bump PR automatically

---

## [0.4.0] - 2026-04-25

### Added

- `selectors` option for `generate()`, `scanVarNames()`, plugin, and CLI — scans CSS custom properties from arbitrary selectors (e.g. `.dark`, `[data-theme="dark"]`) in addition to `:root`
- `--selector <selector>` CLI flag (repeatable); `selectors: string[]` in config file

---

## [0.3.1] - 2026-04-25

### Added

- `--version` / `-v` CLI flag — prints the package version and exits
- Watch mode now reacts to `add` and `unlink` chokidar events in addition to `change`, so adding or deleting a CSS file triggers regeneration

### Fixed

- `generate()` emits a `console.warn` when no CSS custom properties are found, preventing silent empty-object output

---

## [0.3.0] - 2026-04-15

### Added

- `naming` option (`camelCase` | `snake` | `kebab`) for `generate()`, plugin, and CLI `--naming` flag — controls the key format in generated output
- JS output mode: when `output` ends in `.js`, `generate()` writes a plain JS file (no `as const`) alongside a `.d.ts` declaration file

---

## [0.2.0] - 2026-04-15

### Added

- `exclude` option for `generate()`, `scanVarNames()`, plugin, and CLI `--exclude` flag — glob pattern(s) to skip files during scanning
- `prefix` option for `generate()`, plugin, and CLI `--prefix` flag — prepends a string to all generated keys

---

## [0.1.0] - 2026-04-09

### Added

- `parseVarNames(css, selectors?)` — extracts CSS custom property names from `:root` blocks; strips block and SCSS line comments; handles attribute selectors and `@media`-wrapped `:root`
- `scanVarNames(patterns, exclude?, selectors?)` — finds CSS/SCSS/Less files by glob pattern using `fast-glob`, reads each file, and aggregates deduplicated var names
- `generateCode(names, prefix?, naming?)` — generates a typed TypeScript `export const cssVars = { ... } as const` with `CssVarName` type
- `generateJs(names, prefix?, naming?)` — plain JS variant without `as const`
- `generateDeclaration(names, prefix?, naming?)` — `.d.ts` declaration file for the virtual module
- `generate(options)` — programmatic API that scans and writes the output file in one call
- CLI entry point (`css-typed-vars`) with `--input`, `--output`, `--exclude`, `--prefix`, `--naming`, `--selector`, `--watch`, `--version` flags; supports `css-typed-vars.config.js/mjs/json`
- Virtual module plugin for Vite, Rollup, webpack, and esbuild via `unplugin`; supports HMR in Vite dev server
- Config file auto-discovery (`css-typed-vars.config.js`, `.mjs`, `.json`)
