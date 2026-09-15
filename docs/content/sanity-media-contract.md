# The media contract

What the content build expects from images uploaded to Sanity, and what it does with them.

The authority is `content/lib/mirror.ts` and `content/lib/validate.ts` — this document explains them; the code enforces them. Nothing here is advisory: every rule below fails a build rather than degrading quietly, with one deliberate exception that is named as such.

Separate from `sanity-field-contract.md` on purpose. A field contract answers "what may this field contain"; this answers "where does the file live, who serves it, and who is allowed to be wrong about it". Folding the second into the first is how the media rules end up being read by nobody.

---

## Two kinds of asset, two different homes

| | Owner | Served from | Why |
|---|---|---|---|
| Brand marks (isotype + logo) | CMS | **the deployment** (`/logos/…`) | Drawn into the shared WebGL brand atlas. A cross-origin draw can taint the canvas every case-study panel uses, and the site must not need Sanity's CDN to be up in order to look finished. |
| Blog and editorial imagery | CMS | `cdn.sanity.io` | No renderer exists yet, the library grows without bound, and copying every image into every deployment buys nothing until something displays them. |
| GLB, KTX2, terrain, sky, shaders, fixed graphics | **the application** | the deployment | Not editorial. These change when the scene is re-exported, not when marketing writes. They are versioned with the code and are explicitly outside CMS scope. |

The consequence worth stating plainly: **the public site never makes a runtime request to Sanity.** `connect-src 'self'` and `img-src 'self' data: blob:` in `vercel.json` are unchanged by this migration, and adding a runtime CMS request would require changing them — which is the signal that something went wrong.

---

## The logo mirror

```text
editor uploads a logo in Sanity
        ↓
GROQ returns the cdn.sanity.io url
        ↓
content/lib/mirror.ts validates the origin, fetches the file
        ↓
public/logos/<asset-hash>-<w>x<h>.<ext>
        ↓
the emitted module carries "/logos/<asset-hash>-<w>x<h>.<ext>"
```

The projection hands the mirror a **url string**, never the image object:

```groq
"logo": logo.asset->url
```

A bare `logo` returns `{ _type: "image", asset: { _ref } }`, which the mirror rejects with "expected a string, got object" — and every fixture logo being `null` means nothing local catches it. `collections.test.ts` asserts the projection for that reason.

Only the Sanity source is mirrored. Fixtures and the committed seed already carry local paths, and wrapping them would put a filesystem write in the one code path that has to work offline.

**Filenames come from Sanity, not from us.** Sanity asset URLs are content-addressed — the basename carries the asset hash — so the same image always produces the same filename, the emitted module is byte-identical across builds, and a file already on disk never needs re-downloading. That is what lets `emit.ts` keep claiming determinism now that media is involved.

`public/logos/` is gitignored (`.gitignore`, with a `.gitkeep`) and already has a cache header in `vercel.json`. Mirrored media is build output, exactly like `src/content/generated/`.

---

## Rules for an uploaded logo

| Rule | Enforced by | On violation |
|---|---|---|
| Origin is `https://cdn.sanity.io` | `remoteMediaUrl`, on the parsed `URL.origin` | fail |
| Scheme is `https` | `remoteMediaUrl` | fail |
| Not SVG or SVGZ | `remoteMediaUrl` | fail |
| Extension is `.png` or `.webp` | `remoteMediaUrl`, against the rule's allowlist | fail |
| At least 432×432 (isotype) / 900×400 (logo) | `mirror.ts`, `assertGeometry` | fail |
| Aspect 0.75–1.33:1 (isotype) / 1.5–5:1 (logo) | `mirror.ts`, `assertGeometry` | fail |
| Filename is `[A-Za-z0-9][A-Za-z0-9._-]{0,127}` | `mirror.ts` | fail |
| The asset actually downloads | `mirror.ts` | fail |
| Not empty | `mirror.ts` | fail |
| At most 4 MB | `mirror.ts` | fail |
| The emitted reference is a local path, and not protocol-relative | `LOCAL_MEDIA_PATH` | fail |
| Absent (`null`, missing, `""`) | — | **allowed**, but only for both marks together |
| `isotype` and `logo` are both present, or both absent | `caseStudies.collection.ts` mapper, and `caseStudyProblems` | fail |

