# Sanity field contract

What the content build expects from the CMS. The authority is `content/collections/*.collection.ts` — this document explains it; the mappers enforce it.

Nothing here is advisory. A field that does not satisfy its rule **fails the build**, which means the deployment fails and the previous one keeps serving. That is deliberate: a publish that cannot be validated must not report success.

Media has its own document, `sanity-media-contract.md`, because "what may this field contain" and "where does the file live and who serves it" are different questions and folding the second into the first is how the media rules end up read by nobody.

---

## How the content reaches the site

```
Sanity publish → webhook → Vercel Deploy Hook → Vercel build
                                                  └─ npm run content:build   (query, validate, emit)
                                                  └─ npm run check           (the same invariants, again, on what was written)
                                                  └─ vite build
```

The browser never calls Sanity. Content is fetched in Node at build time and emitted as TypeScript modules, so there is no runtime request, no loading state, no CORS and no CSP change — which is the point, on a site whose product is a 3D scene.

**Consequence for editors:** a change is live one build after publishing, not instantly. And because Sanity's query API is eventually consistent with recent mutations, a build that starts within a second or two of publishing may in rare cases read the state just before it. If a publish appears not to have landed, re-deploying is the fix; see `adr/011`.

---

## The projection is the contract

Each collection sends one GROQ query. The projection in `content/collections/*.collection.ts` names exactly the fields the site uses, flattens them, and renames what needs renaming:

```groq
*[_type == "caseStudy" && !(_id in path("drafts.**"))]
  | order(slug.current asc)
  { "id": slug.current, label, name, "isotype": isotype.asset->url, "logo": logo.asset->url, ... }
  [0...1001]
```

Three consequences worth knowing:

- **A field the schema has and the projection does not is invisible to the site.** Adding a field in the Studio does nothing until the projection selects it.
- **A field the projection selects and the schema does not define arrives as `null`** and fails the build. Change them together.
- **Drafts are filtered out at the source.** A document that is not published does not exist as far as the site is concerned, and a reference to one is a broken reference.

Ordering is explicit on every collection, because byte-identical output for unchanged content is what makes "no file changed" mean anything. Each collection is capped at 1000 documents; the 1001st fails the build rather than being silently dropped.

---

## `caseStudy`

Six of these ride the orbits around the Earth. Ordered by slug.

| Field | Type | Rule | On violation |
|---|---|---|---|
| `slug.current` | slug | `^[a-z0-9][a-z0-9-]{0,63}$`, unique | fail |
| `name` | string | non-empty, ≤ 60 | fail |
| `label` | string | ≤ 60; falls back to `name` | fail if over |
| `isotype` | image | PNG/WebP, ≥ 432×432, aspect 0.75–1.33:1; mirrored to `/logos/` at build | fail if declared and unfetchable, or off-spec |
| `logo` | image | PNG/WebP, ≥ 900×400, aspect 1.5–5:1; mirrored to `/logos/` at build | fail if declared and unfetchable, or off-spec |
| `isotype` + `logo` | — | both present or both absent — they are one decision | fail |
| `brandColor` | string | `#rrggbb` | fail |
| `sector` | string | non-empty, ≤ 60 | fail |
| `location` | string | non-empty, ≤ 60 | fail |
| `year` | string | non-empty, ≤ 16 | fail |
| `summary` | text | non-empty, ≤ 400 | fail |
| `details[]` | string[] | ≤ 4 entries, each non-empty and ≤ 200 | fail |
| `metrics[]` | object[] | **exactly 2**, each `{ label ≤ 40, value ≤ 20 }` | fail |
| `chart.type` | string | `line` \| `bars` \| `area` \| `donut` | fail |
| `chart.title` | string | non-empty, ≤ 80 | fail |
| `chart.values[]` | number[] | 1–16 finite numbers | fail |
| `chart.labels[]` | string[] | **required for `bars` and `donut`**, one per value, each ≤ 24 | fail |

**In the Studio the chart is entered as ONE list of points**, each `{ value, label }`, so an editor never keeps two lists aligned by hand; the projection splits them back into `values` and `labels` (`"labels": select(type in ["bars","donut"] => points[].label)`, which yields `null` for line and area charts — treated as "no labels"). The two rows above describe what the build receives, not what the editor types.

**No orbit field, and there will not be one.** Which case study occupies which orbit is scene composition and lives in `src/experiences/earth/orbit/orbitAssignments.ts`. Publishing a case study does not create an orbit — the Earth has a finite, art-directed set of slots. An assignment naming a case the CMS no longer publishes fails the build.

**The slug is a reference, not a label.** `orbitAssignments.ts` names it. Changing a published slug breaks that binding and fails the build; that is the intended behaviour, not a bug to work around.

