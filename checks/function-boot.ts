/**
 * Does each file under `api/` actually BOOT the way Vercel loads it?
 * `npm run check:functions`
 *
 * ── The failure this exists for ──
 *
 * On 2026-09-21 both forms answered `FUNCTION_INVOCATION_FAILED` in production,
 * for every method, and had done since the backend shipped on 09-04:
 *
 *     Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/server/endpoint'
 *       imported from /var/task/api/audit.js
 *
 * Vercel TRANSPILES each `.ts` under `api/` and its graph; it does not bundle
 * them. The emitted specifiers are the ones in the source, the package is
 * `"type": "module"`, and Node's ESM resolver requires an extension on a
 * relative import. `import { respond } from '../server/endpoint'` is legal
 * TypeScript under `moduleResolution: "bundler"` and legal for Vite, Vitest and
 * esbuild — all three bundle — and unloadable in the one place it has to run.
 *
 * ── Why no existing check could have caught it ──
 *
 * Nothing in the repository loads `api/*.ts` at all. `vite.config.ts`'s
 * `apiRouting` plugin serves `/api/*` in dev, in `vite preview` and therefore in
 * the Playwright suite by importing `server/endpoint` DIRECTLY, and the unit
 * tests reach the same module through `new Request(...)`. The four-line adapter
 * that Vercel actually invokes was the one seam nothing exercised, and the
 * bundlers' generosity about extensions is exactly what hid it.
 *
 * So this harness does not assert a spelling rule. It reproduces the platform:
 * transpile without bundling, write the output as ESM, and let NODE resolve the
 * imports. A graph Node cannot link fails here for the same reason it fails in
 * `/var/task`, whatever the cause turns out to be next time.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { banner, check, finish, section } from './lib/assert';

/** Vercel deploys EVERY file here as a route, so every file here must boot. */
const API_DIR = 'api';

interface Entry {
  /** Repo-relative source, e.g. `api/contact.ts`. */
  source: string
  /** The emitted module, as a file URL Node can import. */
  url: string
}

function apiSources(): string[] {
  return fs
    .readdirSync(API_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name))
    .map((e) => path.posix.join(API_DIR, e.name))
    .sort();
}

/**
 * Every source file the entry points reach, discovered by a REAL bundler rather
 * than by a regex of our own. The metafile's inputs are the graph; nothing else
 * here has to know how a specifier resolves.
 */
async function graphOf(entryPoints: string[]): Promise<string[]> {
  const result = await build({
    entryPoints,
    bundle: true,
    write: false,
    metafile: true,
    platform: 'node',
    format: 'esm',
    // Only OUR files are transpiled below; a dependency would be resolved from
    // node_modules at runtime exactly as it is on Vercel.
    packages: 'external',
    logLevel: 'silent',
    outdir: 'unused',
  });
  return Object.keys(result.metafile.inputs)
    .map((file) => file.replace(/\\/g, '/'))
    .filter((file) => !file.startsWith('node_modules/'));
}

/**
 * Transpiles the graph file by file — `bundle: false` is the whole point — and
 * makes the output a module package, so Node applies ESM resolution to it.
 */
async function emit(graph: string[], outdir: string): Promise<void> {
  await build({
    entryPoints: graph,
    bundle: false,
    outbase: '.',
    outdir,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  fs.writeFileSync(path.join(outdir, 'package.json'), JSON.stringify({ type: 'module' }) + '\n');
}

banner('FUNCTION BOOT — api/ loads under Node ESM, as Vercel loads it');

const sources = apiSources();
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vertigo-function-boot-'));
const entries: Entry[] = [];
let prepared = '';

try {
  const graph = await graphOf(sources);
  await emit(graph, outdir);
  for (const source of sources) {
    entries.push({
      source,
      url: pathToFileURL(path.join(outdir, source.replace(/\.ts$/, '.js'))).href,
    });
  }
  prepared = `${sources.length} route(s), ${graph.length} modules transpiled unbundled`;
} catch (error) {
  prepared = error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
section('1. The graph transpiles the way the platform transpiles it');

check(
  'every route under api/ was prepared',
  entries.length > 0 && entries.length === sources.length,
  prepared,
);

check(
  'there is a route to check at all',
  sources.length > 0,
  // A harness that silently checks nothing is the failure mode `lib/assert.ts`
  // was written about; this is the same guard one level up.
  sources.join(', ') || 'no files under api/ — did the endpoints move?',
);

// ---------------------------------------------------------------------------
section('2. Node can link each route');

interface Loaded {
  source: string
  module?: Record<string, unknown>
  error?: string
}

const loaded: Loaded[] = [];
for (const entry of entries) {
  try {
    loaded.push({ source: entry.source, module: (await import(entry.url)) as Record<string, unknown> });
  } catch (error) {
    loaded.push({
      source: entry.source,
      // ERR_MODULE_NOT_FOUND names the specifier Node could not resolve, which
      // is the one thing a reader needs to fix it.
      error: error instanceof Error ? `${error.message.split('\n')[0]}` : String(error),
    });
  }
}

for (const item of loaded) {
  check(
    `${item.source} links under Node ESM`,
    item.error === undefined,
    item.error ?? 'imported with no resolution error',
  );
}

// ---------------------------------------------------------------------------
section('3. Each route exports the handlers Vercel dispatches to');

for (const item of loaded) {
  const module = item.module ?? {};
  check(
    `${item.source} exports POST and OPTIONS`,
    typeof module.POST === 'function' && typeof module.OPTIONS === 'function',
    Object.keys(module).join(', ') || 'nothing — the module did not load',
  );
}

// ---------------------------------------------------------------------------
section('4. The handler answers, rather than merely existing');

/**
 * An EMPTY body, deliberately. It fails validation in `server/validate.ts`, so
 * the request is refused long before anything would reach Resend — this harness
 * can never send mail, whatever is exported in the shell that runs it.
 */
const EMPTY_SUBMISSION = '{}';

for (const item of loaded) {
  const post = item.module?.POST as ((request: Request) => Promise<Response>) | undefined;
  const options = item.module?.OPTIONS as ((request: Request) => Promise<Response>) | undefined;
  const url = 'https://example.test/' + item.source.replace(/\.ts$/, '');

  let postStatus = 0;
  let optionsStatus = 0;
  let detail = 'the module did not load';
  if (post !== undefined && options !== undefined) {
    try {
      postStatus = (
        await post(
          new Request(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: EMPTY_SUBMISSION,
          }),
        )
      ).status;
      optionsStatus = (await options(new Request(url, { method: 'OPTIONS' }))).status;
      detail = `POST ${postStatus}, OPTIONS ${optionsStatus}`;
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }
  }

  check(
    `${item.source} refuses an empty submission and allows OPTIONS`,
    postStatus === 422 && optionsStatus === 204,
    detail,
  );
}

fs.rmSync(outdir, { recursive: true, force: true });

// ---------------------------------------------------------------------------
finish();