Every row above is also checked in the Studio, at the field, by
`sanity-studio/schemas/lib/brandMark.ts` — see "Two tiers" below.

**The building banner is retired (2026-09-15, audit AR-12).** Its former image is no longer fetched, mirrored or validated. Stored Sanity values and assets remain intact; the hidden Studio fields are read-only. Brand-mark mirroring and its rules below remain active.

**Accepted formats: PNG and WebP, and nothing else.** Raster, with transparency where the mark needs
it. JPEG is refused rather than tolerated: it has no alpha channel, so on the dark-glass panel it
ships a rectangle of its own background. That is a rendering result nobody would approve if asked,
which makes it the wrong thing to leave to an editor's judgement.

**SVG is prohibited, deliberately and not permanently** — for a completely different reason, and it
keeps its own check and its own message. See below.

---

## Two tiers, and where each one lives

The numbers appear in two packages, and the duplication is intentional:
`sanity-studio/schemas/lib/brandMark.ts` and `caseStudies.collection.ts`'s `BRAND_MARK_RULES`. The
Studio is its own npm package and neither side may import the other — the same arrangement the
isotype/logo pairing rule has already. `docs/earth/logo-spec.md` is the source both copies follow.

| | Studio | Content build |
|---|---|---|
| When | as the editor uploads | at `npm run content:build` |
| Reads dimensions from | the asset id, `image-<hash>-1600x800-webp` | the asset URL, `<hash>-1600x800.webp` |
| Blocks | the Publish button | the deployment |
| Also has | an advisory tier — below-ideal size, unusual aspect, wastefully large — that flags the field in yellow and publishes anyway | — |
| Covers | an editor in the Studio | that, plus `sanity dataset import`, a restored backup, and the HTTP API |

Neither tier downloads or decodes anything. Sanity names an image asset after its own dimensions and
format, so the geometry of an upload is knowable from a string — the same content-addressing fact
that lets the mirror skip a file it already has.

**The Studio tier fails open.** An asset id it cannot parse passes. If Sanity ever changes that
format, the failure mode has to be "the Studio stops pre-checking", never "the client's Studio
rejects every correct logo" — the build is the half that guarantees.

**The build tier ignores a name that carries no dimensions**, which is how a hand-placed
`/logos/satellite-01-isotipo.webp` stays legal. Only a filename that claims dimensions is held
to them.

**SVG is prohibited, deliberately and not permanently.** An SVG in a media library is served at its own URL, which makes it stored XSS for anyone who opens it directly, and sanitizing uploaded SVG properly is a real piece of work rather than a regex. If vector logos become a requirement, enabling them should be a reviewed change to `remoteMediaUrl` plus a sanitizer — not an upload nobody noticed. Raster now; SVG later, on purpose.

**A case study carries TWO brand marks, and they are one decision.** `isotype` is the symbol alone, shown on the satellite's panel at rest; `logo` is the full horizontal lockup, revealed when the panel unfolds under selection. Both are mirrored (`mirror: ['logo', 'isotype']`).

**Half a pair is a failure.** A case study with an isotype and no logo — or the reverse — would morph from a real trademark into a generated placeholder mid-animation. The two fields sit apart in the Studio, so an editor filling one and not the other sees nothing wrong and the site looks plausible while being wrong on exactly one satellite. That is the failure mode a build-time pipeline exists to catch, so the mapper rejects the record and names the case. The Studio also flags it at the empty field, but that is a convenience, not the enforcement.

**Missing BOTH marks is a designed state, not a failure.** `createBrandAtlas` draws a mark disc for every isotype cell and a mark-plus-wordmark for every logo cell before any image loads, and upgrades each cell in place if an image arrives. A case study with no artwork looks intentional. This is the one media rule that degrades instead of failing.

