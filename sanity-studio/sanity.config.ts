import { defineConfig } from 'sanity'
import { structureTool, type StructureBuilder } from 'sanity/structure'
import { schemaTypes } from './schemas'

/**
 * The singletons.
 *
 * Presented as a single editable document rather than a list with a "create"
 * button, and removed from the generic document list so the only way in is the
 * one that leads to the right document.
 *
 * This is a CONVENIENCE, not a guarantee. `siteSettings.collection.ts` and
 * `legalDocs.collection.ts` assert the same invariants at build time, because a
 * restored backup, a re-run import or the HTTP API can all produce a second
 * document that this structure never showed anybody.
 */
const SINGLETONS = [
  { id: 'siteSettings', type: 'siteSettings', title: 'Ajustes del sitio' },
  { id: 'legal.terms', type: 'legalDoc', title: 'Términos y privacidad' },
  { id: 'legal.notice', type: 'legalDoc', title: 'Aviso legal' },
]

const SINGLETON_TYPES = new Set(SINGLETONS.map((entry) => entry.type))

/**
 * Reads a required Studio variable, or explains how to set it.
 *
 * Without this, an unset value falls through to Sanity's own
 * "Configuration must contain `projectId`" — which is accurate and tells you
 * nothing about WHERE to put it. There are two traps it does not mention:
 *
 *   1. The repository root's `.env` is NOT this package's. The Sanity CLI loads
 *      `.env` files from the STUDIO directory, via Vite's `loadEnv`.
 *   2. Only the `SANITY_STUDIO_` prefix is exposed. `SANITY_PROJECT_ID` — the
 *      name the content build uses at the repo root — is invisible here, and
 *      deliberately so: that prefix is what marks a value as safe to compile
 *      into the Studio bundle, and the build's variables must never be.
 */
function required(name: 'SANITY_STUDIO_PROJECT_ID' | 'SANITY_STUDIO_DATASET'): string {
  const value = process.env[name]
  if (value === undefined || value.trim() === '') {
    throw new Error(
      name +
        ' is not set. Create sanity-studio/.env (NOT the repository root .env, and not ' +
        '.env.example, which is only a template) containing:\n\n' +
        '  SANITY_STUDIO_PROJECT_ID=<your project id>\n' +
        '  SANITY_STUDIO_DATASET=<your dataset, e.g. production>\n\n' +
        'The SANITY_STUDIO_ prefix is required: the CLI exposes no other variables ' +
        'to the Studio. See sanity-studio/README.md.',
    )
  }
  return value.trim()
}

export default defineConfig({
  name: 'vertigo',
  title: 'Vertigo',

  projectId: required('SANITY_STUDIO_PROJECT_ID'),
  // Not defaulted to `production`, for the same reason the content build refuses
  // to guess a dataset: a default is how you end up editing live client content
  // while believing you are in a scratch dataset.
  dataset: required('SANITY_STUDIO_DATASET'),

  plugins: [
    structureTool({
      structure: (S: StructureBuilder) =>
        S.list()
          .title('Contenido')
          .items([
            S.documentTypeListItem('caseStudy').title('Casos de éxito'),
            S.documentTypeListItem('service').title('Servicios'),
            S.documentTypeListItem('district').title('Distritos'),
            S.documentTypeListItem('blogPost').title('Blog'),
            S.divider(),
            ...SINGLETONS.map((entry) =>
              S.listItem()
                .title(entry.title)
                .id(entry.id)
                .child(S.document().schemaType(entry.type).documentId(entry.id).title(entry.title)),
            ),
          ]),
    }),
  ],

  schema: {
    types: schemaTypes,
    // Keeps a singleton out of the global "create new" menu. The build is what
    // actually enforces the count; this only stops the accident.
    templates: (prev) => prev.filter((template) => !SINGLETON_TYPES.has(template.schemaType)),
  },

  document: {
    actions: (prev, context) =>
      SINGLETON_TYPES.has(context.schemaType)
        ? prev.filter((action) => action.action !== 'duplicate' && action.action !== 'delete')
        : prev,
  },
})
