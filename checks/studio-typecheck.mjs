/**
 * The Studio's own typecheck, run from the root.  `npm run check:studio`
 *
 * The Studio is a separate package on purpose — `sanity-studio/package.json`
 * says so in its description, and nothing in it may enter the application's
 * dependency graph or its bundle. The consequence is that the root `tsconfig`
 * excludes it, so `npm run typecheck` has never had an opinion about the
 * schemas the editor actually uses. A schema that stopped compiling would be
 * found by whoever next ran `sanity dev`, which on a good week is nobody.
 *
 * This is not a harness in the `checks/lib/assert` sense: there is no assertion
 * to count. It runs the Studio's own `typecheck` script — the same command a
 * developer runs in that directory, so there is one definition of what
 * "compiles" means — and passes its exit code up.
 *
 * ── The skip, and why it is loud ──
 *
 * `sanity-studio/node_modules/` is not installed by the root `npm ci`, and
 * Vercel installs only the root package. So on the deploy path this has nothing
 * to run and MUST NOT fail the build; making the application's deployment
 * depend on the Studio's dependency tree is exactly the coupling the separate
 * package exists to prevent.
 *
 * A skip is therefore correct, and a silent one is not: a check that quietly
 * does nothing is worse than no check, because the green line reads the same.
 * It says which directory is missing and what to run.
 *
 * Written as .mjs rather than .ts because it is a process launcher with no types
 * worth having, and bundling it through esbuild the way `checks/*.ts` are would
 * be ceremony around one `spawnSync`.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const STUDIO = 'sanity-studio'

console.log('='.repeat(70))
console.log('SANITY STUDIO — typecheck (its own package, its own tsconfig)')
console.log('='.repeat(70))

// `typescript` specifically, not the directory: a half-finished install leaves
// node_modules/ present and the compiler absent, and `tsc: not found` is a
// worse message than the one below.
if (!fs.existsSync(path.join(STUDIO, 'node_modules', 'typescript'))) {
  console.log(`\n  SKIP  ${STUDIO}/node_modules/typescript is not installed.`)
  console.log(`        The Studio is a separate package and the root install does not`)
  console.log(`        reach it — this is the expected state on Vercel, where only the`)
  console.log(`        application is built.`)
  console.log(`\n        To run it: npm --prefix ${STUDIO} install`)
  process.exit(0)
}

const result = spawnSync('npm', ['run', 'typecheck'], {
  cwd: STUDIO,
  stdio: 'inherit',
  shell: true,
})

if (result.status !== 0) {
  console.log('\n' + '='.repeat(70))
  console.log(`*** FAILED *** the Studio does not compile. Fix it in ${STUDIO}/, where`)
  console.log('    the schemas the editor sees are defined.')
  process.exit(result.status ?? 1)
}

console.log('\n' + '='.repeat(70))
console.log('the Studio compiles')
