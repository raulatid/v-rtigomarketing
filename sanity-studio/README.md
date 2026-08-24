# The Vertigo Studio

The editorial interface for the marketing site. Its own package on purpose: nothing in here may enter the application's dependency graph, and `npm run check` in the repo root never sees it.

**For the person who will edit content, not code:** read `GUIA-EDITOR.md` (Spanish) instead of this file.

## Written for an editor, on purpose

The Studio UI is fully in Spanish (`@sanity/locale-es-es`), and every field description says *what to type* with an example — never which source file cares or what the build does. Identifiers that the website's code depends on (case-study, district and legal-document slugs) are generated once and then read-only for editors; only administrators can change them, because only they can change the code on the other side. Districts and the singletons cannot be created, duplicated or deleted from the Studio at all. The developer rationale for every rule lives in the JSDoc of the schema files, where an editor never sees it.

## What the schemas are for

Each document type here is written against the GROQ projection its collection declares in `content/collections/*.collection.ts`. **Those projections are the contract**, not these schemas — the build validates what arrives and fails if it is wrong, so a schema change that the projection does not expect breaks the build rather than shipping quietly. Change them together.

Field-by-field rules live in `docs/content/sanity-field-contract.md`; media rules in `docs/content/sanity-media-contract.md`.

## Setup

**There are two `.env` files and they use different variable names.** This is the thing that trips people up, so it is first:

| File | Variables | Read by | Committed? |
|---|---|---|---|
| `sanity-studio/.env` | `SANITY_STUDIO_PROJECT_ID`, `SANITY_STUDIO_DATASET` | the Sanity CLI — `dev`, `build`, `deploy` | no, gitignored |
| `<repo root>/.env` | `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_TOKEN` | `npm run content:build` | no, gitignored |
| `<repo root>/.env.example` | — | **nothing**, it is a template | yes |

The Sanity CLI loads `.env` from *this* directory (via Vite's `loadEnv`) and exposes **only** the `SANITY_STUDIO_` prefix. The repo root's variables are invisible to it, and putting values in `.env.example` has no effect on anything — it is documentation.

The split is deliberate: `SANITY_STUDIO_` marks a value as safe to compile into the Studio's browser bundle. The content build's variables — `SANITY_TOKEN` in particular — must never carry a prefix that would put them there.

```bash
cd sanity-studio
npm install
npx sanity login

cat > .env <<'ENV'
SANITY_STUDIO_PROJECT_ID=<your project id>
SANITY_STUDIO_DATASET=<your dataset, e.g. production>
ENV

npm run dev            # http://localhost:3333
```

If `projectId` is missing you get a message naming this file and these variables — `sanity.config.ts` checks for them rather than letting Sanity's own `Configuration must contain projectId` fire, which is correct but says nothing about where to put it.

`sanity init` is **not** needed: this Studio is already scaffolded, and `init` would overwrite `sanity.config.ts`.

Then, in the repository root, create `.env` with the *unprefixed* names and build the content:

```bash
cd ..
cat > .env <<'ENV'
SANITY_PROJECT_ID=<your project id>
SANITY_DATASET=<your dataset>
ENV

CONTENT_SOURCE=sanity npm run content:build
```

Against an empty dataset this fails with `collection is empty` for every collection, and writes nothing — that is the pipeline working. Seed it first.

## Seeding a fresh dataset

```bash
npm run import-fixtures            # writes .out/seed.ndjson
npx sanity dataset import .out/seed.ndjson production --replace
```

The NDJSON is generated from `content/fixtures/`, so a fresh dataset starts as the exact content the repository already builds and tests against. That is what makes the migration parity check meaningful: generate from fixtures, generate from Sanity, diff `src/content/generated/`.

## Dependency audit

`npm audit` in this package reports **7 findings (1 high, 6 moderate)**. They are **known and accepted**, last assessed 2026-08-24 against `sanity@6.10.1`. Do not run `npm audit fix --force`: it downgrades `sanity` to 5.14.1, giving up a major version of the Studio.

The chain:

```
sanity 6.10.1 → @sanity/cli 8.2.1 → @vercel/frameworks 3.29.0 → js-yaml 3.13.1   (high)
                                                              → smol-toml 1.5.2  (moderate)
                                  → typeid-js 1.2.0 → uuid 10.0.0                (moderate)
```

Why it is accepted:

- **The public website is not in this dependency tree at all.** The marketing app is a separate package with no `@sanity/*` dependency; its own `npm audit --omit=dev` reports 0, and its bundle contains no Sanity code.
- **None of it reaches a browser.** `@vercel/frameworks` is imported by three files, all under `@sanity/cli/dist/actions/init/` and `.../scaffold/`; `typeid-js@1.2.0` by one, `dist/util/telemetry/createTraceId.js`. Reachability from every `@sanity/cli` export entry (`.`, `_internal`, `runtime`) is zero — `runtime.js` carries a comment saying it must never import Node-only modules "or it would drag the CLI into the frontend bundle".
- **The commands in this package's `scripts` never load them.** Import traces: `sanity dev` 0 hits, `sanity build` 0, `sanity deploy` 0. Only `sanity init` and `sanity new` touch them, and this Studio is already scaffolded.
- **The inputs are not attacker-controlled.** The js-yaml and smol-toml issues need hostile YAML/TOML; `@vercel/frameworks` parses config files in your own project directory during framework detection. The uuid issue needs a caller-supplied buffer.
- **There is no upstream fix to take.** `@vercel/frameworks@latest` still pins `js-yaml: "3.13.1"` and `smol-toml: "1.5.2"` as *exact* versions, and `typeid-js@latest` still declares `uuid: "^10.0.0"`. Upgrading changes nothing, and overriding across majors would likely break `sanity init` silently — js-yaml 4 removed `safeLoad`, which is what `@vercel/frameworks` calls.

**One caveat, because it is what a future re-check will trip over:** a *different* copy, `typeid-js@0.3.0` under `@sanity/telemetry`, **is** in the Studio's browser bundle. It is out of scope here — the advisory targets `typeid-js >=1.1.0`, and 0.3.0 depends on `uuidv7` rather than `uuid` — but "typeid-js is CLI-only" would be the wrong thing to remember.

**Re-open this if** Sanity bumps `@vercel/frameworks` to something that no longer pins vulnerable versions, if a new advisory lands on a package that *is* in the browser chunk, or if any of these four appear in `dist/` after a `sanity build`.

## Deploying

```bash
npm run deploy         # gives the client a stable Studio URL
```

The Studio is hosted by Sanity, independent of the public site's deployment. A Studio outage does not affect the published website, because the website never talks to Sanity at runtime.
