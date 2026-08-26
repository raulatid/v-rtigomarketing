# Third-party assets

Provenance and licence for every asset in `public/` that did not originate with this project.

Anything added here that carries an attribution requirement must ALSO appear somewhere the
visitor can see. A licence satisfied only in the repository is not satisfied.

---

## `public/textures/sky-panorama.*` — the space backdrop

**No attribution required, and none is shown.** This is a client requirement, not a preference:
the site carries no third-party credit. The asset was chosen to satisfy it.

**Source.** Public domain / CC0 stock space image, 4096 × 2048, 2:1.
Working file kept outside the repo at `04_Assets/fonde del espacio/sky-panorama-001.png`.

> **It is 2:1 but it is NOT an equirectangular panorama**, established 2026-08-20 — and neither
> is any of the six candidates that were screened. It is sampled as one anyway. See "The
> projection problem" below before sourcing a replacement.

> **TODO — record the download URL here.** The file is confirmed CC0 by the person who sourced
> it, but the origin URL was never written down. Provenance belongs in this file even when no
> credit is owed: "we believe it was CC0" is not a record. Fill this in.

**What this replaced, and why.** The backdrop was previously ESO's *Milky Way panorama*
(eso0932a, S. Brunier), CC BY 4.0. It looked good, but the licence made the credit mandatory and
the client requires none, so it was replaced. The credit that used to sit in
`src/components/AuditSection.tsx` was removed with it, along with the `.audit-credit` rules in
`src/styles.css`.

**Sources rejected while looking for a replacement** — recorded so nobody re-treads this:

- **NASA/Goddard SVS Deep Star Maps 2020.** Asks for credit as a courtesy, and carries an
  **ESA/Gaia DR2** layer that is not NASA's to place in the public domain. Ships only as EXR,
  which `sharp` cannot read. Rejected on licence, not on quality.
- **Candidates 002, 004, 005, 006** in the same working folder. 004 and 005 are ground-based
  shots with the galactic plane diagonal or off-centre. 002 and 006 do not wrap: their two
  vertical edges hold different sky (`spread` 5–7 and 8–30 respectively), which no seam
  correction fixes. 003 wraps perfectly but has no galactic plane.
- **All six fail the pole test**, established 2026-08-20 — none of them is an equirectangular
  panorama, including the one that shipped. Do not reach back into this folder for a "better"
  candidate on the strength of the notes above; they were written before anyone looked at a
  pole. See "The projection problem" below.

**How the shipped files are derived.** Source is the 4096 × 2048 PNG above, then:

1. A 5 × 5 **median filter**, which removes point stars while leaving the diffuse gas and dust
   lanes intact. Two reasons, and the byte saving is the lesser one: the scene draws its own star
   field on a nearer shell where the stars parallax and twinkle, so photographed stars would be a
   second, static, contradictory set.
2. Lanczos3 downscale, and the wrap seam levelled at the shipped width by the median per-channel
   offset.
3. **`convergePoles`** — the polar correction, added 2026-08-20. See below.
4. **AVIF, quality 59.** Capped by the 200 KB budget rather than chosen freely. See the
   block-ratio table in `scripts/prepare-sky-panorama.mjs` for why the measured ratio overstates
   what is visible here.

Four files ship; exactly one is ever fetched.

| file | size | block ratio | VRAM |
|---|---|---|---|
| `sky-panorama.avif` | 188,787 bytes | 1.747 | 33.6 MB |
| `sky-panorama.webp` | 217,166 bytes | 3.459 | 33.6 MB |
| `sky-panorama-narrow.avif` | 82,088 bytes | 1.549 | 8.4 MB |
| `sky-panorama-narrow.webp` | 88,002 bytes | 2.314 | 8.4 MB |

Regenerated 2026-08-25 with the latitude-ramped median (see below). The desktop AVIF got
**smaller and cleaner while its block ratio went UP** — that is the ruler, not the picture. The
ratio is block-boundary steps over WITHIN-block steps, and removing point stars near the poles
shrinks the denominator. Rank encoder settings with the ladder; let the scene decide.

**The desktop AVIF is held under a client budget of 200 KB.** Do not raise the quality to improve
the block ratio without checking that number first. Sizes are given in **bytes** on purpose:
"200 KB" is ambiguous by a factor that decides this, and q60 lands at 202,169 bytes — under 200
KiB, over 200,000. Every file this project has shipped cleared both readings, which is why the
quality is an odd 59 rather than a round 60.

