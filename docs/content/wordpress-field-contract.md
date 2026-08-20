# WordPress field contract

What the content build expects from the CMS. The authority is
`content/collections/*.collection.ts` — this document explains it; the mappers enforce it.

Nothing here is advisory. A field that does not satisfy its rule **fails the build**, which means
the deployment fails and the previous one keeps serving. That is deliberate: a publish that cannot
be validated must not report success.

---

## How the content reaches the site

```
WP publish → Deploy Hook → Vercel build
                             └─ npm run content:build   (fetch, validate, emit)
                             └─ npm run check           (the same invariants, again, on what was written)
                             └─ vite build
```

The browser never calls WordPress. Content is fetched in Node at build time and emitted as
TypeScript modules, so there is no runtime request, no loading state, no CORS and no CSP change —
which is the point, on a site whose product is a 3D scene.

**Consequence for editors:** a change is live one build after publishing, not instantly.

---

## Model fields as ACF, not post content

ACF text/textarea/repeater fields with `show_in_rest: true` return **raw strings**. Core's
`title.rendered` and `excerpt.rendered` return **HTML**, already expanded with shortcodes and embeds.

The build strips HTML and decodes entities either way, but raw fields avoid the round trip entirely.
Prefer ACF for everything except the post title.

---

## `case_study`

REST route `/wp-json/wp/v2/case_study`. One record per case study.

| Field | Type | Rule | On violation |
|---|---|---|---|
| `id` | string | `^[a-z0-9][a-z0-9-]{0,63}$` — reaches DOM ids and file names | fail |
| `label` | string | non-empty, ≤ 60. Short form; defaults to `name` | fail |
| `name` | string | non-empty, ≤ 60. The panel title and the atlas wordmark | fail |
| `brandColor` | string | `#rrggbb` exactly | fail |
| `logo` | string \| null | CMS media URL, `https`, on the CMS origin, **not SVG** — **but see below: the mirror is not built, so today every remote URL degrades to `null`** | `null` — the drawn plate stays |
| `sector` | string | non-empty, ≤ 60 | fail |
| `location` | string | non-empty, ≤ 60 | fail |
| `year` | string | non-empty, ≤ 16 | fail |
| `summary` | string | non-empty, ≤ 400 | fail |
| `details` | string[] | ≤ 4 entries, each non-empty, ≤ 200 | fail |
| `metrics` | object[] | **exactly 2**, each `{ label ≤ 40, value ≤ 20 }` | fail |
| `chart.type` | string | one of `line`, `bars`, `area`, `donut` | fail |
| `chart.title` | string | non-empty, ≤ 80 | fail |
| `chart.values` | number[] | 1–16 finite numbers | fail |
| `chart.labels` | string[] | **required** for `bars` and `donut`, one per value, ≤ 24 each | fail |

**`logo` is the one field that degrades instead of failing, and today it always degrades.** The
shipped value must be a local path under `/logos/` (`LOCAL_MEDIA_PATH` in `src/content/invariants.ts`)
because the browser must never hotlink the CMS. The media step that would download a CMS upload and
rewrite it to that local path **is not implemented yet** (`.gitignore` and ADR 010 describe it; no code
does it). Until it lands, the mapper keeps a logo only if it is already a local path and maps any
remote URL to `null` — the drawn plate — rather than letting the self-check reject the record and fail
the deployment the first time an editor uploads a logo (re-audit 2026-08-20, `CMS-1`). Editors can
upload logos now; they will appear once the mirror ships.

**No `orbitId`.** Which case appears on which orbit is scene composition, not editorial content — it
lives in `src/experiences/earth/orbit/orbitAssignments.ts`. Publishing a case study does **not** put
it on the globe; a developer assigns it to one of the six presets. Unpublishing a case study that is
currently assigned **fails the build**, loudly, rather than leaving a satellite with no data.

**`metrics` is exactly two, not "up to two".** The panel's metric row is a fixed two-up grid. An ACF
repeater with min 2 / max 2 is the right control.

**Why lengths are rejected rather than truncated.** A sentence cut mid-word reads as a rendering bug,
and the person who can shorten it properly is the person who wrote it.

---

## `district`

REST route `/wp-json/wp/v2/district`. One record per interactive city district.

| Field | Type | Rule | On violation |
|---|---|---|---|
| `id` | string | `^[a-z0-9][a-z0-9-]{0,63}$` | fail |
| `label` | string | non-empty, ≤ 40 | fail |
| `summary` | string | non-empty, **≤ 140** | fail |
| `intro` | string | non-empty, ≤ 600 | fail |
| `services` | object[] | 1–12 entries | fail |
| `services[].id` | string | `^[a-z0-9][a-z0-9-]{0,63}$`, **unique within the district** | fail |
| `services[].title` | string | non-empty, ≤ 60 | fail |
| `services[].body` | string | non-empty, ≤ 900 | fail |

