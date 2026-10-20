# vgc

## Commands
- `npm run dev`: Vite dev server (runs `content:build` first).
- `npm run typecheck`, `npm test` (Vitest).
- `npm run check`: `content:build` (via `precheck`), then typecheck + unit tests + every harness. This is the full gate.
- Harnesses run individually as `npm run check:<name>`: architecture, functions, audit, navigation, footprint, campus, earth, warp, space, asset:contract, studio.
- Outside the chain: `npm run check:asset` (the full city GLB check; `asset:contract` is its contract-only half) and `npm run test:coverage`.
- `npm run build`: runs the full `check`, then `vite build`, blog preview and `check:publication`.
- `npm run e2e` (Playwright, rebuilds first via `pree2e`): never run unless I ask.

## Which check for which change
- Navigation → `check:navigation`
- Murcia camera limits / rest pose → `check:footprint` (with `check:navigation` and `check:warp`)
- Campus → `check:campus`
- Earth / orbit → `check:earth`
- Earth sky and stars → `check:space`
- Warp transition → `check:warp`
- Module boundaries → `check:architecture`
- `api/`, `server/` → unit tests + `check:functions` + `check:architecture`
- `vercel.json` headers, CSP, rewrites → `npx vitest run scripts/vercelConfig.test.ts`
- What gets published (publication hygiene, secret scan) → their unit tests, then `check:publication` on a fresh `dist/`
- Content validation → `content:build` + content/config unit tests + `src/content/generated.test.ts`
- Sanity Studio schema → `check:studio` (skips green when the Studio's `node_modules` are missing)
- `docs/audits/` → `check:audit`. Nothing checks the rest of `docs/`: verify links by hand
- Static asset re-encode → `check:asset:contract`, plus byte/dimension comparison and a visual look
- Bundle size, tree shaking, dead code → `VITE_VERCEL_ENV=production npx vite build` (set in the shell, not `.env`); the budget plugin prints the totals; inspect the emitted chunks directly

## Documentation
- Index of current decisions and traps: `docs/README.md`. Read the area's decision and traps before changing its behaviour.
- Documentation is written in Spanish; code, identifiers, code file names and commit messages stay in English. Archived docs keep their original language.
