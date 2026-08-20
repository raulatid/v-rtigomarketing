import fs from 'node:fs'
import path from 'node:path'
import type { AnyCollection } from '../collections/types'
import type { Problem } from './validate'
import { emitModule } from './emit'
import { SourceError, type ContentSource } from './source'

/**
 * The content build: fetch every collection, map every record, validate the whole
 * set, and write only if all of it is good.
 *
 * ── All-or-nothing, at two levels ──
 * A single invalid record fails its whole COLLECTION, and a single failed
 * collection fails the whole BUILD. Neither is pedantry:
 *
 *   Publishing five of six case studies because the sixth had a bad chart is a
 *   silent content outage. The globe would render five satellites and look
 *   deliberate — there is no error state that says "one of these is missing".
 *
 *   Writing case studies but not districts leaves the two collections describing
 *   different moments, and the manifest agreeing with neither. An interrupted run
 *   must leave the previous state exactly as it was.
 *
 * ── Written through a temp directory ──
 * Files are emitted to a sibling temp directory and moved into place only after
 * every collection has mapped, audited and rendered. The move is per-file rather
 * than a directory swap, because a directory rename is not atomic across all
 * filesystems and a half-swapped directory is the state this is preventing.
 */

export interface GenerateOptions {
  collections: readonly AnyCollection[]
  source: ContentSource
  /** Where the modules land, e.g. `src/content/generated`. */
  outDir: string
  log?: (message: string) => void
}

export interface CollectionResult {
  key: string
  count: number
}

export interface GenerateSuccess {
  ok: true
  source: string
  collections: CollectionResult[]
  /** Files whose contents differ from what was already on disk. */
  changed: string[]
}

export interface GenerateFailure {
  ok: false
  source: string
  /** Grouped by collection key, in registry order. */
  failures: Array<{ key: string; problems: Problem[] }>
}

export type GenerateResult = GenerateSuccess | GenerateFailure

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const log = options.log ?? (() => {})
  const { collections, source, outDir } = options

  log('content source: ' + source.describe)

  const rendered: Array<{ file: string; contents: string; key: string; count: number }> = []
  const failures: GenerateFailure['failures'] = []

  for (const collection of collections) {
    let records: unknown[]
    try {
      records = await source.fetchAll(collection.source)
    } catch (error) {
      // A source failure is not a content problem and must not be reported as
      // one — "the CMS is unreachable" and "this case study has no summary" want
      // completely different responses from whoever is reading the log.
      if (error instanceof SourceError) throw error
      throw new SourceError(collection.key + ': ' + String(error))
    }

    const items: Array<{ id: string }> = []
    const problems: Problem[] = []

    records.forEach((record, index) => {
      const result = collection.map(record, index)
      if (result.ok) items.push(result.value)
      else problems.push(...result.problems)
    })

    // Collection-level checks run even when records failed, so one build reports
    // both "this record is broken" and "these two share an id".
    problems.push(...collection.audit(items))

    if (problems.length > 0) {
      failures.push({ key: collection.key, problems })
      continue
    }

    rendered.push({
      key: collection.key,
      count: items.length,
      file: collection.emit.file,
      contents: emitModule(collection.emit, items),
    })
    log('  ' + collection.key + ': ' + items.length + ' records')
  }

  if (failures.length > 0) {
    return { ok: false, source: source.describe, failures }
  }

  const changed = commit(rendered, outDir)
  return {
    ok: true,
    source: source.describe,
    collections: rendered.map(({ key, count }) => ({ key, count })),
    changed,
  }
}

/**
 * Moves the rendered files into place, and reports which ones actually changed.
 *
 * The comparison is what makes the emitter's determinism pay off: an unchanged
 * collection produces byte-identical output, so "nothing changed" is a fact the
 * build can state rather than a guess. It also keeps Vite's content hashes stable
 * across a no-op sync.
 */
function commit(
  rendered: Array<{ file: string; contents: string }>,
  outDir: string,
): string[] {
  const tempDir = outDir + '.tmp'
  fs.rmSync(tempDir, { recursive: true, force: true })
  fs.mkdirSync(tempDir, { recursive: true })

  try {
    for (const entry of rendered) {
      fs.writeFileSync(path.join(tempDir, entry.file), entry.contents, 'utf8')
    }

    fs.mkdirSync(outDir, { recursive: true })
    const changed: string[] = []
    for (const entry of rendered) {
      const target = path.join(outDir, entry.file)
      const previous = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null
      if (previous !== entry.contents) changed.push(entry.file)
      fs.renameSync(path.join(tempDir, entry.file), target)
    }
    return changed
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

/** Human-readable failure text, grouped so one collection's problems read together. */
export function formatFailures(result: GenerateFailure): string {
  const lines: string[] = []
  for (const failure of result.failures) {
    lines.push('')
    lines.push(failure.key + ' — ' + failure.problems.length + ' problem(s):')
    for (const problem of failure.problems) {
      lines.push('  ' + problem.path + ': ' + problem.message)
    }
  }
  return lines.join('\n')
}
