# AGENTS.md

Guidance for AI agents working in this repo. Every item here is something easy to get wrong.

## Toolchain

| Command      | Value                              |
| ------------ | ---------------------------------- |
| Build        | `npm run build`                    |
| Test         | `npm test`                         |
| Lint         | `npm run lint`                     |
| Typecheck    | `npx tsc --noEmit`                 |
| Format fix   | `npx prettier --write "src/**/*.ts"` |

For OpenCode agent/model selection in this repo: **prefer `opencode/*` providers over `github-copilot/*`** when both are available. This is a personal project, so favor OpenCode-hosted models by default.

Work is ad-hoc. Prompts come directly from the user — do not look up or reference any Linear backlog or issue tracker.

## What this repo is

Screeps AI written in TypeScript. Rollup bundles `src/` into a single `dist/main.js` that gets uploaded to a Screeps game server. No monorepo — single flat package.

Screeps API docs: https://docs.screeps.com

## Setup

```bash
npm install
cp screeps.sample.json screeps.json   # then fill in your API token
```

`screeps.json` is gitignored. All `push-*` and `watch-*` commands fail without it. `npm run build` (dry run, no upload) works without it.

Node version is pinned to `v16.17.0` via `.nvmrc` (README says 10/12 — ignore that, use 16).

## Commands

| Task | Command |
|---|---|
| Build only (no upload) | `npm run build` |
| Build + upload to main | `npm run push-main` |
| Build + upload to sim | `npm run push-sim` |
| Watch + auto-upload to main | `npm run watch-main` |
| Lint | `npm run lint` |
| Unit tests | `npm test` or `npm run test-unit` |
| Run one test | `npm run test-unit -- -g "test name"` |

**There is no `typecheck` script.** Type errors surface during `npm run build` (rollup-plugin-typescript2 invokes `tsc`). To typecheck without building: `npx tsc --noEmit`.

**There is no `format` script.** Prettier is installed; run manually: `npx prettier --write "src/**/*.ts"`.

## Verification sequence (Orchestrator workflow)

Run checks in this order. Each step gates the next.

```bash
npm run lint          # 1. ESLint — catches style/type-aware errors first
npx tsc --noEmit      # 2. Typecheck — full type pass without producing output
npm test              # 3. Unit tests — Mocha, bails on first failure
npm run build         # 4. Full build — rollup bundles and validates imports end-to-end
```

- **tester agent**: new test files go in `test/unit/`, must be named `*.test.ts`, import `assert` from `"chai"` explicitly (TypeScript requires it even though it's also injected at runtime). `_` (lodash) and `sinon` are available as globals without imports. Reset `Game`/`Memory` mocks in `beforeEach` using the pattern in `test/unit/mock.ts`.
- **implementer agent**: confirm `npx tsc --noEmit` and `npm test` both pass before marking done; `npm run build` is the final integration check.
- **validator agent**: all four commands above must exit 0 with no errors or warnings (lint warnings from `sort-imports` are acceptable).

## Integration tests

The `npm run test-integration` script is a stub — integration tests are disabled by default. Enabling them requires:
1. Install `screeps-server-mockup` as a dev dependency (not in `package.json`)
2. Update the `test-integration` script in `package.json`
3. Run `npm run build` first — the integration server runs `dist/main.js`

## Source layout

```
src/
  main.ts          # Entrypoint — exports the named `loop` function
  utils/
    ErrorMapper.ts # Source-map-aware error wrapper for in-game stack traces
test/
  mocha.opts       # Mocha config (legacy opts format — Mocha 5.2, do not upgrade without migrating)
  setup-mocha.js   # Injects globals: `_` (lodash), `assert` (chai), `sinon` — no imports needed in tests
  unit/
    mock.ts        # Manual mocks for Screeps globals (Game, Memory)
```

## Non-obvious rules

- **`loop` is a named export**, not default. `export const loop = ...` in `main.ts`. If you change it to `export default`, Screeps won't find it.
- **`baseUrl: "src/"`** — imports like `import { foo } from "utils/foo"` resolve relative to `src/`, not the project root. Works in both rollup and `ts-node` via `tsconfig-paths`.
- **`tsconfig.test.json`** overrides `module` to `CommonJS` for `ts-node`. Tests run directly as TypeScript — no separate compile needed.
- **Test globals** (`_`, `sinon`) are injected by `test/setup-mocha.js` and available without imports. `assert` must still be imported explicitly from `"chai"` — TypeScript requires it even though it is also injected at runtime.
- **Source maps don't work in the Screeps simulator.** `ErrorMapper` detects `"sim" in Game.rooms` and falls back to raw errors.
- **`Memory` must be extended via `declare global`** — see the pattern in `main.ts`.

## ESLint rules that differ from defaults (all enforced as errors unless noted)

- `@typescript-eslint/explicit-member-accessibility`: all class members need explicit `public`/`private`/`protected`
- `max-classes-per-file: 1`: one class per file
- `sort-imports`: warn (imports must be sorted)
- `id-blacklist`: bans `any`, `Number`, `number`, `String`, `string`, `Boolean`, `boolean`, `Undefined` as identifier names
- Type-aware lint rules are active (`parserOptions: { project: "tsconfig.json" }`) — lint fails if TypeScript itself cannot compile the file

## Screeps runtime constraints

- No DOM, no Node.js APIs. Runtime is a restricted JS sandbox.
- `@types/screeps` provides all game globals (`Game`, `Memory`, `RoomObject`, etc.).
- `Memory` persists between ticks as JSON. Never store circular refs or functions in it.
- The `DEST` environment variable selects the upload target key from `screeps.json` (e.g., `DEST=main`).
