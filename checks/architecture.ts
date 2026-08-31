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
  file: string
  /**
   * Resolved repo-relative targets of every relative import.
   *
   * `kind` exists because "is the blog reachable" and "is the blog reachable
   * WITHOUT a dynamic import" are different questions, and the second is the one
   * the entry budget depends on. Every pre-existing rule keeps using both kinds,
   * so nothing below changed behaviour when this was added.
   */
  imports: Array<{ spec: string; target: string; kind: 'static' | 'dynamic' }>;
}

function listSources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.posix.join(dir.replace(/\\/g, '/'), entry.name);
    if (entry.isDirectory()) listSources(p, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

function isFile(candidate: string): boolean {
  // NOT `existsSync`, and this cost an afternoon. Windows matches paths
  // case-insensitively, so `existsSync('src/App')` is TRUE — it finds the
  // `src/app/` DIRECTORY. Resolving `./App` to a directory made the import graph
  // dead-end at the application root, which no rule noticed while every rule was
  // a one-hop `forbid`; the reachability walk added for the blog is what
  // surfaced it.
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  // Extensions first, then the bare path — and the bare path only if it is
  // genuinely a file. A module always wins over a directory that merely shares
  // its name under a case-insensitive filesystem.
  for (const cand of [`${base}.ts`, `${base}.tsx`, base, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (isFile(cand)) return cand;
  }
  return null;
}

const STATIC_RE = /(?:from\s*|import\s+)['"](\.[^'"]*)['"]/g;
const DYNAMIC_RE = /import\s*\(\s*['"](\.[^'"]*)['"]/g;

const modules: Module[] = listSources(SRC).map((file) => {
  const src = fs.readFileSync(file, 'utf8');
  const imports: Module['imports'] = [];
  // Dynamic first, so a specifier matched by both patterns — `import(` also
  // contains `import` — is recorded as the dynamic edge it actually is.
  const dynamic = new Set<string>();
  for (const m of src.matchAll(DYNAMIC_RE)) {
    dynamic.add(m[1]);
    const target = resolve(file, m[1]);
    if (target) imports.push({ spec: m[1], target, kind: 'dynamic' });
  }
  for (const m of src.matchAll(STATIC_RE)) {
    if (dynamic.has(m[1])) continue;
    const target = resolve(file, m[1]);
    if (target) imports.push({ spec: m[1], target, kind: 'static' });
  }
  return { file, imports };
});

const byFile = new Map(modules.map((m) => [m.file, m]));

banner('ARCHITECTURE — dependency rules (ARCHITECTURE.md §17, §29)');

/**
 * Walks STATIC edges only, from one entry point.
 *
 * `forbid` answers "does this directory import that one", which is the right
 * question for a layering rule. This answers "can the bundler reach this from
 * that entry without crossing a dynamic boundary", which is the right question
 * for a BUDGET rule — and the two differ exactly where a lazy seam is doing its
 * job.
 */
function staticallyReachable(root: string): Set<string> {
  const seen = new Set<string>();
  const stack = [root];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const imp of byFile.get(file)?.imports ?? []) {
      if (imp.kind === 'static') stack.push(imp.target);
    }
  }
  return seen;
}

/** Every module reachable from `root`, dynamic seams included. */
function reachable(root: string): Set<string> {
  const seen = new Set<string>();
  const stack = [root];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const imp of byFile.get(file)?.imports ?? []) stack.push(imp.target);
  }
  return seen;
}

function forbidReachable(label: string, root: string, prefix: string, why: string): void {
  const offenders = [...staticallyReachable(root)].filter((file) => file.startsWith(prefix));
  check(label, offenders.length === 0, offenders.length === 0 ? why : offenders.slice(0, 3).join('; '));
}

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

// `src/content/` is leaf infrastructure, like `utils/`. It carries the shapes
// the UI consumes and the copy itself, and both experiences depend on it — Earth
// for case studies, Murcia for districts. Section 2 forbids either experience
// importing the other, so a shared vocabulary has nowhere else it could legally
// live.
//
// The arrow points one way for a second reason: the content build (root
// `content/`, Node-side) imports these types and invariants to validate what it
// emits. Anything this module reached for would end up bundled for Node by
// esbuild, which is how `fetch`, `fs` or a DOM global would arrive somewhere
// none of them exist.
forbid('content/ does not import any experience', 'src/content/', 'src/experiences/', 'content is copy and shapes; who renders it is not its concern');
forbid('content/ does not import the application layer', 'src/content/', 'src/app/', '');
forbid('content/ does not import graphics', 'src/content/', 'src/graphics/', '');

