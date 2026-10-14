# vgc

## Commands
- `npm run dev`: Vite dev server (runs `content:build` first).
- `npm run typecheck`, `npm test` (Vitest).
- `npm run check`: typecheck + unit tests + every harness. This is the full gate.
- Harnesses run individually as `npm run check:<name>`: architecture, functions, audit, navigation, footprint, campus, earth, warp, space, asset:contract, studio.
- `npm run build`: runs the full `check`, then `vite build`, blog preview and `check:publication`.
- `npm run e2e` (Playwright): never run unless I ask.

## Which check for which change
- Navigation → `check:navigation`
- Earth / orbit → `check:earth`
- Warp transition → `check:warp`
- Module boundaries → `check:architecture`
- Murcia / district interaction → its unit tests
- Content validation → content/config unit tests
- Sanity Studio schema → `check:studio`
- Documentation only → `check:audit`
- Static asset re-encode → `check:asset:contract`, plus byte/dimension comparison and a visual look
- Bundle size, tree shaking, dead code → production build, and inspect the emitted chunks directly
