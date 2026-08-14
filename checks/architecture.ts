/**
 * The dependency rules in ARCHITECTURE.md §17, asserted against the real import
 * graph.
 *
 * Every one of these was already written down, and one of them was already
 * broken: `graphics/RenderPipeline.tsx` imported `MurciaExperience`, held it as
 * a prop and dereferenced it, for several phases. Nothing failed, because
 * nothing was checking — the rule lived in a document and the code drifted past
 * it. It was found by reading, which does not scale and does not run on push.
 *
 * This is deliberately a source-level check rather than a bundler one. It reads
 * the import graph directly, so it names the offending file and specifier
 * instead of reporting a chunk that grew.
 *
 * Adding a rule here is cheap. Deleting one should require the same argument as
 * changing ARCHITECTURE.md, because it is the same decision.
 */
import fs from 'node:fs';
import path from 'node:path';
import { banner, check, finish, section } from './lib/assert';

const SRC = 'src';

interface Module {
  /** Repo-relative, forward slashes, e.g. `src/graphics/RenderPipeline.tsx`. */
  file: string;
  /** Resolved repo-relative targets of every relative import. */
  imports: Array<{ spec: string; target: string }>;
}

function listSources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.posix.join(dir.replace(/\\/g, '/'), entry.name);
    if (entry.isDirectory()) listSources(p, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (fs.existsSync(cand)) return cand;
  }
  // .glsl / .css and anything else that is not a TS module.
  return fs.existsSync(base) ? base : null;
}

const SPEC_RE = /(?:from\s*|import\s*\(\s*|import\s+)['"](\.[^'"]*)['"]/g;

const modules: Module[] = listSources(SRC).map((file) => {
  const src = fs.readFileSync(file, 'utf8');
  const imports: Module['imports'] = [];
  for (const m of src.matchAll(SPEC_RE)) {
    const target = resolve(file, m[1]);
    if (target) imports.push({ spec: m[1], target });
  }
  return { file, imports };
});

const byFile = new Map(modules.map((m) => [m.file, m]));

banner('ARCHITECTURE — dependency rules (ARCHITECTURE.md §17, §29)');

/**
 * Asserts that nothing under `fromPrefix` imports anything under `toPrefix`.
 * Reports the first three offenders by name, because a list of forty is not
 * more actionable than a list of three.
 */
function forbid(label: string, fromPrefix: string, toPrefix: string, why: string): void {
  const offenders: string[] = [];
  for (const mod of modules) {
    if (!mod.file.startsWith(fromPrefix)) continue;
    for (const imp of mod.imports) {
      if (imp.target.startsWith(toPrefix)) {
        offenders.push(`${mod.file} -> ${imp.spec}`);
      }
    }
  }
  const detail = offenders.length === 0 ? why : offenders.slice(0, 3).join('; ');
  check(label, offenders.length === 0, detail);
}

section('1. Shared infrastructure does not depend on an experience');

forbid(
  'graphics/ does not import any experience',
  'src/graphics/',
  'src/experiences/',
  'the render pipeline takes RenderableExperience and OverlayPass instead',
);
forbid(
  'graphics/ does not import the application layer',
  'src/graphics/',
  'src/app/',
  'the arrow is app -> graphics; FrameSettings is what crosses it',
);
forbid('interaction/ does not import any experience', 'src/interaction/', 'src/experiences/', 'cursor + NDC only');
forbid('loading/ does not import any experience', 'src/loading/', 'src/experiences/', '');
forbid('utils/ does not import any experience', 'src/utils/', 'src/experiences/', '');
forbid('utils/ does not import the application layer', 'src/utils/', 'src/app/', '');
forbid(
  'corner-logo/ does not import any experience',
  'src/corner-logo/',
  'src/experiences/',
  'application chrome, not part of either experience (ADR 002)',
);

section('2. The two experiences do not know about each other');

forbid(
  'earth does not import murcia',
  'src/experiences/earth/',
  'src/experiences/murcia/',
  '',
);
forbid(
  'murcia does not import earth',
  'src/experiences/murcia/',
  'src/experiences/earth/',
  '',
);

section('3. The boot entry depends on nothing');

{
  // vite.config.ts asserts this on the EMITTED bundle, which is the guarantee
  // that matters. This is the same rule at source level, so it fails in
  // `npm run check` with a filename rather than at build time with a chunk size.
  const offenders: string[] = [];
  for (const mod of modules) {
    if (!mod.file.startsWith('src/intro-draw/')) continue;
    for (const imp of mod.imports) {
      if (!imp.target.startsWith('src/intro-draw/')) {
        offenders.push(`${mod.file} -> ${imp.spec}`);
      }
    }
  }
  check(
    'intro-draw/ imports nothing outside itself',
    offenders.length === 0,
    offenders.length === 0
      ? 'a value import would hoist it into a chunk shared with the app bundle'
      : offenders.slice(0, 3).join('; '),
  );
}

section('4. No circular dependencies');

{
  // Iterative DFS with an explicit stack: the graph is small, but a recursive
  // walk over a cycle is exactly the thing that would blow up rather than report.
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>();
  const cycles: string[] = [];

  for (const start of byFile.keys()) {
    if (colour.get(start) === BLACK) continue;
    const stack: Array<{ file: string; next: number }> = [{ file: start, next: 0 }];
    const path: string[] = [];
    colour.set(start, GREY);
    path.push(start);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const mod = byFile.get(frame.file);
      const edges = mod ? mod.imports : [];

      if (frame.next >= edges.length) {
        colour.set(frame.file, BLACK);
        stack.pop();
        path.pop();
        continue;
      }

      const target = edges[frame.next++].target;
      if (!byFile.has(target)) continue;

      const state = colour.get(target) ?? WHITE;
      if (state === GREY) {
        const from = path.indexOf(target);
        cycles.push([...path.slice(from), target].join(' -> '));
      } else if (state === WHITE) {
        colour.set(target, GREY);
        stack.push({ file: target, next: 0 });
        path.push(target);
      }
    }
  }

  check(
    'the module graph is acyclic',
    cycles.length === 0,
    cycles.length === 0 ? `${byFile.size} modules walked` : cycles[0],
  );
}

section('5. The graph is what the check thinks it is');

// A guard on the guard. Every rule above passes trivially if the walk found
// nothing, and a resolver that silently returns null for everything would look
// exactly like a clean architecture.
check(
  'the walk found a substantial number of modules',
  byFile.size > 60,
  `${byFile.size} modules under src/`,
);
check(
  'the walk resolved a substantial number of imports',
  modules.reduce((n, m) => n + m.imports.length, 0) > 150,
  `${modules.reduce((n, m) => n + m.imports.length, 0)} relative imports resolved`,
);
check(
  'a known edge is present',
  byFile.get('src/components/SceneCanvas.tsx')?.imports.some((i) => i.target === 'src/graphics/RenderPipeline.tsx') ===
    true,
  'SceneCanvas -> RenderPipeline, the app -> graphics edge that must exist',
);

finish();
