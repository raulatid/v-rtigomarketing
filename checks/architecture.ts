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
import { builtinModules } from 'node:module';
import { banner, check, finish, section } from './lib/assert';

/**
 * The roots this harness walks.
 *
 * `src/` is the browser. `server/` and `api/` are the form endpoint, added
 * 2026-09-04 with plan 012 — and they are walked rather than ignored because
 * the rules worth having are about what they may reach: a server module that
 * imported a React component, or an `api/` adapter that grew logic, are exactly
 * the drifts this file exists to refuse. Walking only `src/` would leave those
 * rules inexpressible while the two `src/ -> server/` rules still passed, which
 * is a partial fence that reads as a complete one.
 *
 * The root `content/` joined on the identical argument. It is the BUILD-TIME
 * content pipeline — it runs under `node`, reads `fs`, and speaks to Sanity over
 * the network — and it shares a name and a vocabulary with `src/content/`, which
 * is browser code. Two directories one letter apart, on opposite sides of the
 * runtime boundary, with imports legitimately crossing in exactly one direction.
 * That is a boundary worth asserting rather than remembering.
 */
const ROOTS = ['src', 'server', 'api', 'content'];

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
  // `./endpoint.js` names `endpoint.ts`: the TypeScript spelling for a module
  // that has to survive Node's ESM resolver, which `api/` and `server/` use
  // because Vercel transpiles them rather than bundling them (checks/
  // function-boot.ts). Stripped BEFORE the candidates below, so the walk sees
  // the same graph either way — without this, every such edge resolved to null
  // and the server tier silently dropped out of the reachability rules.
  const withoutJs = spec.replace(/\.js$/, '');
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), withoutJs));
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