AVIF is the primary; WebP exists only for browsers that cannot decode AVIF, reached by attempting
the AVIF and letting it fail. The narrow pair is served below 767 px viewport width. 4096 is the
ceiling the source allows, and wider is empty upscaling.

The image is sampled as equirectangular in **galactic** coordinates: the galactic plane lies on
the horizontal centreline (`v = 0.5`) and the galactic centre at `u = 0.5`. `SkyShell` depends
on this. A celestial/equatorial panorama would need an extra fixed rotation and is not what
ships.

### The projection problem — read this before sourcing a replacement

**The shipped image is a flat 2:1 picture, not an equirectangular panorama.** The prep script's
only projection guard was `width === height * 2`, and aspect ratio is not projection — every
flat 2:1 image passes it. The screen that chose this asset checked wrapping and whether a
galactic plane was present; neither looks at a pole.

The shader maps `v = asin(dir.y)/π + 0.5`, so **the top row is the zenith**: one point of sky
smeared across all 4096 columns, near-identical pixels in a real panorama. Per-channel row
standard deviation at each pole over the equator's:

| source | top | bottom |
|---|---|---|
| ESO `eso0932a` — a real panorama | **0.029** | 0.152 |
| `sky-panorama-001` — shipped | **0.670** | 0.383 |
| candidates 002–006 | 0.319 – 0.838 | 0.174 – 1.257 |

Read the gap, not a threshold: the reference itself scores 0.152 at its own bottom pole. The
prep script prints this number for every file, on both sides of the correction.

Untreated it renders as a pinwheel of radial spokes converging on a vertex, with a hard straight
wedge where the meridian lands — reported as "you can see the edge of the image".
`convergePoles` mitigates it by fading each row toward its azimuthal mean over the polar caps.
**It cannot make the image a panorama**, so the residual "zoomed" look is the source's and only
a different source fixes it.

**Screening a replacement:** exactly 4096 × 2048 (the standing format for every space
background), no attribution obligation of any kind, desktop AVIF under 200,000 bytes, and a pole
ratio near the reference rather than near the candidates. Then **look at it** —
`node scripts/preview-sky-poles.mjs <candidate.png>` — because the pole ratio is a good source
screen and is useless for verifying a correction. Full working in
`docs/audits/reports/sky-panorama-projection-2026-08-19.md`.

### Amended 2026-08-25 — the spokes were still there, and the caps are now repaired at runtime

The 2026-08-19 `convergePoles` pass removed the pinwheel **above about 75 degrees only**. Its fade
is a smoothstep from 55 to 90, so its weight at 60 degrees of latitude is 0.06 — everything from
roughly 45 to 75 degrees was untouched, and that is most of a pole view. Every star the 5x5 median
left behind was still being drawn as a radial dash, because a point in a flat image maps near a
pole to a shape whose radial extent is constant while its azimuthal extent shrinks.

Two changes, one in the asset and one at runtime:

1. **The median window now ramps with latitude** — 5 at the galactic plane, 15 by 60 degrees, ramp
   starting at 25. The core and the dust lanes are inside 25 degrees and keep the original filter
   exactly, so the "median 9 softens the core" trade that rejected a stronger global filter is
   declined rather than paid. Point stars are high-entropy, so this freed 50 KB, which was spent
   back on quality: **AVIF q59 to q70**, re-measured from scratch.
2. **The caps' remaining radial symmetry is repaired in `shell.frag.glsl`**, by sampling this same
   texture a second time through a fixed 90-degree rotation and applying it as a multiplier whose
   mean over the cap is 1 by construction. The shipped files are unaffected by this half.

**The caps are dark because the source's top and bottom rows are dark**, not because
`convergePoles` darkened them — it is mean-preserving on both passes. Do not brighten them.

This source is dimmer than the ESO one, so `skyBrightness` in
`src/experiences/earth/config/introConfig.ts` moved from 0.22 to 0.60 and `skyContrast` from 1.25
to 1.00. Swapping the image without retuning that pair is what makes a new sky look black.

Regenerate with `node scripts/prepare-sky-panorama.mjs <path-to-png>`.

---

## `public/earth/{day,night,specularClouds}.jpg`

Provenance not recorded when these were added. **Outstanding:** confirm the source and licence
of the Earth maps and record them here. They are almost certainly NASA Visible Earth / Blue
Marble, which is public domain, but "almost certainly" is not a licence record.
