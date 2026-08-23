# The Vertigo Studio

The editorial interface for the marketing site. Its own package on purpose: nothing in here may enter the application's dependency graph, and `npm run check` in the repo root never sees it.

## What the schemas are for

Each document type here is written against the GROQ projection its collection declares in `content/collections/*.collection.ts`. **Those projections are the contract**, not these schemas — the build validates what arrives and fails if it is wrong, so a schema change that the projection does not expect breaks the build rather than shipping quietly. Change them together.

Field-by-field rules live in `docs/content/sanity-field-contract.md`; media rules in `docs/content/sanity-media-contract.md`.

## Setup

```bash
cd sanity-studio
npm install
npx sanity login
npx sanity init --project <projectId> --dataset production
npm run dev            # http://localhost:3333
```

Then, in the repository root, put `SANITY_PROJECT_ID` and `SANITY_DATASET` in `.env` and run:

```bash
CONTENT_SOURCE=sanity npm run content:build
```

## Seeding a fresh dataset

```bash
npm run import-fixtures            # writes .out/seed.ndjson
npx sanity dataset import .out/seed.ndjson production --replace
```

The NDJSON is generated from `content/fixtures/`, so a fresh dataset starts as the exact content the repository already builds and tests against. That is what makes the migration parity check meaningful: generate from fixtures, generate from Sanity, diff `src/content/generated/`.

## Deploying

```bash
npm run deploy         # gives the client a stable Studio URL
```

The Studio is hosted by Sanity, independent of the public site's deployment. A Studio outage does not affect the published website, because the website never talks to Sanity at runtime.
