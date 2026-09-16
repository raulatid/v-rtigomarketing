import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { getCliClient } from 'sanity/cli'

// Only the development placeholders. Preserve colours, references and other fields.
const client = getCliClient({ apiVersion: '2026-08-23' })
if (client.config().dataset !== 'development') throw new Error('Development dataset required')
const fixtures = JSON.parse(readFileSync(new URL('../../content/fixtures/service.json', import.meta.url)))
const documents = await client.fetch('*[_type == "service" && !(_id in path("drafts.**"))]{_id, _rev, title, body, measures, "slug": slug.current}')
if (documents.length !== fixtures.length) throw new Error('Unexpected service set; review before updating')
let transaction = client.transaction()
for (const fixture of fixtures) {
  const document = documents.find(item => item.slug === fixture.id)
  if (!document) throw new Error(`Missing service: ${fixture.id}`)
  transaction = transaction.patch(document._id, patch => patch.ifRevisionId(document._rev).set({
    title: fixture.title, body: fixture.body, measures: fixture.measures,
  }))
}
mkdirSync(new URL('../.out/', import.meta.url), { recursive: true })
const backup = `../.out/campus-copy-before-${Date.now()}.json`
writeFileSync(new URL(backup, import.meta.url), JSON.stringify(documents, null, 2))
await transaction.commit()
console.log(`Updated ${fixtures.length} development service placeholders; previous copy saved in ${backup}`)
