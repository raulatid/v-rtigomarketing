/**
 * Formats a validated collection as a TypeScript module.
 *
 * ── Deterministic, and that is a requirement rather than a nicety ──
 * No timestamp, no build id, no source URL, no ordering that depends on when the
 * pull ran. Two runs over the same content must produce byte-identical files, for
 * three reasons that all matter:
 *
 *   1. It is how the pipeline is tested. `content:build --source=fixture` is
 *      asserted to reproduce the committed modules exactly; a timestamp would
 *      make that assertion impossible and the test would be deleted rather than
 *      fixed.
 *   2. It makes a content diff readable. A file that changes on every run tells
 *      you nothing about whether the *content* changed.
 *   3. It keeps Vite's content-hashed chunk names stable, so an unchanged
 *      collection does not invalidate a cached bundle.
 *
 * Provenance belongs in the commit or the build log, not in the artifact.
 *
 * ── JSON as the value syntax ──
 * The body is `JSON.stringify(..., 2)`, which is valid TypeScript for plain data
 * and is the only serializer here that cannot be talked into emitting code. A
 * hand-rolled TS printer would have to decide how to quote a string containing a
 * backtick, a `${`, or a line separator — and getting that wrong turns CMS text
 * into executable source. JSON.stringify has already solved it.
 */

export interface EmitSpec {
  /** File name inside the generated directory, e.g. `caseStudies.ts`. */
  file: string
  /** The exported binding, e.g. `CASE_STUDIES`. */
  exportName: string
  /** The type annotation, e.g. `CaseStudy[]`. */
  typeAnnotation: string
  /** Named type imports, resolved relative to the generated directory. */
  typeImport: { names: string[]; from: string }
  /** One-paragraph description of what the collection is, for the banner. */
  description: string
}

const BANNER = [
  '// GENERATED FILE — DO NOT EDIT.',
  '//',
  '// Written by `npm run content:build` from the source named in the build log.',
  '// Edits here are lost on the next content sync; change the content in the CMS,',
  '// or the fixtures under `content/fixtures/` for local development.',
  '//',
  '// Deliberately carries no timestamp: the emitter is deterministic so that an',
  '// unchanged collection produces an unchanged file, which is what makes a',
  '// content diff mean something and keeps chunk hashes stable.',
].join('\n')

/**
 * U+2028 and U+2029 are valid inside a JSON string but are LINE TERMINATORS to
 * some ECMAScript parsers, so a paragraph separator pasted out of a word
 * processor would emit a module that fails to parse. Spanish marketing copy
 * arriving via copy-paste is a realistic way to acquire one, and the failure
 * would appear only in the generated file — never in the fixture it came from.
 */
const JS_LINE_TERMINATORS = new RegExp('[\u2028\u2029]', 'g')

export function emitModule(spec: EmitSpec, value: unknown): string {
  const imports =
    'import type { ' + spec.typeImport.names.join(', ') + " } from '" + spec.typeImport.from + "'"

  const body = JSON.stringify(value, null, 2).replace(
    JS_LINE_TERMINATORS,
    (ch) => '\\u' + ch.charCodeAt(0).toString(16),
  )

  return [
    BANNER,
    '',
    imports,
    '',
    '/** ' + spec.description + ' */',
    'export const ' + spec.exportName + ': ' + spec.typeAnnotation + ' = ' + body,
    '',
  ].join('\n')
}