**The lengths are layout facts.** `details` is a four-line bullet list, `metrics` is a fixed two-up grid, and chart values are normalised into 340 SVG units. Over-length is rejected rather than trimmed, because a sentence cut mid-word reads as a rendering bug and the person who can fix it properly is the person who wrote it.

**A bars or donut chart with no labels does not fail to draw — it draws wrong**, unlabelled, which is quieter and worse. Hence the rule.

---

## `service`

What the agency does. First-class documents, referenced by districts. Ordered by slug.

| Field | Type | Rule | On violation |
|---|---|---|---|
| `slug.current` | slug | `^[a-z0-9][a-z0-9-]{0,63}$`, unique | fail |
| `title` | string | non-empty, ≤ 60 | fail |
| `body` | text | non-empty, ≤ 900 | fail |

**The slug becomes an `aria-controls` value.** A space or a capital breaks the district accordion for screen-reader users and for nobody else, which is why it is asserted rather than reviewed.

**`SERVICES` is emitted but nothing imports it yet.** The collection exists so a services page has data the day it is built.

---

## `district`

The copy behind each interactive area of the city. Ordered by slug.

| Field | Type | Rule | On violation |
|---|---|---|---|
| `slug.current` | slug | must match a `contentId` in `cityDistrictBindings.ts` | fail |
| `label` | string | non-empty, ≤ 40 | fail |
| `summary` | text | non-empty, **≤ 140** | fail |
| `intro` | text | non-empty, ≤ 600 | fail |
| `services[]` | reference[] | 1–12 published `service` documents, no duplicates | fail |

**The 140-character summary is a layout fact, not a style preference.** It is what shows at the mobile peek stop, where the sheet is 40% of the viewport tall.

**A district needs at least one service.** The panel opens its first section on show; with none it opens nothing and looks broken rather than empty.

**An unresolved reference fails the build, naming the district and the position:**

```
districts — 1 problem(s):
  servicios.services[2]: unresolved service reference — the referenced service
                         document is missing, unpublished, or still a draft
```

That happens when a referenced service was deleted or was never published. Publishing the service fixes it. A missing accordion section would read as an editorial choice, which is why this is loud.

**No scene data here.** No Blender node names, no camera yaw, no world rectangles — those live in `cityDistrictBindings.ts` and change when the GLB is re-exported, not when marketing writes.

---

## `siteSettings` — singleton

One document, at the fixed id `siteSettings`.

| Field | Type | Rule | On violation |
|---|---|---|---|
| `phones[]` | object[] | 1–4 entries | fail |
| `phones[].display` | string | non-empty, ≤ 40; format it however it reads best | fail |
| `phones[].tel` | string | `^\+?[0-9]{6,20}$` — **digits only** | fail |
| `contactEmail` | string | a real email address | fail |
| `copyright` | string | non-empty, ≤ 120 | fail |

**`display` and `tel` are different values on purpose.** `display` is read by a human; `tel` is dialled. A space in `tel` produces a link that silently does nothing on some handsets rather than failing visibly.

**Exactly one document, asserted by the build.** The Studio hides the "create another" button, but a restored backup or the HTTP API can produce a second one the Studio never shows. `src/content/site.ts` reads the first, so two documents would mean half the site quietly using one and nothing using the other. Zero documents also fails: an empty response is an outage, not a decision to delete the agency's phone number.

---

## `legalDoc` — two fixed documents

At the fixed ids `legal-terms` and `legal-notice`, with slugs `terminos` and `aviso`.

**No document id may contain a dot.** Sanity reserves the segment before a dot for `drafts.` and `versions.<release>.`; a document in any other namespace is invisible to unauthenticated queries while staying visible to the Studio and the authenticated CLI. Since the content build reads anonymously, a dotted id produces `collection is empty` with no error anywhere to explain it.

| Field | Type | Rule | On violation |
|---|---|---|---|
| `slug.current` | slug | `terminos` or `aviso` | fail if either is absent |
| `title` | string | non-empty, ≤ 80 | fail |
| `body` | `legalBody` | 1–120 blocks; see below | fail |

`legalBody` allows exactly:

| Allowed | Not allowed |
|---|---|
| paragraph | images |
| heading (`h2`, `h3`) | embeds, video |
| bullet and numbered lists | quotes |
| **bold**, *italic* | raw HTML, any other block or mark |
| links to `https:` and `mailto:` | `javascript:`, `data:`, `http:` links |

**Both documents must exist.** The footer links them by name; a deleted one leaves a link pointing at nothing. Which documents exist is app composition — the text is entirely editorial, the set is not.

**An unsupported block fails the build; it is never dropped.** Dropping it would publish a legal document missing a clause an editor believed they had written. If the vocabulary needs to grow, it grows in `content/lib/portableText.ts`, the Studio schema and the renderer together.

**Structure is not HTML.** The blocks are converted into a typed vocabulary at ingest, and the renderer picks an element per kind. Nothing is ever injected as markup.

---

## `blogPost`

