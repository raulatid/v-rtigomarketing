import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Turns `content/fixtures/` into an NDJSON dataset.
 *
 *   npm run import-fixtures
 *   npx sanity dataset import .out/seed.ndjson production --replace
 *
 * ── Why this exists ──
 * A fresh dataset seeded from the fixtures starts as the exact content the
 * repository already builds and tests against, which is what makes the migration
 * parity check meaningful: generate from fixtures, generate from Sanity, diff
 * `src/content/generated/`. For the collections migrated first, that diff should
 * be empty. Hand-typing the same content into the Studio would produce a diff
 * full of typos and prove nothing.
 *
 * ── Document ids are deterministic ──
 * `caseStudy-satellite-01`, `service-seo`, and the fixed singletons. Re-running
 * the import updates the same documents rather than duplicating them, and
 * district references can be written without a lookup step.
 *
 * ── _key values are derived, not random ──
 * Sanity requires a `_key` on every array member. Deriving them from position
 * keeps the output byte-identical across runs, so re-importing an unchanged
 * fixture is a no-op rather than a dataset full of churn.
 *
 * Deliberately dependency-free and plain `.mjs`: it runs with node before this
 * package has been installed.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.resolve(HERE, '..', '..', 'content', 'fixtures')
const OUT_DIR = path.resolve(HERE, '..', '.out')
const OUT_FILE = path.join(OUT_DIR, 'seed.ndjson')

/**
 * Fixed ids for the documents the application addresses by name.
 *
 * NO DOTS. A dot in an _id puts the document in a namespace that
 * unauthenticated reads cannot see: Sanity reserves the segment before a dot
 * for drafts. and versions.<release>., and a document in any other namespace is
 * invisible to a public query while remaining perfectly visible to the
 * authenticated CLI and the Studio. The content build reads anonymously, so a
 * dotted id yields 'collection is empty' with no error anywhere.
 *
 * Verified empirically: two documents of the same type imported together,
 * 'probeDotless' and 'probe.dotted' — anonymous saw only the first.
 */
const LEGAL_IDS = { terminos: 'legal-terms', aviso: 'legal-notice', cookies: 'legal-cookies' }

function read(name) {
  const file = path.join(FIXTURES, name + '.json')
  if (!fs.existsSync(file)) {
    throw new Error('no fixture at ' + file + ' — run this from sanity-studio/')
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const keyed = (items, prefix) =>
  items.map((item, i) => ({ _key: prefix + '-' + i, ...item }))

/**
 * Portable Text needs a `_key` on every block, every span and every markDef.
 * The fixtures carry the shape without them, since the build's ingestion does
 * not care; Sanity's editor does.
 */
function portableText(blocks, prefix) {
  return blocks.map((block, i) => {
    const at = prefix + '-' + i
    if (block._type !== 'block') return { _key: at, ...block }
    return {
      ...block,
      _key: at,
      ...(block.markDefs ? { markDefs: keyed(block.markDefs, at + '-def') } : {}),
      children: keyed(block.children ?? [], at + '-span'),
    }
  })
}

/**
 * The fixture keeps the website's chart model — `values[]` plus optional
 * `labels[]` — while the Studio stores ONE list of `{label, value}` points, so
 * an editor never keeps two lists aligned by hand. The GROQ projection splits
 * them back; this is the inverse, for seeding.
 */
function chartPoints(chart) {
  const { values = [], labels, ...rest } = chart
  return {
    ...rest,
    points: values.map((value, i) => ({
      _key: 'p-' + i,
      _type: 'point',
      value,
      ...(Array.isArray(labels) && labels[i] !== undefined ? { label: labels[i] } : {}),
    })),
  }
}

const docs = []

for (const record of read('caseStudy')) {
  docs.push({
    _id: 'caseStudy-' + record.id,
    _type: 'caseStudy',
    slug: { _type: 'slug', current: record.id },
    name: record.name,
    label: record.label,
    brandColor: record.brandColor,
    sector: record.sector,
    location: record.location,
    year: record.year,
    summary: record.summary,
    details: record.details,
    metrics: keyed(record.metrics, 'metric'),
    chart: chartPoints(record.chart),
    // `isotype` and `logo` are omitted on purpose: every fixture has both null,
    // and an image field needs a real uploaded asset reference rather than a
    // path.
    //
    // CONSEQUENCE: `sanity dataset import --replace` overwrites the WHOLE
    // document, so reseeding detaches any brand artwork an editor attached in
    // the Studio (the asset files survive in the media library, orphaned). It
    // detaches BOTH, which at least leaves the pair consistent — the content
    // build rejects a case study carrying one without the other. This script is
    // for a fresh dataset. Once editing has begun, edits go through the Studio.
  })
}

for (const record of read('service')) {
  docs.push({
    _id: 'service-' + record.id,
    _type: 'service',
    slug: { _type: 'slug', current: record.id },
    title: record.title,
    body: record.body,
  })
}

for (const record of read('district')) {
  docs.push({
    _id: 'district-' + record.id,
    _type: 'district',
    slug: { _type: 'slug', current: record.id },
    label: record.label,
    summary: record.summary,
    intro: record.intro,
    // References, not inline copy. The fixture carries the dereferenced shape
    // because `fileSource` cannot dereference; the dataset carries the real
    // reference, and a broken one fails the build naming this district.
    services: record.services.map((service, i) => ({
      _key: 'service-' + i,
      _type: 'reference',
      _ref: 'service-' + service.id,
    })),
  })
}

for (const record of read('siteSettings')) {
  docs.push({
    _id: 'siteSettings',
    _type: 'siteSettings',
    phones: keyed(record.phones, 'phone'),
    contactEmail: record.contactEmail,
    copyright: record.copyright,
  })
}

for (const record of read('legalDoc')) {
  const id = LEGAL_IDS[record.id]
  if (id === undefined) {
    throw new Error('legal document "' + record.id + '" has no fixed Sanity id in LEGAL_IDS')
  }
  docs.push({
    _id: id,
    _type: 'legalDoc',
    slug: { _type: 'slug', current: record.id },
    title: record.title,
    body: portableText(record.body, 'b'),
  })
}

for (const record of read('blogPost')) {
  docs.push({
    _id: 'blogPost-' + record.id,
    _type: 'blogPost',
    slug: { _type: 'slug', current: record.id },
    title: record.title,
    excerpt: record.excerpt,
    publishedAt: record.publishedAt,
    tags: record.tags,
    body: portableText(record.body, 'b'),
  })
}

fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(OUT_FILE, docs.map((doc) => JSON.stringify(doc)).join('\n') + '\n')

console.log('[studio] wrote ' + docs.length + ' documents to ' + OUT_FILE)
console.log('[studio] next: npx sanity dataset import .out/seed.ndjson <dataset> --replace')
