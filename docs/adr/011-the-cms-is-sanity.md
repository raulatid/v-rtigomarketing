# ADR 011 — The CMS is Sanity, and structure is not HTML

Status: **Accepted** — 2026-08-23
Extends: `adr/010` (content is generated at build time — every guarantee it makes still holds)
Amends: `DECISIONS.md` §27 (WordPress is the editorial source of truth — it is Sanity)
Amends: `DECISIONS.md` §30 (brand data has one home and it is not a collection — it is one now)

## Context

ADR 010 established the shape of the content pipeline: fetch in Node at build time, validate, emit deterministic TypeScript modules into `src/content/generated/`, and never let the browser talk to the CMS. That decision was right and is not being revisited. What is being revisited is the vendor behind it, and how much of the site the client can actually edit.

Two things forced the question.

**The WordPress integration did not work, and could not have.** The collections requested `_fields=id,slug,title,acf` and then read flat top-level keys — `source.name`, `source.summary`, `source.chart`. A real `wp/v2` response returns `title.rendered`, an `acf` envelope and a numeric `id`. No normalization layer existed to bridge them. The fixtures and the seed already had the flat shape, so every test passed against a shape WordPress would never send. The transport was tested — pagination, timeouts, torn snapshots — and the mapping never was. There was no working integration to preserve, which is the only reason this migration is cheap.

**The editable surface was too small.** Case studies and district copy were CMS-owned; services were rows nested inside one district, and the phone number, contact email, copyright and both legal documents were hand-written constants in `src/content/site.ts`. §30 argued that a phone number does not earn a post type, and that held while only a developer could change it. The client edits their own contact details, and the alternative to a one-record collection is a deployment for a phone number.

## Decision

**Sanity is the editorial source of truth. Everything ADR 010 promised still holds.** Content is fetched in Node at build time, validated, and emitted as deterministic modules. There is no runtime fetch, no loading state, no new boot resource, no async `createOrbitSystem`, and no change to `connect-src`. `content/lib/generate.ts` — the collection loop, the all-or-nothing failure policy, the `.tmp` write and `renameSync` commit — is untouched. So is `content/lib/emit.ts`, and so is its determinism.

**The GROQ projection is the normalization layer.** Each collection declares a `SanitySourceSpec { type, projection, orderBy }`, and the projection returns exactly the flat shape the mapper reads. Nothing past `map` ever sees `_ref`, `_type`, `slug.current` or a Sanity asset object. This is deliberately *not* a vendor-neutral abstraction: `type` is a Sanity `_type` and `projection` is GROQ, and pretending otherwise would buy an abstraction for a second CMS that does not exist and would not fit it anyway. The boundary that matters is downstream of the projection, not upstream of it.

**One request per collection removes torn reads. It does not make the read transactional.** The WordPress adapter had to walk pages and assert `X-WP-Total` against what arrived, because a collection that changed between page 1 and page 2 produced a snapshot with a record duplicated across the boundary or missing entirely. One GROQ query removes that failure class outright. It does **not** make the read consistent with the instant of publication: Sanity query visibility is eventually consistent with recent mutations, so a build fired by a publish webhook can in principle observe the state just before that publish. That is a publication-freshness concern, not a torn read, and it is deliberately not papered over with a sleep. If it turns out to be real, the fix is a bounded retry against a verifiable freshness condition — measured first, not guessed.

**Drafts are excluded in the query filter.** `!(_id in path("drafts.**"))`, not fetched and discarded afterwards. A build that pulls drafts already holds unpublished copy in a process one mapping bug away from the emitted module.

**Collections fail rather than truncate.** The query asks for one record past the 1000 ceiling and rejects anything over it, so a legitimate collection of exactly 1000 documents is valid and 1001 is a hard failure. Asking for `[0...1000]` and rejecting a full page would reject the legitimate case; silently truncating would make missing content look like an editorial decision.

**The API version is pinned in source, not in the environment.** `SANITY_API_VERSION` in `content/lib/sanity.ts` decides how a response is *shaped*, which makes it protocol compatibility policy rather than deployment configuration. `latest` would let the contract change between two deployments of unchanged code. Environment variables carry values a deployment picks; this is not one of them, and changing it should be a reviewed diff that breaks a test.

