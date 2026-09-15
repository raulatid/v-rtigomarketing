import { CogIcon } from '@sanity/icons/Cog'
import { ComposeIcon } from '@sanity/icons/Compose'
import { DocumentTextIcon } from '@sanity/icons/DocumentText'
import { DocumentsIcon } from '@sanity/icons/Documents'
import { EarthGlobeIcon } from '@sanity/icons/EarthGlobe'
import { PinIcon } from '@sanity/icons/Pin'
import { WrenchIcon } from '@sanity/icons/Wrench'
import { esESLocale } from '@sanity/locale-es-es'
import type { ComponentType } from 'react'
import { defineConfig } from 'sanity'
import { structureTool, type StructureBuilder } from 'sanity/structure'
import { schemaTypes } from './schemas'
import { EditorialHome } from './components/EditorialHome'
import { DocumentPreview } from './components/DocumentPreview'

function documentViews(S: StructureBuilder) {
  return [S.view.form().title('Editar'), S.view.component(DocumentPreview).title('Vista previa').id('preview')]
}

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
interface Singleton {
  id: string
  type: string
  title: string
  icon: ComponentType
}

const SETTINGS: Singleton = {
  id: 'siteSettings',
  type: 'siteSettings',
  title: 'Ajustes del sitio',
  icon: CogIcon,
}

const LEGAL: Singleton[] = [
  { id: 'legal-terms', type: 'legalDoc', title: 'Términos y privacidad', icon: DocumentTextIcon },
  { id: 'legal-notice', type: 'legalDoc', title: 'Aviso legal', icon: DocumentsIcon },
  { id: 'legal-cookies', type: 'legalDoc', title: 'Política de cookies', icon: DocumentTextIcon },
]

const SINGLETONS = [SETTINGS, ...LEGAL]

/** One singleton as a menu row that opens its one document directly. */
function singletonItem(S: StructureBuilder, entry: Singleton) {
  return S.listItem()
    .title(entry.title)
    .id(entry.id)
    .icon(entry.icon)
    .child(S.document().schemaType(entry.type).documentId(entry.id).title(entry.title).views(documentViews(S)))
}

/**
 * Types an editor may edit but never create, duplicate or delete.
 *
 * The singletons, for the reason above. And `district`: its identifier must
 * match a binding in `cityDistrictBindings.ts`, so a district created here would
 * never appear in the 3D city — there is exactly one, and it is welded to the
 * scene. Its TEXT is fully editorial; its existence is not.
 */
const LOCKED_TYPES = new Set([...SINGLETONS.map((entry) => entry.type), 'district'])

/**
 * Reads a required Studio variable, or explains how to set it.
 *
 * Without this, an unset value falls through to Sanity's own
 * "Configuration must contain `projectId`" — which is accurate and tells you
 * nothing about WHERE to put it. There are three traps it does not mention:
 *
 *   1. The repository root's `.env` is NOT this package's. The Sanity CLI loads
 *      `.env` files from the STUDIO directory, via Vite's `loadEnv`.
 *   2. Only the `SANITY_STUDIO_` prefix is exposed. `SANITY_PROJECT_ID` — the
 *      name the content build uses at the repo root — is invisible here, and
 *      deliberately so: that prefix is what marks a value as safe to compile
 *      into the Studio bundle, and the build's variables must never be.
 *   3. And the one that made this helper break the Studio it was written to
 *      explain: THE READ MUST BE A LITERAL `process.env.SANITY_STUDIO_…`. This
 *      file is compiled into the BROWSER bundle, where the values arrive as
 *      Vite `define` entries keyed on exactly that text
 *      (`getStudioEnvironmentVariables({prefix: 'process.env.'})` in
 *      @sanity/cli-build). `define` is a text substitution: a computed
 *      `process.env[name]` is not the expression it replaces, so it survives
 *      into the bundle as `{}[name]` — undefined however the .env is filled in,
 *      and the throw below then fires unconditionally. Never a computed key,
 *      never destructured off `process.env`. Which is why the value is passed
 *      in here rather than read here.
 */
function required(name: string, value: string | undefined): string {
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

  // Both written out in full: the bundler substitutes these literal expressions
  // and nothing else (trap 3 above).
  projectId: required('SANITY_STUDIO_PROJECT_ID', process.env.SANITY_STUDIO_PROJECT_ID),
  // Not defaulted to `production`, for the same reason the content build refuses
  // to guess a dataset: a default is how you end up editing live client content
  // while believing you are in a scratch dataset.
  dataset: required('SANITY_STUDIO_DATASET', process.env.SANITY_STUDIO_DATASET),

  plugins: [
    structureTool({
      defaultDocumentNode: (S) => S.document().views(documentViews(S)),
      // Ordered the way an editor meets the site, not alphabetically, and named
      // in the site's words rather than the scene's: nobody outside the code
      // calls the services campus a "distrito".
      //
      // The district and the services share one folder because they are one
      // thing on the site — the section, and its stops. The district is shown
      // as a list (of one) rather than opened by id: an id typed here that did
      // not match the stored document would open a blank one, and publishing it
      // would create the second district the build refuses.
      //
      // The legal documents share a folder because three near-identical rows at
      // the root read as noise; "Ajustes del sitio" stays at the root because it
      // is the singleton an editor actually opens.
      structure: (S: StructureBuilder) =>
        S.list()
          .title('Contenido de la web')
          .items([
            S.listItem().title('Inicio y ayuda').id('inicio').icon(ComposeIcon).child(S.component(EditorialHome).id('inicio').title('Inicio y ayuda')),
            S.documentTypeListItem('caseStudy').title('Casos de éxito').icon(EarthGlobeIcon),
            S.listItem()
              .title('Servicios')
              .id('servicios')
              .icon(WrenchIcon)
              .child(
                S.list()
                  .title('Servicios')
                  .items([
                    S.documentTypeListItem('district')
                      .title('Presentación y orden de los servicios')
                      .icon(PinIcon),
                    S.documentTypeListItem('service').title('Todos los servicios').icon(WrenchIcon),
                  ]),
              ),
            S.listItem()
              .title('Blog')
              .id('blog')
              .icon(ComposeIcon)
              .child(
                S.documentTypeList('blogPost')
                  .title('Entradas del blog')
                  .defaultOrdering([{ field: 'publishedAt', direction: 'desc' }]),
              ),
            S.divider(),
            singletonItem(S, SETTINGS),
            S.listItem()
              .title('Textos legales')
              .id('legal')
              .icon(DocumentsIcon)
              .child(
                S.list()
                  .title('Textos legales')
                  .items(LEGAL.map((entry) => singletonItem(S, entry))),
              ),
          ]),
    }),
    // The whole Studio chrome — Publicar, Descartar cambios, Añadir elemento,
    // every built-in validation message — in Spanish. Our own field titles and
    // descriptions were always Spanish; this is the shell around them.
    esESLocale(),
  ],

  // Native features: Sanity checks plan eligibility and permissions. No paid plan is purchased here.
  tasks: { enabled: true },
  scheduledDrafts: { enabled: true },

  schema: {
    types: schemaTypes,
    // Keeps a locked type out of the global "create new" menu. The build is what
    // actually enforces the counts; this only stops the accident.
    templates: (prev) => prev.filter((template) => !LOCKED_TYPES.has(template.schemaType)),
  },

  document: {
    actions: (prev, context) =>
      LOCKED_TYPES.has(context.schemaType)
        ? prev.filter((action) => action.action !== 'duplicate' && action.action !== 'delete')
        : prev,
  },
})