const modules: Module[] = ROOTS.flatMap((root) => listSources(root)).map((file) => {
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
// A static import of the whole dataset from the WebGL entry would land it in
// the initial JS closure of `/`, which `vite.config.ts` budgets as a whole
// (INITIAL_JS_BUDGET_BYTES) rather than one chunk at a time. Catching it HERE,
// at the import, says which edge to delete; catching it there says only that a
// total moved.
// The blog HAS a UI now (adr/013), so the old rule here — "nothing imports the
// generated blog content" — expired with the decision it was enforcing. What did
// not expire is the reason underneath it: a static import of the whole dataset
// from the WebGL entry puts every article body on the initial load of `/`, and
// it grows with the article library rather than with the code.
//
// So the rule NARROWED rather than went away, and it is rooted at the entry
// rather than stated over `src/`: `src/entries/blog.tsx` is a second Rollup
// input whose whole job is to import the blog, so a blanket ban would forbid the
// one import that is correct.
forbidReachable(
  'the app entry cannot statically reach the generated blog content',
  'src/main.tsx',
  'src/content/generated/blogPosts',
  'the dataset rides the blog chunk — see BLOG_BUDGET_BYTES in vite.config.ts',
);
// The same reason, for the legal texts: 50 KB of prose read only after an
// explicit open, and grown by an editor rather than by a commit (2026-09-18,
// three rewritten documents failed the deployment on the budget). The panel
// is lazy; this keeps its content behind the same seam.
forbidReachable(
  'the app entry cannot statically reach the generated legal texts',
  'src/main.tsx',
  'src/content/generated/legalDocs',
  'the texts ride the legal panel chunk — import them from src/content/legal.ts, and that only from LegalPanel',
);
// The site-wide head is written into the HTML by the build and read by no
// component. Reached from either document, it would ship as JavaScript that
// nothing on the page uses.
for (const entry of ['src/main.tsx', 'src/entries/blog.tsx', 'src/entries/not-found.tsx']) {
  forbidReachable(
    entry + ' cannot reach the generated site head',
    entry,
    'src/content/generated/siteSeo',
    'SITE_SEO is build-only — read it in vite.config.ts, as the siteHead plugin does',
  );
}
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

// The 404 document is the blog's shape without the blog: the same chrome, the
// same dynamic seam to the 3D mark, and none of the article library. Each of
// those is a rule, because each has a plausible accident behind it — importing
// `BlogRoute` for its `BlogSurface` would drag every post body onto a page
// that shows none.
forbidReachable(
  'the 404 entry never reaches an experience',
  'src/entries/not-found.tsx',
  'src/experiences/',
  'a 404 is chrome and a logo, not the site',
);
forbidReachable(
  'the 404 entry never reaches graphics',
  'src/entries/not-found.tsx',
  'src/graphics/',
  '',
);
forbidReachable(
  'the 404 entry cannot statically reach the generated blog content',
  'src/entries/not-found.tsx',
  'src/content/generated/blogPosts',
  'import the chrome from src/blog/BlogSurface.tsx, never from BlogRoute',
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

// ── The server tier (plan 012, adr/014) ──
//
// `server/` runs in a Vercel function and `api/` is the four-line adapter that
// calls it. The browser must never reach either: a component importing
// `server/validate.ts` would look harmless and would put the server's rules —
// and the shape of its rejections — into the public bundle, which is precisely
// what `server/validate.ts` says it exists NOT to be.
forbid(
  'the browser never imports the server tier',
  'src/',
  'server/',
  'the forms talk to it over HTTP; a shared module would ship the server rules to the client',
);
forbid(
  'the browser never imports a function adapter',
  'src/',
  'api/',
  'api/ is a deployment surface, not a module',
);

// And the other direction, which is allowed but only narrowly. `server/` reads
// ONE thing from the browser tree — the published contact address, through
// `server/recipient.ts` — and nothing else. A React component, a hook or an
// experience reached from a function is a module that cannot run there.
forbid(
  'the server tier imports no component',
  'server/',
  'src/components/',
  'a function has no DOM; recipient.ts reaches src/content/ and nothing else',
);
forbid('the server tier imports no application layer', 'server/', 'src/app/', '');
forbid('the server tier imports no experience', 'server/', 'src/experiences/', '');
forbid('the server tier imports no graphics', 'server/', 'src/graphics/', '');
forbid('the server tier imports no blog', 'server/', 'src/blog/', '');
// The adapters hold the translation and nothing else. Anything they need from
// the browser tree they should be getting through `server/`.
forbid('a function adapter reaches only the server tier', 'api/', 'src/', 'keep api/ four lines');

// ── The content pipeline (plan 017 phase 6) ─────────────────────────────────
//
// TWO DIRECTORIES, ONE LETTER APART, ON OPPOSITE SIDES OF THE RUNTIME BOUNDARY.
//
// `src/content/` is browser code: the shapes the UI consumes, the copy itself,
// and the invariants both sides validate against. Root `content/` is the
// build-time pipeline that fetches from Sanity, validates, and writes
// `src/content/generated/`. It runs under node and is bundled for node by
// esbuild.
//
// The arrow crosses ONCE, and only that way: the pipeline imports the contracts
// so that what it emits is checked against what the browser expects. Every other
// edge is a defect with a different shape at each end —
//
//   `content/` -> `src/app`, `src/experiences`, `src/graphics`, `src/components`
//   drags React, three or a DOM global into a node bundle, where the failure is a
//   build that dies on `window is not defined` if you are lucky and a mapper that
//   silently depends on rendering if you are not.
//
//   `src/` -> `content/` is worse, because it does not fail: Vite will happily
//   bundle the pipeline for the browser, and with it the Sanity query strings,
//   the fetch that carries the read token, and every validator's error text.
//
//   `src/content/` -> a node builtin is the same defect one level down, and the
//   comment above `src/content/` already predicted it: "anything this module
//   reached for would end up bundled for Node by esbuild, which is how fetch, fs
//   or a DOM global would arrive somewhere none of them exist."

section('1b. The content pipeline and the content layer stay on their own sides');

forbid(
  'the browser never imports the content pipeline',
  'src/',
  'content/',
  'content is delivered as generated modules, never as the code that generated them',
);
forbid('the pipeline imports no application layer', 'content/', 'src/app/', '');
forbid('the pipeline imports no experience', 'content/', 'src/experiences/', '');
forbid('the pipeline imports no graphics', 'content/', 'src/graphics/', '');
forbid('the pipeline imports no component', 'content/', 'src/components/', '');
forbid('the pipeline imports no blog UI', 'content/', 'src/blog/', '');
// And the one edge that IS allowed, asserted as present rather than merely not
// forbidden. A rule that only says "no" passes when the pipeline stops
// validating against the browser's contracts altogether, which is the failure it
// exists to prevent.
{
  const crossings = modules
    .filter((m) => m.file.startsWith('content/'))
    .flatMap((m) => m.imports.filter((i) => i.target.startsWith('src/content/')).map(() => m.file));
  check(
    'the pipeline DOES import the shared content contracts',
    crossings.length > 0,
    crossings.length > 0
      ? `${new Set(crossings).size} pipeline module(s) validate against src/content/`
      : 'nothing in content/ reaches src/content/ — the emitted modules are no longer ' +
        'checked against the shapes the browser consumes',
  );
}

/**
 * Bare specifiers that only exist under node.
 *
 * Read from `node:module` rather than from a list typed here: a hardcoded list
 * is a list that goes stale, and this one is the runtime's own.
 */
const NODE_BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

const BARE_IMPORT_RE = /(?:from\s*|import\s+|import\s*\(\s*)['"]([^'".][^'"]*)['"]/g;

function forbidNodeBuiltins(label: string, prefix: string, why: string): void {
  const offenders: string[] = [];
  for (const mod of modules) {
    if (!mod.file.startsWith(prefix)) continue;
    const src = fs.readFileSync(mod.file, 'utf8');
    for (const m of src.matchAll(BARE_IMPORT_RE)) {
      if (NODE_BUILTINS.has(m[1])) offenders.push(`${mod.file} -> ${m[1]}`);
    }
  }
  check(label, offenders.length === 0, offenders.length === 0 ? why : offenders.slice(0, 3).join('; '));
}

forbidNodeBuiltins(
  'the content layer imports no node builtin',
  'src/content/',
  'it is bundled for the browser AND for node; a builtin breaks the first',
);
// The same rule over the whole browser tree, which is where it actually belongs.
// `src/content/` is only the likeliest place for it to happen because the
// pipeline sits next door and shares the vocabulary.
forbidNodeBuiltins(
  'no browser module imports a node builtin',
  'src/',
  'src/ is the browser; fs, path and crypto do not exist there',
);

forbid('platform/ does not import experiences', 'src/platform/', 'src/experiences/', 'build policy is shared infrastructure');
forbid('platform/ does not import the application', 'src/platform/', 'src/app/', '');
forbid('interaction/ does not import the application', 'src/interaction/', 'src/app/', 'signals are contracts, not application owners');

{
  const owners = new Set(['src/intro-draw/boot.ts', 'src/platform/motionPreference.ts']);
  const offenders = modules.filter((mod) => mod.file.startsWith('src/') && !owners.has(mod.file) &&
    /matchMedia\(\s*['"]\(prefers-reduced-motion:/.test(fs.readFileSync(mod.file, 'utf8')));
  check('motion queries belong only to boot and the document policy', offenders.length === 0,
    offenders.length ? offenders.map((mod) => mod.file).join('; ') : 'boot hands off its snapshot; CSS media queries stay live');
}

forbid('campus screens do not import the tower adapter',
  'src/experiences/murcia/campus/campusScreen/',
  'src/experiences/murcia/landmark/towerScreen/attachTowerScreen',
  'both adapters use screens/screenPlayer and screens/screenMesh');

forbid('the tower screen does not import generated content',
  'src/experiences/murcia/landmark/towerScreen/',
  'src/content/generated/',
  'MurciaExperience hands it layoutTowerSlides(TOWER_SCREEN_CONTENT); the lab and the tests hand it their own document');

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
  'neither experience imports the application layer',
  'src/experiences/',
  'src/app/',
  'navigating between the worlds is the one thing that knows both exist',
);

// Shared build policy lives in platform/. Experience-specific debug parameters
// stay in their experience. Application state crosses explicit read-only props.

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
  `${byFile.size} modules under ${ROOTS.join(', ')}`,
);
// GUARD ON THE GUARD for the server tier. Every rule about `server/` and `api/`
// passes trivially if the walk never reached them — renaming the directory, or
// dropping it from ROOTS, would make six rules vacuously true and this file
// would go green on a form endpoint with no fence around it at all.
{
  const serverModules = [...byFile.keys()].filter((file) => file.startsWith('server/'));
  check(
    'the walk found the server tier',
    serverModules.length >= 5,
    `${serverModules.length} modules under server/ — ROOTS must keep naming it`,
  );
  check(
    'both function adapters are present',
    byFile.has('api/audit.ts') && byFile.has('api/contact.ts'),
    'the two endpoints the forms post to',
  );
  // Same guard for the same reason: every rule in §1b passes trivially if the
  // walk never reached the pipeline, and "no offenders" is what an unwalked
  // directory looks like.
  const pipelineModules = [...byFile.keys()].filter((file) => file.startsWith('content/'));
  check(
    'the walk found the content pipeline',
    pipelineModules.length >= 10,
    `${pipelineModules.length} modules under content/ — ROOTS must keep naming it`,
  );
  check(
    'the server tier IS reachable from its adapters',
    reachable('api/contact.ts').has('server/handleSubmission.ts'),
    'api/ must keep delegating; logic that moved into the adapter is logic with no tests',
  );
}
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

// The blog's header draws the REAL 3D mark now (adr/013, amended 2026-09-04),
// and it reaches three.js through exactly one dynamic import. Both halves are
// asserted, because each failure mode is silent on its own:
//
//   - the seam DISAPPEARING makes `the blog entry never reaches graphics` above
//     vacuously true, and this file would go green on a feature that is gone;
//   - the seam going STATIC puts three.js, both decoders and the two asset files
//     into the blog chunk. The realistic cause is a type-only import: the
//     scanner records `import type` as a static edge unless its specifier string
//     is byte-identical to one an `import()` in the same file already used
//     (DYNAMIC_RE runs first, and the static loop skips what it matched). So
//     `import type { X } from './headerLogoRuntime'` beside
//     `import('./headerLogoRuntime')` is safe, and the same type from
//     `'./headerLogoRuntime.ts'` is not — a one-character difference with three
//     hundred kilobytes behind it.
// The 404 entry crosses the same seam from `NotFoundLogo`, for its hero.
{
  const HOST = 'src/blog/headerLogoRuntime.ts';
  for (const [name, entry] of [
    ['the blog', 'src/entries/blog.tsx'],
    ['the 404 page', 'src/entries/not-found.tsx'],
  ] as const) {
    check(
      `${name} IS reachable to the 3D mark, dynamically`,
      reachable(entry).has(HOST),
      'the dynamic import must stay, or the cold-document rules pass on an absent feature',
    );
    check(
      `${name} reaches the 3D mark ONLY through that dynamic seam`,
      !staticallyReachable(entry).has(HOST),
      'a static edge here puts three.js in the document chunk — check for a type-only import whose ' +
        'specifier differs from the dynamic one',
    );
  }
}

check(
  'a known edge is present',
  byFile.get('src/components/SceneCanvas.tsx')?.imports.some((i) => i.target === 'src/graphics/RenderPipeline.tsx') ===
    true,
  'SceneCanvas -> RenderPipeline, the app -> graphics edge that must exist',
);

finish();
