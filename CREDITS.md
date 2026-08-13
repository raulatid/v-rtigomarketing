# Third-party assets

Provenance and licence for every asset in `public/` that did not originate with this project.

Anything added here that carries an attribution requirement must ALSO appear somewhere the
visitor can see. A licence satisfied only in the repository is not satisfied.

---

## `public/textures/sky-panorama.webp` — the space backdrop

**Credit line, to be reproduced verbatim and unaltered:**

> ESO/S. Brunier

**Source.** *The Milky Way panorama* (eso0932a), ESO GigaGalaxy Zoom project, photographed by
Serge Brunier. <https://www.eso.org/public/images/eso0932a/>

**Licence.** Creative Commons Attribution 4.0 International (CC BY 4.0), per ESO's copyright
policy at <https://www.eso.org/public/outreach/copyright/>. Commercial use is permitted. Two
conditions bind us:

- The credit "must be presented in a clear and readable manner to all users, with the wording
  unaltered", and "should not be hidden or disassociated from the image". It need not sit on
  top of the image itself — the policy explicitly allows the credit to live on another page,
  provided it is clearly visible and identified as the credit for the image.
- Nothing may state or imply that ESO endorses Vértigo or any of its services.

**Where the visible credit lives:** the site footer, in `src/components/AuditSection.tsx`.
If that component is ever restructured, the credit moves with it — it does not get dropped.

**How the shipped files are derived from the original.** Source is the 6000 × 3000 TIFF
(`https://cdn.eso.org/images/original/eso0932a.tif`, 27.7 MB), then:

1. A 5 × 5 **median filter**, which removes point stars while leaving the diffuse gas, the dust
   lanes and the Magellanic Clouds intact. Two reasons, and the byte saving is the lesser one:
   the scene draws its own star field on a nearer shell where the stars parallax and twinkle,
   so photographed stars would be a second, static, contradictory set. The median also removes
   the satellite trails and stitching specks visible in the original.
2. Lanczos3 downscale, and the wrap seam levelled at the shipped width.
3. **AVIF, quality 60** — not WebP, and not a higher AVIF quality. See the block-ratio table in
   `scripts/prepare-sky-panorama.mjs`.

Four files ship; exactly one is ever fetched.

| file | size | block ratio | VRAM |
|---|---|---|---|
| `sky-panorama.avif` | 240 KB | 1.171 | 75.5 MB |
| `sky-panorama.webp` | 401 KB | 1.524 | 75.5 MB |
| `sky-panorama-narrow.avif` | 81 KB | 1.039 | 18.9 MB |
| `sky-panorama-narrow.webp` | 129 KB | 1.556 | 18.9 MB |

AVIF is the primary; WebP exists only for browsers that cannot decode AVIF, reached by
attempting the AVIF and letting it fail. The narrow pair is served below 767 px viewport width.
6144 is the ceiling the source allows — 6000 × 3000 is 16.7 px/deg, and wider is empty
upscaling.

Un-filtered, the same panorama is 1.5 MB — point stars are high-entropy and dominate the
compressed size, which is why removing them buys a 14× saving.

The image is equirectangular in **galactic** coordinates: the galactic plane lies exactly on the
horizontal centreline (`v = 0.5`) and the galactic centre at `u = 0.5`. `SkyShell` depends on
this. A celestial/equatorial panorama would need an extra fixed rotation and is not what ships.

Regenerate with `scripts/prepare-sky-panorama.mjs`.

---

## `public/earth/{day,night,specularClouds}.jpg`

Provenance not recorded when these were added. **Outstanding:** confirm the source and licence
of the Earth maps and record them here. They are almost certainly NASA Visible Earth / Blue
Marble, which is public domain, but "almost certainly" is not a licence record.
