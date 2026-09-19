// The legal documents, by id — behind the legal panel's lazy chunk, on purpose.
//
// This lived in `site.ts`, beside the phones and the copyright line, and rode
// the initial JS of `/` with them: `LEGAL_DOCS` is built by a function that
// can throw, so Rollup keeps it in every chunk that imports `site.ts` — and
// App, the footer and the forms all do — although only `LegalPanel` reads it.
// Three legal texts rewritten in the CMS on 2026-09-18 grew from 6 KB to 53 KB
// and failed the deployment on INITIAL_JS_BUDGET_BYTES (vite.config.ts), a
// budget that exists for code and was being spent on prose nobody sees until
// they open the panel.
//
// `LegalPanel` is already lazy (`LazyLegalPanel.tsx`), so importing the
// generated module from here, and this only from there, puts the text where
// the panel is. `checks/architecture.ts` keeps it that way, the same way it
// keeps the blog dataset off the entry. `LegalDocId` — the set the site links
// to — stays in `site.ts`, because that is app composition, not the text.

import { LEGAL_DOCS_LIST } from './generated/legalDocs'
import type { LegalDocId } from './site'
import type { LegalDoc } from './types'

/**
 * `legalDocs.collection.ts`'s audit fails the build when any id is missing,
 * so the throw below can only fire against a hand-edited generated module. It
 * exists because the alternative is `LEGAL_DOCS[doc].title` on undefined, which
 * fails later and says less.
 */
function required(id: LegalDocId): LegalDoc {
  const doc = LEGAL_DOCS_LIST.find((entry) => entry.id === id)
  if (doc === undefined) throw new Error('legal document "' + id + '" is missing from the generated content')
  return doc
}

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  terminos: required('terminos'),
  aviso: required('aviso'),
  cookies: required('cookies'),
}
