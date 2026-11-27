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

Start the subject with a [Conventional Commits](https://www.conventionalcommits.org/) type, an optional scope, and a short description in the imperative mood and present tense — "add option" not "added option". Keep the subject line under 72 characters. If the change needs explanation, add a blank line and a short paragraph body.

```
feat(parser): add `selectors` option to scan variables outside :root

Extends the parser to accept an array of CSS selectors so that
variables defined in scopes like `:host` or `[data-theme]` are
included in the output.
```

The type isn't cosmetic: the release workflow builds the CHANGELOG from it, using the subject (without the type and scope) as the entry.

| Type | CHANGELOG section |
|---|---|
| `feat` | Added |
| `fix` | Fixed |
| `refactor`, `perf`, `docs`, `ci` | Changed |
| `test`, `chore`, anything else | not listed |

- Write the description so it reads well on its own in the CHANGELOG — the scope is dropped there.
- Split a change by type: the fix, its tests (`test`) and its docs (`docs`) as separate commits.
- The scope is the area touched: `parser`, `generator`, `scanner`, `cli`, `plugin`.
- The `CHANGELOG pre-check` CI job fails a PR when there's no listed commit since the last release, since the next release would have an empty CHANGELOG entry.

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

## Releasing

Releases are cut by a maintainer with the `Release` workflow (Actions → Release → Run workflow), choosing a `patch`, `minor` or `major` bump. It runs the checks, bumps the version, writes the CHANGELOG entry from the commits since the last tag, creates the GitHub release and publishes to npm — don't bump the version or edit `CHANGELOG.md` in a PR.

## License

By contributing you agree that your changes will be licensed under the [MIT License](LICENSE).
