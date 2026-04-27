# Contributing

## Prerequisites

- Node.js 24+
- npm

## Setup

```sh
git clone https://github.com/StanislavKozachenko/css-typed-vars.git
cd css-typed-vars
npm install
```

## Development scripts

| Command | Description |
|---|---|
| `npm run typecheck` | TypeScript type checking |
| `npm test` | Run unit tests (vitest) |
| `npm run build` | Build ESM + CJS bundles (tsup) |

Always run all three before submitting a PR — CI checks them in sequence.

## Testing changes manually

- **Parser / Generator** — unit tests cover these; run `npm test`
- **CLI** — build first (`npm run build`), then run `node dist/cli.js --input "src/**/*.css" --output cssVars.ts` in a project with CSS files
- **Bundler plugin** — build and add the package as a `file:` dependency (`npm install file:../css-typed-vars`) in a Vite/webpack/Rollup project to verify the virtual module and watch mode work end to end
- **Cross-platform** — if your change touches file paths or glob patterns, test on both Windows and Linux/macOS (or WSL)

## Commit messages

Use the imperative mood and present tense — "Add option" not "Added option". Keep the subject line under 72 characters. If the change needs explanation, add a blank line and a short paragraph body.

```
Add `selectors` option to scan variables outside :root

Extends the parser to accept an array of CSS selectors so that
variables defined in scopes like `:host` or `[data-theme]` are
included in the output.
```

No Conventional Commits prefix is required.

## Submitting issues

Use the title format `Area: short description` (e.g. `CLI: --watch misses renamed files`).

- Label `bug` for broken behaviour
- Label `enhancement` for new features or improvements
- Label `documentation` for docs-only changes

## Submitting pull requests

1. Open an issue first for non-trivial changes.
2. Create a branch from `main` with a descriptive name (`add-selectors`, `fix-watch-unlink`).
3. Make sure `npm run typecheck && npm test && npm run build` all pass.
4. Open a PR with the title `[Area] Description` and fill the body:
   - One sentence describing what the PR does
   - `Key changes:` bullet list — file path and what changed
   - `Closes #N`
5. PRs require passing CI to be merged.

## License

By contributing you agree that your changes will be licensed under the [MIT License](LICENSE).
