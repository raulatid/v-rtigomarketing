import type { ValidationContext } from 'sanity'

/**
 * There is exactly ONE highlighted case at a time — both halves.
 *
 * The highlighted case is the satellite whose halo breathes brighter in the
 * overview and the one the hover tutorial points at. Two of them would give the
 * tutorial two targets; none would leave the visitor with no worked example.
 * The content build refuses both (`highlightedCaseProblems`); this guards both
 * here too, so the editor finds out before publishing rather than from a
 * failed deploy. Until 2026-09-19 only "a second one" was guarded, and
 * unticking the only one published cleanly.
 *
 * ── Drafts count, on purpose ──
 * What is compared is each OTHER case as it will be once published: its draft
 * if it has one, its published version otherwise. That is what makes moving
 * the highlight possible at all — tick the new case, untick the old, and each
 * document's rule sees the other's intent. Compared against published copies
 * only, the two edits would block each other. Own document is excluded by id
 * so re-saving the current highlight stays valid.
 *
 * Publishing the pair still means two deployments: the first sees zero or two
 * highlighted and fails, the second sees one and heals it. GUIA-EDITOR.md says
 * to publish them one after the other.
 */
interface CaseRow { _id: string; highlighted?: boolean | null; name?: string | null }

export async function highlightedCaseUnique(value: unknown, context: ValidationContext): Promise<true | string> {
  const ownId = String(context.document?._id ?? '').replace(/^drafts\./, '')
  let rows: CaseRow[]
  try {
    rows = await context.getClient({apiVersion: '2026-08-23'}).fetch<CaseRow[]>(
      '*[_type == "caseStudy"]{_id, highlighted, name}',
      {},
      {perspective: 'raw'},
    )
  } catch {
    return 'No se ha podido comprobar el caso resaltado. Revisa la conexión y vuelve a intentarlo antes de publicar.'
  }
  const others = effectiveOthers(rows, ownId).filter((row) => row.highlighted === true)

  if (value === true) {
    if (others.length === 0) return true
    return (
      'Ya hay un caso resaltado: «' + (others[0].name ?? others[0]._id) + '». Solo puede haber uno. ' +
      'Desmarca «Este es el caso resaltado» en ese caso, y publica los dos seguidos.'
    )
  }
  if (others.length > 0) return true
  return (
    'Este es el único caso resaltado, y tiene que haber siempre uno. ' +
    'Marca antes otro caso como resaltado, y publica los dos seguidos.'
  )
}

/** One row per other case: its draft when it has one, else its published copy. Exported for the test. */
export function effectiveOthers(rows: readonly CaseRow[], ownId: string): CaseRow[] {
  const byBase = new Map<string, CaseRow>()
  for (const row of rows) {
    const isDraft = row._id.startsWith('drafts.')
    const base = isDraft ? row._id.slice('drafts.'.length) : row._id
    if (base === ownId) continue
    const current = byBase.get(base)
    if (current === undefined || isDraft) byBase.set(base, {...row, _id: base})
  }
  return Array.from(byBase.values())
}