**The 140-character summary is a layout fact.** It shows at the mobile peek stop, where the sheet is
40% of the viewport tall. Longer text does not clip gracefully; it pushes the affordance off screen.

**`services[].id` becomes an `aria-controls` value.** A duplicate points two accordion headers at one
region, and a slug containing a space points a header at nothing. Both break the panel for
screen-reader users and for nobody else — which is exactly why they are asserted rather than reviewed.

**A district's `id` must match a `contentId`** in `src/experiences/murcia/scene/cityDistrictBindings.ts`.
That table binds copy to geometry in the city model and is code-owned, because it changes when the GLB
is re-exported rather than when marketing writes.

---

## WordPress-side hardening

Required before the read credential is issued.

- **Keep core's SVG upload block on.** An SVG in the media library is served at its own URL, so it is
  stored XSS for anyone who opens it. The build rejects SVG logos as well, so this is defence in depth.
- **Deny `/wp/v2/users` to anonymous callers.** It enumerates usernames by default.
- **Read-only application password** for the build, supplied as `WP_AUTHORIZATION`. Never a
  `VITE_`-prefixed variable — Vite compiles those into the public bundle.
- **Stable slugs.** The build orders by `slug`, so renaming one reshuffles the generated file. Harmless,
  but it makes a content diff noisier than it needs to be.

## Environment

All build-time, all read by `scripts/build-content.ts`, none ever `VITE_`-prefixed. A commented
template lives at `.env.example`.

| Variable | Purpose | Vercel scope |
|---|---|---|
| `WP_CONTENT_BASE` | REST root, e.g. `https://cms.example.com/wp-json/wp/v2`. Its presence selects the WordPress source | **Production: required** (unless `CONTENT_SOURCE=seed`). Preview: optional |
| `WP_AUTHORIZATION` | Optional `Authorization` header value for the read credential | Wherever `WP_CONTENT_BASE` is set |
| `WP_TIMEOUT_MS` | Per-request deadline, default 15000. Must be a positive number — a typo fails the build instead of becoming `setTimeout(fn, NaN)` | Optional |
| `CONTENT_SOURCE` | `wp`, `fixture` or `seed`. Overrides the default choice | Production: `seed` is the only way to deploy without WordPress |

**Production must name its source.** With `VERCEL_ENV=production` and neither `WP_CONTENT_BASE` nor
`CONTENT_SOURCE` set, `content:build` exits non-zero: a missing, typo'd or Preview-only-scoped variable
would otherwise produce a green production deployment serving fixtures, announced by one log line.
Preview and local keep the fixture default — previews are the builds a client demo runs on, and
fixtures are the demo content. Locally, with none of these set, the build reads `content/fixtures/`
and works offline.

## Publish flow — the Deploy Hook

The diagram at the top says `WP publish → Deploy Hook → Vercel build`. The Vercel half is a project
setting; the WordPress half is **outside this repository and not yet built**.

1. Vercel → the project → *Settings → Git → Deploy Hooks* → create one named e.g. `wordpress-publish`
   for branch `main`. Vercel returns a URL of the form `https://api.vercel.com/v1/integrations/deploy/…`.
2. Treat that URL as a secret: anyone holding it can trigger production builds. Store it in the
   WordPress install's configuration (not in a post, not in this repo).
3. On the WordPress side, POST to it from a `save_post`/`transition_post_status` hook for the
   `case_study` and `district` post types (or a plugin that does the same). Debounce — a bulk edit
   should not queue twenty builds.
4. Each build re-reads the whole collection, validates, and either ships or fails with the field
   named in the log. A failed build leaves the previous deployment serving.

Until step 3 exists, a publish is made live by *Deployments → Redeploy* in the Vercel dashboard, or
by any push to `main`.

---

## Adding a third collection

One entry in `content/collections/index.ts`, one interface in `src/content/types.ts`, one predicate
set in `src/content/invariants.ts`, one mapper beside the existing two, one fixture. The generator,
emitter, validator, source adapters and transaction do not change.

What the registry does **not** buy you: a renderer. A new collection still needs UI, and if that UI is
statically imported from `App.tsx` its data lands in the app entry chunk, which has a hard 320,000 B
budget that fails the build. Case-study content was moved out of that chunk deliberately — see
`src/experiences/earth/orbit/orbitConfig.ts`.
