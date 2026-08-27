# Procedural cubemap sky — art-direction discovery

**Ran:** 2026-08-25 → 2026-08-27 · **Against:** the work now on `main` (was `proto/sky-cubemap`)
**Plan:** `plans/005-sky-cubemap-prototype.md` · **Facts it stands on:**
`plans/005-sky-cubemap-prototype-research.md` (read that first; it is not re-derived here)
**Touches:** `src/app/protoSky.ts`, `src/experiences/earth/scene/SkyShellCube.tsx`,
`shaders/sky/shellCube.frag.glsl`, `camera/debugCameraHook.ts`, `scripts/proto/*`,
`plans/005-sky-cubemap/scenes/*.json`, `DECISIONS.md` §19.

---

## 1. Executive summary

**C6 is the chosen direction, and it is not finished.**

Nine variants were baked and measured. C6 (`scenes/c6-aurora.json`, `?sky=c6`) is the only one
that delivers the brief — a blue *and* purple nebula — while leaving the Earth sitting in true
black. It runs at `skyBrightness 1.0 / skyContrast 1.0`: no runtime correction at all, because
the exposure curve is baked into the scene rather than applied in the shader.

**Nothing is promoted.** The site still ships the 113 KB flat photograph. C6 is reachable only
through `?sky=c6` in a dev or preview build — `protoSky.ts` is gated on `DEBUG_TOOLS_ENABLED`,
so in production the parser is never consulted and the variant is unconditionally null. Merging
this work changes what a visitor sees not at all; `e2e/backdrop.spec.ts` passing against its
committed baselines is what proves that rather than what asserts it.

**Four things block promotion.** They are §4. The fourth is not a sky problem at all — it is a
pre-existing defect in the Earth scene that a bright sky merely made visible, and it is the one
that should be chased first.

## 2. What was measured, and how

"The nebula is too dark" is an opinion until it is a number. `scripts/proto/measure-sky.mjs`
samples a sky-only region of a capture — no Earth, no orbit rings, no chrome — and reports
mean, p50, p95, max and the share of pixels above 8/255. Every row below is the same region at
the same `overview` camera:

| variant | mean | p50 | p95 | % lit |
|---|---|---|---|---|
| baseline (shipped photo) | 18.05 | 17.09 | 27.79 | 100% |
| a / b / d | ~0.08 | 0 | 0 | ~0.3% |
| c (first pass) | 0.09 | 0 | 0 | 0.3% |
| c2 (carved) | 0.12 | 0 | 0.07 | 0.3% |
| c3 (filament) | 31.32 | 30.87 | 53.16 | 100% |
| c4 (aurora) | 0.34 | 0 | 1.43 | 0.4% |
| c5 (aurora) | 45.61 | 46.91 | 82.96 | 98% |
| **c6 (aurora)** | **4.79** | **3.72** | **12.51** | **16.7%** |

Two separate facts sit in the first two rows. The variants have true black negative space and
crisp point sources; the baseline has **neither** — p50 17 means it never reaches black
anywhere, and max 114 in a frame containing no bright star means its brightest object is a
smeared blob. **That is the resolution question answered, and it is the one the prototype was
built to ask.** A cubemap is sharper than the photograph, decisively.

The same table says the art direction was not delivered on the first pass: p95 = 0 means 95% of
the sky is literally zero, so there was no gas in frame at all. Exposure alone cannot fix that —
c at 10× reaches mean 1.82 while its stars climb to max 247, near clipping. The gas is authored
orders of magnitude below the stars, so the fix was the ramp, not `uSkyBrightness`.

C6's 16.7% lit is the target band: gas present and readable, most of the frame still black. Its
gas p95 sits at 0.0045 linear, so only star cores cross the 0.62 bloom threshold — the hero
galaxy is upper-right and clear of the Earth.

## 3. What C6 cost to find

Four techniques failed on the way, and each is worth more than the win:

- **The canonical carve technique does not apply here.** `purple-nebula-complex.xml` builds its
  look from a bright field cut back by black ridged layers through
  `one_minus_src_alpha`/`src_alpha`. C2 does exactly that and came out at p95 0.07 — a carve
  removes almost everything from an additive stack that starts from black rather than from a
  full-sky wash.
- **`powerAmount`, not `shelfAmount`, is the coverage control.** C5 raised the shelf, which
  should reduce coverage, and got *brighter* than C3 — because it also moved `powerAmount`
  0.4 → 1.0. The exponent is `1/powerAmount`, so below 1 it darkens hard.
- **Runtime contrast destroys hue.** `shellCube.frag.glsl` applies `pow(colour, contrast)` per
  channel, which drags every colour toward its dominant channel: at contrast 2.5 the violet
  layer (0.44, 0.20, 0.78) read as plain blue. Purple is the half of the brief that is not
  negotiable, so C6 puts the exponent into `powerAmount` — which shapes the noise, not the hue —
  and picks the peak colour outright. Baking it also spared the dim star field that runtime
  contrast had been crushing.
