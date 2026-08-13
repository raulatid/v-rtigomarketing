/**
 * The assertion vocabulary every harness in `checks/` shares.
 *
 * This is not a test framework and should not become one. It exists for one
 * reason: the exit code was written five times and got written wrong once.
 * `checks/navigation-feel.ts` printed its failures and left `process.exitCode`
 * at 0, so `npm run check` chained past it with `&&` and a real regression —
 * grab-the-point undershooting by 30% — sat in the log for as long as nobody
 * read the log. `finish()` is the fix, in one place, for all of them.
 *
 * The second thing it removes is the hardcoded summary count. Three harnesses
 * printed `${total}/${total} checks passed` against a literal, and by the time
 * this was written the warp harness's literal said 32 while the file ran 36.
 * A summary that cannot be wrong is worth more than a summary that is round.
 *
 * What it deliberately does NOT do is abstract the harnesses' setup. Each one
 * builds real Three.js objects in the way its own subject needs, and
 * `district-flight.ts` reimplements pointer suppression on purpose to keep
 * React and canvas out of a Node bundle. Only the counting is shared.
 */

let failures = 0;
let checks = 0;

/**
 * One assertion. `detail` is printed either way — a passing check's measured
 * value is how a later reader learns what "correct" looked like.
 *
 * `pad` exists only because the harnesses chose different label columns and
 * their output is read side by side; it is cosmetic and has no default worth
 * arguing about.
 */
export function check(label: string, ok: boolean, detail = '', pad = 56): void {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(pad)} ${detail}`);
}

/** A blank line and a heading. Sections are numbered by hand in each harness. */
export function section(title: string): void {
  console.log(`\n${title}`);
}

/** Banner, for the top of a harness. */
export function banner(title: string): void {
  console.log('='.repeat(70));
  console.log(title);
  console.log('='.repeat(70));
}

export function close(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

// Declared rather than pulled in via @types/node: this is the only Node API the
// harnesses touch, and esbuild bundles them for Node without those types.
declare const process: { exitCode?: number } | undefined;

/**
 * The summary line, and the exit code.
 *
 * Counted live, so it cannot drift from the assertions actually executed, and
 * it sets `process.exitCode` from the same counter it prints — which is what
 * makes a harness able to fail a build rather than merely report that it did.
 *
 * Call this last in every harness. A harness that does not call it cannot fail,
 * and that is precisely the bug this module was written to make impossible.
 */
export function finish(): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log(
    `${checks - failures}/${checks} checks passed${failures ? `  *** ${failures} FAILED ***` : ''}`,
  );
  if (failures > 0 && typeof process !== 'undefined') process.exitCode = 1;
}
