# The media contract

What the content build expects from images uploaded to Sanity, and what it does with them.

The authority is `content/lib/mirror.ts` and `content/lib/validate.ts` — this document explains them; the code enforces them. Nothing here is advisory: every rule below fails a build rather than degrading quietly, with one deliberate exception that is named as such.

Separate from `sanity-field-contract.md` on purpose. A field contract answers "what may this field contain"; this answers "where does the file live, who serves it, and who is allowed to be wrong about it". Folding the second into the first is how the media rules end up being read by nobody.

---

## Two kinds of asset, two different homes

| | Owner | Served from | Why |
|---|---|---|---|
| Brand logos | CMS | **the deployment** (`/logos/…`) | Drawn into the shared WebGL brand atlas. A cross-origin draw can taint the canvas every case-study panel uses, and the site must not need Sanity's CDN to be up in order to look finished. |
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
| Filename is `[A-Za-z0-9][A-Za-z0-9._-]{0,127}` | `mirror.ts` | fail |
| The asset actually downloads | `mirror.ts` | fail |
| Not empty | `mirror.ts` | fail |
| At most 4 MB | `mirror.ts` | fail |
| The emitted reference is a local path, and not protocol-relative | `LOCAL_MEDIA_PATH` | fail |
| Absent (`null`, missing, `""`) | — | **allowed** |

**Accepted formats: PNG and WebP.** Raster, with transparency where the mark needs it. JPEG is accepted by the pipeline but is the wrong choice for a logo on a dark backdrop — it has no alpha channel, so it ships a rectangle.

**SVG is prohibited, deliberately and not permanently.** An SVG in a media library is served at its own URL, which makes it stored XSS for anyone who opens it directly, and sanitizing uploaded SVG properly is a real piece of work rather than a regex. If vector logos become a requirement, enabling them should be a reviewed change to `remoteMediaUrl` plus a sanitizer — not an upload nobody noticed. Raster now; SVG later, on purpose.

**A missing logo is a designed state, not a failure.** `createBrandAtlas` draws a mark disc and a wordmark for every case study before any image loads, and upgrades the cell in place if one arrives. A case study with no logo looks intentional. This is the one media rule that degrades instead of failing.

**A logo that is declared but cannot be fetched IS a failure.** Once a case study names an asset, the content and the media library disagreeing is not an editorial state — it is a broken reference, and shipping a silently logo-less panel is the quiet kind of wrong this pipeline exists to prevent. The build exits non-zero and the previous deployment stays live.

**No `alt` on logos.** The logo is drawn into a canvas texture, never into the DOM; the accessible name of a case study comes from `CaseStudy.name`, rendered as text by `CasePanel`. An `alt` field here would be metadata with no reader.

**Recommended source size: 1024×512 or smaller, under 200 KB.** The atlas cell is 1024×512 with its own padding, so anything larger is downscaled at load and costs bytes for nothing. The 4 MB cap is a guard against a mistake, not a target.

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

When a blog renderer eventually exists, `img-src` in `vercel.json` will need `https://cdn.sanity.io` added — and that is the moment to decide whether these should be mirrored too. Not before.

---

## How you would know it broke

- A case study renders another brand's logo — the mirror wrote one asset's bytes under another's name, which the content-addressed filename is supposed to make impossible.
- `public/logos/` grows on a build where no logo changed — the "already on disk" short-circuit stopped working, and the emitted module may no longer be byte-stable.
- The browser makes a request to `cdn.sanity.io` — a logo reference escaped the mirror, and `img-src 'self'` should be reporting it.
- A build succeeds while a logo 404s — the failure path degraded to a warning somewhere.
- An SVG reaches `public/logos/` — the format guard moved or was widened without a sanitizer.