**Production must name its source, and every fail-closed rule is a unit test.** The environment decision lives in `content/lib/config.ts` as a pure function, so "a production build with no source named fails" is asserted rather than remembered. `SANITY_DATASET` is required in *every* environment, not only production: a default of `production` is how a half-filled `.env` reads the client's live content while looking like an offline build. A leftover `WP_CONTENT_BASE` fails with a message naming what changed, rather than the generic one.

**Brand logos are mirrored; editorial imagery is not.** A logo is drawn into the shared WebGL brand atlas, so hotlinking it would mean an outbound request from every visitor, a cross-origin draw that can taint the canvas every panel uses, and a site whose artwork depends on Sanity's CDN. `content/lib/mirror.ts` fetches them into `public/logos/` at build time, which keeps `img-src 'self'` intact and keeps the public site independent of CMS availability. Blog and editorial images stay on `cdn.sanity.io` in the content model — the library grows without bound and nothing renders them yet. Filenames come from Sanity's content-addressed basename, so the same image always produces the same bytes and determinism survives. **SVG is prohibited**, deliberately and not permanently: an SVG served at its own URL is stored XSS, and enabling it should be a reviewed change plus a sanitizer, not an upload nobody noticed.

**3D assets are not CMS content.** GLB, KTX2, terrain, sky, shaders, geometry and fixed application graphics stay versioned with the code on the existing static path. They change when the scene is re-exported, not when marketing writes.

**Scene composition stays code-owned.** Unchanged from §28 and worth restating because the editable surface grew: `orbitAssignments.ts` binds preset to case, `cityDistrictBindings.ts` binds scene nodes to district ids, and `LegalDocId` is a union in `src/content/site.ts`. Which case occupies which orbit, which nodes are a district, and which legal documents the footer links to are all composition. The *text* is entirely editorial; the *sets* are not.

**Structured content is typed blocks, and typed blocks are not HTML.** Legal documents and blog posts store Portable Text. `content/lib/portableText.ts` converts it into the small vocabulary in `src/content/types.ts` and **fails the build** on a style, mark or annotation it does not know. Link targets are restricted to `https:` and `mailto:` by parsing the URL, not by matching a pattern. `LegalPanel` switches on `kind` to choose an element; there is no `dangerouslySetInnerHTML`, no raw-HTML block type, and no unrestricted iframe anywhere. The rule that arbitrary CMS HTML must never reach a renderer is intact — what changes is that it is no longer mistaken for "all CMS content must be plain strings".

**An unknown block is a failure, never a silent drop.** Dropping it would publish a legal document missing a clause an editor believed they had written, which is the worst available outcome. The cost is that widening the vocabulary is a code change. That is the point.

**The blog is modelled and not rendered.** No page, no route, no renderer. The schema exists so the format does not have to be invented later against live editorial copy, and `checks/architecture.ts` asserts that nothing under `src/` imports the generated module — the entry chunk has a hard 320,000 B budget with roughly 2 KB spare, and a static import would blow it while reporting itself as a bundler problem.

**No Sanity code reaches the browser.** No `@sanity/client` — one `fetch` behind the existing `ContentSource` interface. No `VITE_SANITY_*`. The Studio is a separate package with its own dependency tree, excluded from the root tsconfig and vitest config. A read token, if a private dataset is ever chosen, is a build-time header and nothing else.

## Alternatives considered

**Fix the WordPress mapping instead.** It would have meant writing the `title.rendered` / `acf` unwrapping layer that never existed, plus running and hardening a WordPress install — its admin surface, its plugin update cadence, its credential rotation — for a site whose entire runtime dependency on it is zero. The security audit's threat model was mostly *about* that install. Sanity removes the server rather than defending it.

**A vendor-neutral source contract.** Rejected as a fiction. `projection` is GROQ; no amount of naming makes it otherwise, and a generic CMS abstraction built for a second vendor that does not exist would fit that vendor badly whenever it arrived. The honest boundary is the projection itself.

**`@sanity/client`.** It solves browser caching, live queries, mutations and listeners — none of which this pipeline has. One `fetch` keeps the dependency graph, and therefore the bundle, exactly where it is.

**`apicdn.sanity.io`.** Faster and cached, which is precisely wrong here: the build runs immediately after an editor publishes, and a cached query response is the one thing that would produce a green deployment carrying yesterday's content.