- **`dirLatDeg` is inverted** relative to `lonLatToDir`'s +Y-is-up convention: lat +15 puts the
  galaxy *below* frame centre, lat −15 above. lon 0 / lat 0 is exactly the direction behind the
  Earth at rest, which is what makes deliberate aiming possible at all.

**The shader is a finding too.** `shellCube.frag.glsl` is `shell.frag.glsl` with everything
removed: no `equirect()` projection, no second texture fetch through a 90° rotation to repair
the polar caps, no latitude-ramped blend between the two, no directional grain, no dither. All
of those exist to hide two properties of a flat photograph stretched over a sphere — no zenith,
no nadir, and always magnified at 11.4 px/deg. A cubemap has neither problem. **The polar
correction becomes unnecessary by construction, not by tuning**, and `convergePoles` has
nothing left to do.

## 4. Open issues — none of these are solved

**4.1 Visual quality is not settled.** C6 hits the measured band and reads as blue and purple,
but it has not been reviewed for banding, lattice structure or visible repetition — which is
exactly what killed the previous procedural attempt (§19). The measurement in §2 is a
brightness distribution; it cannot see structure. The 2026-08-25 pole-metric trap is the
standing warning: a ring metric read 1.16 where ordinary sky reads 0.37–0.80, and that was the
*dashes*, not gas. **A number moving the right way is not evidence that the picture is right.**
Review `contact/overview-c6@2x.webp` and `contact/warp-c6.webp` at native pixels before
trusting the table. The shipped `uSkyBrightness` 0.60 / `uSkyContrast` 1.00 pair is tuned to the
photograph and does not transfer (research part 3, §5); C6's 1.0/1.0 is a starting point, not a
tuned result.

**4.2 Seams are unverified.** There is no branch cut and no pole in a cubemap, so the
photograph's seam class is gone by construction. What has *not* been checked is continuity
across the six cube faces: the bake is driven through a third-party editor
(`export-skybox.mjs` drives the BinaryConstruct Skybox UI), and face-edge continuity is that
baker's property, not ours. No seam analysis was run. `contact/pole-c6.webp` exists but was shot
for polar behaviour, not for edge continuity. **Treat "no seams" as untested, not as
established.**

**4.3 The strange quad.** There is a **large hard-edged quad in the Earth scene**, visible in
the `rotated` frame of every bright variant and invisible against the shipped dark sky. It is
**not in the cubemap** — the baked faces contain no straight edge anywhere. Source not
identified.

This is the most important item on the list, and the reason is that it is not a prototype bug.
It is in the scene today, shipping, hidden only by the fact that the current sky is too dark to
reveal it. Any brightening of the backdrop — this prototype or anything else — exposes it.
**Chase it before productionizing anything.** Reproduce with `?sky=c6&stars=0&freezeEarth=1` at
the `rotated` camera; `contact/rotated-c6.webp` shows it, and `contact/rotated-baseline.webp`
does not.

**4.4 Weight and VRAM, both unresolved.** Two distinct costs:

- *Download.* File weight scales with content, hard: variant A's six faces are 3.5 MB, C6's are
  **117 MB** and C3's 150 MB, at the same 4096. **PNG is not a shipping format for this.**
  Productionization needs KTX2/Basis, which plan 005 puts explicitly out of scope. Until that
  exists, "ship C6" is not a costed proposal. Note that §19's byte argument was originally made
  against a hypothetical multi-megabyte sky, and the photograph it chose costs 113 KB.
- *VRAM.* 6 × 4096² RGBA with mipmaps off is ~402 MB — a real risk on weaker GPUs rather than a
  theoretical one. `?skyRes=2048` is ~100 MB. Plan 005 is explicit that dropping to 2048 is a
  **finding to record, not a workaround to apply quietly** — and it has not been recorded,
  because the comparison at 2048 has not been run. Mobile is a first-class target (§25), so this
  is a gate, not a footnote.

## 5. Recommendation

1. Keep C6 as the direction. Keep it dev-gated. Do not touch the shipped sky.
2. **Chase the quad (4.3) first**, independently of the sky decision — it is a live defect in
   what ships today.
3. Then answer 4.1 by review and 4.2 by inspection, in that order; both are cheap.
4. Only then cost 4.4. If KTX2/Basis and a 2048 comparison do not both come out acceptable, the
   honest outcome is that C6 stays a prototype and the photograph keeps shipping.

## 6. Reproducing any of this

```powershell
# The scene JSON is the deliverable; the faces are derived from it.
# Requires the editor running — see the header of scripts/proto/export-skybox.mjs
node scripts/proto/export-skybox.mjs c6
node scripts/proto/capture-sky-matrix.mjs      # writes the gitignored shots/
node scripts/proto/measure-sky.mjs             # the table in section 2
node scripts/proto/make-contact-sheet.mjs      # the committed contact/ WebPs
```

In the app: `?sky=c6&stars=0&freezeEarth=1`, dev or preview build only. `stars=0` matters — the
shipped panorama contains no stars at all (the median filter removed them), so every star on
screen today is a particle, and a baked sky has to be judged without them before the two are
judged together. `freezeEarth=1` stops the 0.035 rad/s surface spin, the only source of
screenshot non-determinism in the resting scene.
