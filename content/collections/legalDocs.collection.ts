import type { LegalBlock, LegalDoc } from '../../src/content/types'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'
import { ID_PATTERN, collectionProblems, legalDocProblems } from '../../src/content/invariants'
import { LEGAL_POLICY, richBlocks } from '../lib/portableText'
import { Report, slug, text } from '../lib/validate'
import { collection } from './types'

/**
 * The legal documents, as structured content.
 *
 * ── Why not `string[]` ──
 * Legal copy reasonably needs headings, an ordered list of the rights a visitor
 * can exercise, and a link to the data-protection authority. Storing paragraphs
 * would mean either shipping a notice that cannot say what it must, or migrating
 * legal text later — and a content migration on legal text is the kind nobody
 * wants to sign off. The stored schema is modelled for what the document needs,
 * not for what today's renderer happens to support.
 *
 * ── Structure is not HTML ──
 * `richBlocks` converts Portable Text into the small vocabulary in
 * `src/content/types.ts`, and anything outside it — an image, a raw HTML block,
 * an unknown mark, a `javascript:` link — fails the build. So the rule that
 * arbitrary CMS HTML never reaches a renderer is intact: `LegalPanel` switches
 * on `kind` and there is no `dangerouslySetInnerHTML` anywhere near it.
 *
 * ── Which documents exist is not editorial ──
 * `REQUIRED` is asserted by `audit`. The footer links two documents by name and
 * `LegalDocId` is a union in `src/content/site.ts`; a CMS that could delete one
 * would leave a link pointing at nothing. Adding a third is a code change,
 * because something has to link to it.
 */

// Shared with the Studio — see src/content/editorialBounds.ts.
const TITLE_MAX = EDITORIAL_BOUNDS.legalDoc.title

/**
 * The ids the application links to, and therefore the ones that must exist.
 * These come from fixed Sanity document ids (`legal.terms`, `legal.notice`),
 * projected to the names the UI already used.
 */
const REQUIRED = ['terminos', 'aviso'] as const

export const legalDocsCollection = collection<LegalDoc>({
  key: 'legalDocs',
  source: {
    type: 'legalDoc',
    orderBy: 'slug.current asc',
    // `body` arrives as raw Portable Text and is normalized by the mapper rather
    // than by the projection: grouping flat list runs and resolving markDefs is
    // not something GROQ should be asked to express.
    projection: `{
      "id": slug.current,
      title,
      body
    }`,
  },

  map(raw, index) {
    const report = new Report('')
    if (raw === null || typeof raw !== 'object') {
      report.fail('[' + index + ']', 'expected an object')
      return { ok: false, problems: report.problems }
    }
    const source = raw as Record<string, unknown>

    const id = slug(report, 'id', source.id, ID_PATTERN)
    const at = id ?? '[' + index + ']'
    const scoped = new Report(at)

    const title = text(scoped, 'title', source.title, { max: TITLE_MAX })
    const body = richBlocks(scoped, 'body', source.body, LEGAL_POLICY)

    // The legal vocabulary is narrower than the shared one: a pull quote in a
    // privacy notice is a formatting accident, not a document.
    const legalBody: LegalBlock[] = []
    if (body !== undefined) {
      body.forEach((block, i) => {
        if (block.kind === 'quote') {
          scoped.fail('body[' + i + ']', 'a quote block is not allowed in a legal document')
          return
        }
        legalBody.push(block)
      })
    }

    const problems = [...report.problems, ...scoped.problems]
    if (problems.length > 0 || id === undefined || title === undefined || body === undefined) {
      return { ok: false, problems }
    }

    const value: LegalDoc = { id, title, body: legalBody }

    const residual = legalDocProblems(value)
    if (residual.length > 0) return { ok: false, problems: residual }

    return { ok: true, value }
  },

  audit(items) {
    const problems = collectionProblems(items, 'legalDocs')
    const present = new Set(items.map((item) => item.id))
    for (const id of REQUIRED) {
      if (!present.has(id)) {
        problems.push({
          path: 'legalDocs.' + id,
          message:
            'is required — the site footer links to it by name, and without it that link ' +
            'points at nothing',
        })
      }
    }
    return problems
  },

  emit: {
    file: 'legalDocs.ts',
    exportName: 'LEGAL_DOCS_LIST',
    typeAnnotation: 'LegalDoc[]',
    typeImport: { names: ['LegalDoc'], from: '../types' },
    description: 'Legal documents, as published. See content/collections/legalDocs.collection.ts.',
  },
})