**Keeping legal copy as `string[]`.** It would have avoided a renderer change. It would also have shipped a privacy notice that cannot contain a heading, a list of the rights a visitor can exercise, or a link to the data-protection authority — and bought a content migration on legal text, which is the kind nobody wants to sign off.

**Deferring the blog schema entirely.** Legitimate, and explicitly allowed by the migration plan. Rejected because the alternative on offer was a `body: string[]` known to be insufficient, and modelling it now costs the application nothing: the generated module is imported by nobody and the entry chunk did not move.

**Mirroring all media, or none.** All of it grows every deployment with a blog library nothing displays. None of it puts the brand atlas — a boot-critical, canvas-tainting, same-origin-sensitive path — behind a third-party CDN. The split follows what the application actually draws.

## Consequences

**`npm run check` is still the content validation gate,** for the same accidental reason ADR 010 recorded: `precheck` runs `content:build` first. It now also validates services, site settings, legal documents and blog posts.

**The CMS outage window got wider, and the escape hatch still works.** More of the site is CMS-owned, so more of it fails a build when Sanity is unreachable. `CONTENT_SOURCE=seed` still ships a code-only hotfix from the committed snapshot, with its banner, and `content/seed/` now carries all six collections.

**The app entry grew by ~1.6 KB and the budget is tight.** The legal serializer and the settings adapter are the cost; the measured entry is ~317.9 KB against a 320 KB ceiling. Anything new that reaches the entry now needs the number checked, and the blog is fenced off by an architecture rule rather than by good intentions.

**A field contract now exists in two places that must agree.** The Studio schema tells the editor what is allowed while they type; the build asserts it. That duplication is deliberate — one is a convenience, the other is the guarantee — but a schema widened without widening ingestion produces content that refuses to publish, and the reverse produces a field nothing can fill.

**Publishing is disclosure, and only the code knew it.** The dataset answers anonymous reads of published documents — the deliberate consequence of a public dataset with no build token, and the right trade for a marketing site whose content is public anyway. What the decision did not carry was the operational half: *published* means readable by anyone on the internet, including every field the site does not render and every document type it has no page for. The 2026-08-27 security audit verified it by reading the published `blogPost` documents through the query API while the site renders no blog (ORG-2). Drafts are not exposed on that path — Sanity hides the `drafts.` namespace from unauthenticated reads, which is a second reason the build's `!(_id in path("drafts.**"))` filter is not the only thing standing between a draft and the public. The `production` dataset also answers anonymously and is currently empty; whoever seeds it is publishing, not staging.

The consequence for the content model is a rule, not a warning: **a field must never exist to hold information that must not be public.** Internal notes, personal data, credentials and private phone numbers have no home in this dataset, and "the frontend does not render it" is not a privacy control — it is a rendering decision that a future commit can reverse without anybody thinking about disclosure. `GUIA-EDITOR.md` says the same thing in the editor's language, because the person who publishes is not the person reading this file.

**Two singleton invariants are enforced twice each,** for the same reason: Studio structure hides the "create another" button, and `audit` fails the build if a second document exists anyway. A restored backup or the HTTP API can produce one the Studio never showed anybody.

**Historical WordPress documentation is superseded, not deleted.** `docs/content/wordpress-field-contract.md` carries a superseded header pointing at its replacements. The audit reports are dated snapshots and are untouched — an audit that is rewritten to match the present is an audit nobody can rely on.

## How you would know it broke

- A deployment succeeded while Sanity was unreachable, or while a collection failed validation.
- The browser makes a request to `sanity.io` or `cdn.sanity.io` — a logo escaped the mirror, or a runtime client got added.
- `SANITY_TOKEN` or any `VITE_SANITY_*` appears in `dist/`.
- A generated module changes bytes on a build where no content changed — the mirror re-downloaded, an ordering went implicit, or something learned the time.
- A draft appears on the public site.
- A schema gains a field for something that must not be public — an internal note, a private phone number, a credential — on the reasoning that nothing renders it.
- A collection quietly shrinks to 1000 records.
- A legal document renders with a clause missing, or renders a heading as a paragraph — ingestion started dropping what it does not recognise instead of failing.
- `dangerouslySetInnerHTML` appears anywhere near content.
- The app entry exceeds 320,000 B and the message blames three.js.
- `src/content/generated/` appears in a commit.
