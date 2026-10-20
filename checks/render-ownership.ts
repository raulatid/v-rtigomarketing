/**
 * Who may draw, and who may build the expensive GPU objects.
 *
 * The scene has one renderer (R3F's), one thing that draws it
 * (`graphics/RenderPipeline.tsx`), and one Draco and one KTX2 loader
 * (`graphics/decoders.ts`). Each of those rules was held by review alone: a
 * second `gl.render()` paints over the pipeline's frame, a second renderer is a
 * second WebGL context on a platform that drops them for memory, and a second
 * loader is a second worker pool with its own WASM heap.
 *
 * Source-level, like `architecture.ts`: it reads the files and names the
 * offending one. Comments are stripped first, so prose about `gl.render()` does
 * not count. Every allowance below carries its reason; adding one should need
 * the same argument as changing the decision it belongs to
 * (docs/decisiones/render/).
 */
import fs from 'node:fs';
import path from 'node:path';
import { banner, check, finish, section } from './lib/assert';

function listSources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.posix.join(dir.replace(/\\/g, '/'), entry.name);
    if (entry.isDirectory()) listSources(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** Block and line comments out, line breaks kept so offsets stay readable. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const sources = listSources('src').map((file) => ({
  file,
  code: stripComments(fs.readFileSync(file, 'utf8')),
}));

function filesMatching(pattern: RegExp): string[] {
  return sources.filter(({ code }) => pattern.test(code)).map(({ file }) => file);
}

function only(label: string, pattern: RegExp, allowed: Record<string, string>): void {
  const found = filesMatching(pattern);
  const strays = found.filter((file) => !(file in allowed));
  check(label, strays.length === 0, strays.length ? `also in: ${strays.join(', ')}` : found.join(', '));
}

/**
 * `useFrame` calls whose second argument is present and not 0. Scanned by
 * bracket depth rather than a regex, because the first argument is a function
 * body of any size.
 */
function nonZeroFramePriorities(code: string): string[] {
  const priorities: string[] = [];
  for (let start = code.indexOf('useFrame('); start !== -1; start = code.indexOf('useFrame(', start + 1)) {
    let depth = 0;
    let topLevelComma = -1;
    let end = -1;
    for (let i = start + 'useFrame'.length; i < code.length; i += 1) {
      const c = code[i];
      if (c === '(' || c === '{' || c === '[') depth += 1;
      else if (c === ')' || c === '}' || c === ']') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      } else if (c === ',' && depth === 1) topLevelComma = i;
    }
    if (topLevelComma === -1 || end === -1) continue;
    const priority = code.slice(topLevelComma + 1, end).trim();
    if (priority !== '' && priority !== '0') priorities.push(priority);
  }
  return priorities;
}

banner('RENDER OWNERSHIP — one renderer, one drawer, one decoder of each kind');

section('1. Renderers');
only('`new WebGLRenderer` only where a second context is the decision', /new\s+(?:THREE\.)?WebGLRenderer\s*\(/, {
  // The scene's renderer is R3F's and never appears here. The blog's header
  // mark draws on its own canvas in a document with no scene
  // (docs/decisiones/blog/marca-3d-en-la-cabecera.md).
  'src/blog/headerLogoRuntime.ts': 'blog header mark',
});

section('2. Decoders');
only('`new DRACOLoader` only in graphics/decoders.ts', /new\s+(?:THREE\.)?DRACOLoader\s*\(/, {
  'src/graphics/decoders.ts': 'shared, reference-counted',
});
only('`new KTX2Loader` only in graphics/decoders.ts', /new\s+(?:THREE\.)?KTX2Loader\s*\(/, {
  'src/graphics/decoders.ts': 'shared, reference-counted',
});

section('3. Drawing');
only('`.render()` on a renderer or composer only in the pipeline', /\b(?:gl|renderer|composer)\.render\s*\(/, {
  'src/graphics/RenderPipeline.tsx': 'the only thing that draws the scene',
  // Its own renderer and canvas; see section 1.
  'src/blog/headerLogoRuntime.ts': 'blog header mark',
  // `warm()` draws once into a 1x1 render target to upload textures before
  // the city is shown; it never touches the canvas.
  'src/experiences/murcia/MurciaExperience.ts': 'warm-up into a render target',
});

{
  const offenders = sources
    .map(({ file, code }) => ({ file, priorities: nonZeroFramePriorities(code) }))
    .filter(({ file, priorities }) => priorities.length > 0 && file !== 'src/graphics/RenderPipeline.tsx');
  check(
    'no `useFrame` priority other than 0 outside the pipeline',
    offenders.length === 0,
    offenders.map(({ file, priorities }) => `${file} (${priorities.join(', ')})`).join('; ') ||
      'a priority above 0 makes R3F stop drawing; only the pipeline may take it over',
  );
  const pipeline = sources.find(({ file }) => file === 'src/graphics/RenderPipeline.tsx');
  check(
    'and the pipeline does take it over',
    !!pipeline && nonZeroFramePriorities(pipeline.code).length === 1,
    'RenderPipeline renders from one useFrame with a priority above 0',
  );
}

finish();