**Modelled, not rendered.** No blog page exists, and `checks/architecture.ts` asserts that nothing in the application imports the generated module. Publishing a post is safe; it simply will not appear anywhere yet. Ordered newest first.

| Field | Type | Rule | On violation |
|---|---|---|---|
| `slug.current` | slug | `^[a-z0-9][a-z0-9-]{0,63}$`, unique | fail |
| `title` | string | non-empty, ≤ 120 | fail |
| `excerpt` | text | non-empty, ≤ 300, plain text | fail |
| `publishedAt` | datetime | a real ISO 8601 instant | fail |
| `cover` | `imageMedia` | optional; `alt` required if present | fail |
| `tags[]` | string[] | ≤ 8, each `^[a-z0-9][a-z0-9-]{0,63}$` | fail |
| `body` | `blogBody` | 1–400 blocks | fail |

`blogBody` is `legalBody` plus quotes, images, video and embeds.

**Embeds are stored as provider plus URL, never as pasted markup.** The provider is `youtube` or `vimeo`, and the URL's host is checked against that provider's allowlist by parsing it. A renderer will build its own iframe from those parts; there is no field that carries an editor's clipboard.

**Video is a schema boundary, not a feature.** No player, no transcoding. It exists so an editor who needs video later does not force a content migration to get it.

---

## Sanity-side setup

- **Prefer a public dataset.** Published website content is already public, and a public dataset with no build token removes a secret to rotate, a Vercel variable to misconfigure and a class of build failure. Drafts are excluded by the query, not by permissions, so a public dataset does not expose them.
- **If the dataset is private,** issue a read-only token with the minimum scope and set it as `SANITY_TOKEN`. Never with a `VITE_` prefix — Vite compiles `VITE_*` into the public bundle.
- **Do not enable SVG uploads** for logos or editorial images. Both the Studio and the build reject them; see the media contract for why, and for how to change that deliberately.
- **The brand-mark rules are duplicated on purpose,** in `sanity-studio/schemas/lib/brandMark.ts` and in `caseStudies.collection.ts`. The Studio blocks Publish; the build blocks the deploy, because a dataset import, a restored backup or the HTTP API never passes through the Studio. Change `docs/earth/logo-spec.md` first, then both copies.
- **Keep slugs stable once published.** They are the ids the application, the scene bindings and the orbit assignments use.
- **Treat the Vercel Deploy Hook URL as a secret.** Anyone holding it can trigger builds.

---

## Environment

| Variable | Purpose | Vercel scope |
|---|---|---|
| `SANITY_PROJECT_ID` | Selects the Sanity source. Its presence is what chooses it. | Production, Preview |
| `SANITY_DATASET` | The dataset, e.g. `production`. **Required in every environment** — never defaulted. | Production, Preview |
| `SANITY_TOKEN` | Read token. Only for a private dataset. | Production, Preview |
| `SANITY_TIMEOUT_MS` | Per-request deadline, default 15000. Invalid values fail rather than falling back. | optional |
| `CONTENT_SOURCE` | Force `sanity` \| `fixture` \| `seed`. | as needed |

The Sanity **API version is not an environment variable**. It decides response shape, so it is pinned in `content/lib/sanity.ts` and changes through a reviewed code change.

**Production must name its source.** A production build with neither `SANITY_PROJECT_ID` nor `CONTENT_SOURCE=seed` fails on purpose, rather than shipping the demo fixtures announced by one log line. Preview and local default to fixtures.

**`SANITY_DATASET` has no default anywhere.** A default of `production` is how a half-filled local `.env` ends up reading the client's live content while looking like an offline build.

---

## Publish flow — the Deploy Hook

1. Create a Deploy Hook in Vercel (Settings → Git → Deploy Hooks), pointed at the production branch.
2. In Sanity: API → Webhooks → Create, with that URL, on create/update/delete.
3. Filter it to the types that affect the public site: `_type in ["caseStudy","district","service","siteSettings","legalDoc"]`. Blog posts render nowhere yet, so they need not trigger a build.
4. Publish something and watch a deployment start.

Webhook delivery may be retried, so a publish can trigger more than one build. At roughly two publications a week that is a non-problem, and queues, debouncers and coalescing services are not worth building against it. Revisit if editorial volume makes it one.

---

## Adding a collection

One entry in `content/collections/index.ts`, one interface in `src/content/types.ts`, one predicate set in `src/content/invariants.ts`, one mapper beside the others, one fixture named after the `_type`, one seed copy, and one schema in `sanity-studio/schemas/`. The generator, the emitter, the validator, the source adapters and the transaction do not change.

Two things to check before you do:

- **Something has to render it.** A collection nothing imports is data with no consumer.
- **The app entry has a hard 320,000 B budget** with roughly 2 KB spare. A new collection reaching the entry chunk needs the number checked, and anything page-sized belongs behind lazy loading.
