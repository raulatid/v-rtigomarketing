# Production HTML and console verification

Verified locally on 2026-09-15. The public deployment was not checked or updated.

## Policy

- Development diagnostics may appear in the dev server and preview builds.
- Production must omit development diagnostics and internal HTML comments.
- Genuine loading/rendering errors and warnings remain available.
- Browser and extension messages are outside application control.

`localhost` does not determine the environment. `vite` serves development source,
including HTML comments. `npm run build` strips HTML comments but retains debug
tools unless `VERCEL_ENV=production` (or its supported fallback) is set. Vercel
production deployments provide this value through their system environment.

## Finding and correction

The artwork resolution and transparent-margin warnings in `createBrandAtlas.ts`
were unconditional. They appeared in an explicit production build and included
`docs/earth/logo-spec.md`. They now use `DEBUG_TOOLS_ENABLED`; actual image loading
and decoding failures keep their existing reporting.

The publication validator now rejects production references to Markdown files
under `docs/`, including folders outside the previously checked audit paths. It
was tested against the preceding production artifact and rejected its leak.

## Evidence

- Full `npm run build` with `VERCEL_ENV=production`: passed, including 132 test
  files / 1,888 unit tests, type checks, harnesses and final publication checks.
- All five emitted HTML documents passed the comment-node validator; no source
  map files were emitted.
- Chromium: `/`, `/blog`, `/blog/como-medimos-el-seo` and
  `/debug?stats=1&debugNavigation=1` passed the production browser checks.
- The scene routes completed the intro and entered Murcia. The checked DOMs
  contained no comment nodes, the boot debug global was absent, and same-origin
  application scripts emitted no console messages at any level during the visits.
- A separate test blocked required Earth textures: the visitor-facing failure
  appeared and `[boot] fatal` remained in the console.

The automated checks live in `e2e/production-hygiene.spec.ts` and
`scripts/publicationHygiene.test.ts`. They cover these routes and failure cases;
they do not establish silence under every possible browser, interaction or fault.

## Repeat locally (PowerShell)

```powershell
$env:VERCEL_ENV = 'production'
npm run build
npx playwright test e2e/production-hygiene.spec.ts --project chromium
```

The browser tests require Playwright Chromium. They are skipped unless the
production environment is explicit. A build with debug tools still enabled fails
the production assertions. This build must be deployed before its results apply
to the public site. Check the deployed site in a clean browser profile afterward.