// The blog is MODELLED but not rendered (adr/011). Its generated module exists
// so the schema does not have to be invented later against live editorial copy,
// and it must stay out of the application entirely until there is a blog UI —
// which belongs behind route-level lazy loading, not a static import.
//
// The entry chunk budget is 332,000 B with roughly 2 KB spare. A static import
// of the whole blog dataset would blow it, and `vite.config.ts` would report it
// as "three.js has probably leaked back in", sending whoever reads that message
// somewhere with no bug in it.
// The blog HAS a UI now (adr/013), so the old rule here — "nothing imports the
// generated blog content" — expired with the decision it was enforcing. What did
// not expire is the reason underneath it: a static import of the whole dataset
// from the WebGL entry blows the 332,000 B budget, and `vite.config.ts` reports
// that as "three.js has probably leaked back in", sending whoever reads the
// message somewhere with no bug in it.
//
// So the rule NARROWED rather than went away, and it is rooted at the entry
// rather than stated over `src/`: `src/entries/blog.tsx` is a second Rollup
// input whose whole job is to import the blog, so a blanket ban would forbid the
// one import that is correct.
forbidReachable(
  'the app entry cannot statically reach the generated blog content',
  'src/main.tsx',
  'src/content/generated/blogPosts',
  'the dataset rides the blog chunk — see the ENTRY_BUDGET_BYTES history in vite.config.ts',
);
forbidReachable(
  'the app entry cannot statically reach the blog UI',
  'src/main.tsx',
  'src/blog/',
  'LazyBlog is the seam; a static import would pull the serializer and blog.css into the entry',
);

// The cold document is 2D by construction, not by discipline. This is the
// source-level half of the promise `blog.html` makes; the emitted half is
// asserted in `vite.config.ts`, which refuses to inject a scene modulepreload
// into that document.
forbidReachable(
  'the blog entry never reaches an experience',
  'src/entries/blog.tsx',
  'src/experiences/',
  'a cold /blog load pays for an article and nothing else (adr/013)',
);
forbidReachable(
  'the blog entry never reaches graphics',
  'src/entries/blog.tsx',
  'src/graphics/',
  '',
);

forbid('blog/ does not import any experience', 'src/blog/', 'src/experiences/', '');
// Murcia emits a bare signal outward through a callback; it must not learn that
// a blog exists. Same reasoning as the scene-navigation rule below.
forbid(
  'no experience imports the blog',
  'src/experiences/',
  'src/blog/',
  'the city CTA emits intent through a callback; App decides what it means',
);
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

forbid(
  'neither experience imports scene navigation',
  'src/experiences/',
  'src/app/navigation/',
  'navigating between the worlds is the one thing that knows both exist',
);

// Added with `app/navigation/` (`adr/009`). Scene navigation is an application
// concern by definition — it is the only thing in the codebase that knows both
// worlds exist — so an experience reaching for it would be an experience learning
// about its sibling by the back door, which is what section 2 above forbids
// directly.
//
// NARROWER THAN IT SHOULD BE, and the reason is worth recording rather than
// quietly leaving the gap. The rule that belongs here is "no experience imports
// the application layer at all", which is ARCHITECTURE 17's stated direction. It
// cannot be asserted today: `earth/camera/CameraController.tsx` and
// `earth/scene/SpaceBackdrop.tsx` both import `app/warpTransition`, deliberately
// and correctly — it is a pure curve module with no DOM, no React and no state,
// and DECISIONS 8 has each experience read the warp's progress and move its own
// camera. What is wrong is only where that module LIVES: a shared vocabulary in
// `app/` reads as orchestration. Moving it to `utils/` would let the broad rule be
// stated, and that is a refactor with no bearing on this feature, so it is named
// here instead of smuggled in.

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
// GUARD ON THE GUARD, and this one is not decorative: every `forbidReachable`
// above passes trivially if the target is not in the graph at all. Renaming
// BlogRoute.tsx, or deleting LazyBlog's import(), would make those rules
// vacuously true and this file would go green on a blog that no longer ships.
{
  const fromEntry = reachable('src/main.tsx');
  check(
    'the blog IS reachable from the app entry, dynamically',
    fromEntry.has('src/blog/BlogRoute.tsx'),
    'LazyBlog must keep a dynamic import of the blog, or the rules above pass on an absent feature',
  );
  check(
    'the blog dataset IS reachable from the app entry, dynamically',
    fromEntry.has('src/content/generated/blogPosts.ts'),
    'the blog must keep importing its own content',
  );
}

check(
  'a known edge is present',
  byFile.get('src/components/SceneCanvas.tsx')?.imports.some((i) => i.target === 'src/graphics/RenderPipeline.tsx') ===
    true,
  'SceneCanvas -> RenderPipeline, the app -> graphics edge that must exist',
);

finish();
