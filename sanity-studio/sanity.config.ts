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

export default defineConfig({
  name: 'vertigo',
  title: 'Vertigo',

  projectId: process.env.SANITY_STUDIO_PROJECT_ID ?? '',
  dataset: process.env.SANITY_STUDIO_DATASET ?? 'production',

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