**A logo that is declared but cannot be fetched IS a failure.** Once a case study names an asset, the content and the media library disagreeing is not an editorial state — it is a broken reference, and shipping a silently logo-less panel is the quiet kind of wrong this pipeline exists to prevent. The build exits non-zero and the previous deployment stays live.

**No `alt` on brand marks.** They are drawn into a canvas texture, never into the DOM; the accessible name of a case study comes from `CaseStudy.name`, rendered as text by `CasePanel`. An `alt` field here would be metadata with no reader.

**Source size: 512×512 for the isotype, 1600×800 for the logo, each under 200 KB.** These are the
numbers in `docs/earth/logo-spec.md`, which is what the client is asked to deliver, and they are
roughly 2× the box the artwork is actually fitted into — a 512² isotype cell padded by 40 gives a
432×432 box, a 1024×512 logo cell padded by 64/56 gives 896×400. The factor of two is what keeps
thin strokes clean through the downscale at the case-panel close-up.

This document used to say 1024×512 for the logo. That was wrong in a way worth naming: it is barely
above the 896-wide box, and `drawLogoContained` already `console.warn`s below it — the recommendation
was steering editors towards artwork the renderer complains about. The minimum is 900 wide; 1600×800
is the target.

The 4 MB cap is a guard against a mistake, not a target.

---

## `ImageMedia` — everything that is not a logo

Editorial images are modelled, not mirrored:

```ts
export interface ImageMedia {
  src: string     // absolute cdn.sanity.io url
  alt: string     // required
  width: number
  height: number
}
```

Four fields, because four have consumers. `aspectRatio` and `dominantColor` are available from Sanity's asset metadata and are deliberately absent — metadata with no reader is a contract nobody is keeping. Add one when something renders it.

**`alt` is required.** An image whose meaning is purely decorative does not belong in the CMS; put it in the application's own assets. The GROQ projection resolves the asset reference into this shape, so no renderer ever sees `asset->`, `_ref` or `_type`:

```groq
cover {
  "src": asset->url,
  "width": asset->metadata.dimensions.width,
  "height": asset->metadata.dimensions.height,
  alt
}
```

**A description without an upload is a failure, not an empty field.** Sanity keeps `{_type: 'imageMedia', alt: '…'}` in the document when an editor writes the description and never picks a file, or removes one later — so the projection above returns an object whose `src`, `width` and `height` are all null, where a field nobody has touched returns `null` outright. The Studio rejects that state while the editor is working and the build rejects it at the deploy, the same two-places arrangement the brand marks use and for the same reason: a dataset import, a restored backup or the HTTP API never passes through the Studio. The build reports it once, at the field, rather than as three problems about `src`, `width` and `height` — those are derived from the upload, and naming them tells whoever edits the CMS nothing.

When a blog renderer eventually exists, `img-src` in `vercel.json` will need `https://cdn.sanity.io` added — and that is the moment to decide whether these should be mirrored too. Not before.

---

## How you would know it broke

- A case study renders another brand's logo — the mirror wrote one asset's bytes under another's name, which the content-addressed filename is supposed to make impossible.
- `public/logos/` grows on a build where no logo changed — the "already on disk" short-circuit stopped working, and the emitted module may no longer be byte-stable.
- The browser makes a request to `cdn.sanity.io` — a logo reference escaped the mirror, and `img-src 'self'` should be reporting it.
- A build succeeds while a logo 404s — the failure path degraded to a warning somewhere.
- An SVG reaches `public/logos/` — the format guard moved or was widened without a sanitizer.
- A `.jpg` reaches `public/logos/`, or a file whose name says it is smaller than the minimum — the allowlist or `assertGeometry` stopped being reached, most likely because a `mediaRules` key and a `mirror` field name drifted apart.
- The Studio accepts a 300×300 JPEG without a word — `parseImageRef` is failing to parse a live asset id and every rule is falling open. It is meant to fail open; it is not meant to do so silently forever, so this is worth checking whenever the Sanity major version moves.
