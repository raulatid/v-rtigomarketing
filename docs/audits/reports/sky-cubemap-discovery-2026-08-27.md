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

**Four things block promotion.** They are §4.

> **Amended 2026-08-27.** Two of the four were the same defect and are now closed: the faces
> were being assembled upside down (`flipY`), which made every cube edge a hard content step —
> that is §4.2's untested seams and §4.3's "strange quad", one bug, one line. The claim that
> §4.3 was "a pre-existing defect in the Earth scene" and "the one that should be chased first"
> was **wrong on both counts**; nothing in production was affected. Fixing it reopened part of
> §4.1, because C6's art direction was tuned against the broken assembly. §4.4 is untouched.

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

> **Every row above was measured through the broken face assembly (§4.2), and the c6 row no
> longer holds.** Correctly assembled, c6 at `overview` measures mean 1.70 / p50 0.43 / p95 8.43
> / 5.7% lit. The comparison between variants is still meaningful — they all shared the defect —
> but "c6 hits the target band" does not survive it. See §5.4.

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

> **A fifth, added 2026-08-27, and it is the expensive one.** Every measurement and every
> art-direction judgement in this document was made against a cubemap whose six faces were
> upside down (§4.2). The defect is invisible in any single face and shows only at the edges,
> so a whole discovery ran on top of it: nine variants baked, a brightness table, a chosen
> direction, an aimed hero galaxy. **A pipeline defect that does not disturb any one asset can
> sit under an entire body of work without contradicting it.** The general form is the one this
> project keeps rediscovering — the check has to be aimed at the seam between two things, not
> at either of them. Neither the 25-screenshot matrix nor the brightness harness could see it,
> because both looked at faces and frames rather than at joins.

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

## 4. Open issues — 4.2 and 4.3 closed 2026-08-27, 4.1 and 4.4 still open

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

**4.2 Seams — TESTED 2026-08-27, and they were real. Cause found and fixed.**

~~Treat "no seams" as untested.~~ It was tested, and every face boundary was a hard content
step. **The faces were reaching the GPU upside down.**

`exporter.ts`'s `rgbaToPngBlob` flips rows to turn GL's bottom-up readback into a top-down PNG.
That is correct for a 2D image and wrong for a cube face, which GL already defines with a
top-left origin — the flip does not undo a convention, it introduces one. `THREE.CubeTexture`
then sets `flipY = false` in its constructor, so nothing undid it on the way in.

This is invisible face by face. Every face is internally coherent, and a vertically mirrored
nebula is still a plausible nebula; `negy.png` opened on its own is clean, organic, and has no
straight edge anywhere. It shows only where two faces MEET.

Measured over all 12 cube edges by sampling directions either side of each edge, against a
within-face control at the same angular separation:

| face convention | cross-edge | within-face | ratio |
|---|---|---|---|
| **flipY per face (the fix)** | 3.684 | 3.380 | **1.09** |
| rotate 90 cw | 16.102 | 3.333 | 4.83 |
| rotate 90 ccw | 18.137 | 3.333 | 5.44 |
| rotate 180 | 18.986 | 3.380 | 5.62 |
| *as-loaded — what shipped in the prototype* | *19.085* | *3.380* | *5.65* |
| flipX | 20.399 | 3.380 | 6.03 |
| transpose / anti-transpose | 20.3–20.5 | 3.333 | 6.10–6.15 |

Ratio 1.09 means a face boundary is indistinguishable from ordinary sky. Every other assembly,
including the one that shipped, is 4.8–6.2. The fix is `texture.flipY = true` in
`SkyShellCube.tsx` — the exact inverse of the export flip, not a tweak that happened to look
better.

In the render, at the new `cube-edge` pose, the vertical profile stepped from `rgb(2,3,21)` to
`rgb(0,0,1)` in one row and stayed there — half the frame was black. After: continuous, row mean
declining 4.06 → 4.01 → 3.96 across the same boundary, no step. Before/after at
`contact/seam-cube-edge-flipy.jpg`, `seam-cube-corner-flipy.jpg`, `seam-rotated-flipy.jpg`.

**Why this survived the first pass:** `pole` and `nadir` aim at the CENTRE of a ±Y face. A
45° frame at 16:9 has a 40.2° half-diagonal and a face edge is 45° off axis, so the boundary
misses the corner of the frame by ~5°. **The two poses named for the worst case were the two
that could not show it.** `cube-edge` and `cube-corner` were added to `capture-sky-matrix.mjs`
to aim down the structures instead, and `?skyDebug=faces` tints by dominant axis and draws the
boundary, so a line on screen can be checked against it rather than guessed at.

**4.3 The strange quad — RESOLVED 2026-08-27. It is 4.2, and it was never a scene defect.**

The quad is the `negy` face boundary. Projecting the cube corner `(-1,-1,+1)` and its two edges
through the `rotated` camera predicts the apex at (414.1, 206.6) against (410, 204) measured off
the contact sheet, and edge slopes dx/dy of −2.59 and +1.26 against −2.58 and +1.29. `rotated`
is the only pose in the matrix that ever put a cube corner on screen, which is exactly the
"only in `rotated`" pattern this entry described. It is gone with the `flipY` fix —
`contact/seam-rotated-flipy.jpg`.

**Two claims in the original entry were wrong and are worth naming.** "It is not in the cubemap"
— it was, and the reasoning that it could not be ("the baked faces contain no straight edge")
was sound about the faces and silent about how they are assembled. And "it is in the scene
today, shipping" — it is not: the shipped path is `SkyShell`, an equirect panorama with no cube
faces, and `e2e/backdrop.spec.ts` passes unchanged against its committed baselines. **Nothing
was ever wrong in production.** An inventory of every mesh in the Earth scene was taken while
chasing this and found no plane, cone, shadow volume or backdrop quad that could produce it;
that inventory is the reason the search moved to the sky.

**4.4 Weight and VRAM — UNRESOLVED, and as of 2026-08-27 this is THE blocker.** With 4.2 and
4.3 closed and 4.1 reduced to re-aiming, weight is what stands between C6 and promotion. It is
where the next session picks up.

**Measured 2026-08-27, so the next round argues from numbers rather than from impressions:**

| | size |
|---|---|
| `public/proto-sky/` — all 9 variants on disk | **621 MB** |
| `public/proto-sky/c6/4096/` — the chosen variant, 6 PNGs | **116.1 MB** |
| `dist/` as built on this machine | **631 MB** |
| `dist/` **excluding** `proto-sky` — what a deploy from git actually is | **9.3 MB** |
| `dist/assets/` — the JS/CSS a browser downloads | 1.5 MB |
| largest single shipped asset (`earth/specularClouds.jpg`) | 1.6 MB |

**Read the third and fourth rows together before panicking about the third.** Vite copies
`public/` into the build output verbatim, so the prototype's 621 MB lands in `dist/` — but
`public/proto-sky/` is gitignored (`.gitignore:110`) and Vercel builds from git, so those bytes
have never reached a deployment. **Production today is 9.3 MB and is not affected by any of
this.** The 621 MB is a local-only artifact of having nine baked variants sitting in `public/`.

What it does mean is that **C6 cannot be promoted in its current format under any circumstances**
— 116 MB of PNG for a backdrop, against a 1.6 MB largest shipped asset and a 113 KB photograph
that does the job today. That is not a tuning problem, it is a format problem, and plan 005 puts
KTX2/Basis explicitly out of scope. Note `public/libs/basis/basis_transcoder.wasm` is **already
in the tree** (0.5 MB), so the transcoder side of a KTX2 path is not a from-scratch job.

The two costs below are unchanged, and the 2048 comparison the first one needs still has not
been run:

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

**Amended 2026-08-27, after 4.2 and 4.3 turned out to be one defect.**

1. Keep C6 as the direction. Keep it dev-gated. Do not touch the shipped sky.
2. ~~Chase the quad first — it is a live defect in what ships today.~~ **Struck.** It was not a
   live defect and it was not in the scene; see 4.3. Nothing in production was ever affected.
3. 4.2 is closed: the seams were real, the cause was the face flip, and the fix is one line
   with a measured before/after.
4. **4.1 is now the open item, and the fix reopened part of it.** C6's art direction was tuned
   against the broken assembly, so the numbers in §2 describe a sky that no longer exists at
   that camera. Re-measured at `overview` after the fix: **mean 1.70, p50 0.43, p95 8.43,
   5.7% lit**, against the 4.79 / 3.72 / 12.51 / 16.7% recorded below. The correctly assembled
   sky is *dimmer and emptier at the resting view* and outside the target band. The hero galaxy
   was placed "upper-right and clear of the Earth" by looking at frames in which every face was
   upside down, so the aiming (`skyYaw`/`skyTilt`, and `dirLatDeg` in the scene JSON) needs
   redoing rather than the exposure needs raising. **Do not answer this with `uSkyBrightness`** —
   that is the mistake §3 already records for `powerAmount`.
5. **4.4 is the blocker and the next thing to pick up.** Untouched by this round — no mipmap
   comparison and no 2048 comparison was run. C6 is 116 MB of PNG against a 9.3 MB production
   build and the 113 KB photograph it would replace, so no amount of art direction makes it
   shippable in this format. The order for the next session is: get the format costed (KTX2 /
   Basis, and the 2048 comparison plan 005 asks to record as a finding), and only then spend
   time on §5.4's re-aiming — re-aiming a sky that cannot ship is work done twice.

   If KTX2/Basis and a 2048 comparison do not both come out acceptable, the honest outcome is
   the one this report has said from the start: **C6 stays a prototype and the photograph keeps
   shipping.** That is a legitimate result, not a failure — the prototype answered its actual
   question (a cubemap is decisively sharper) and the cost of acting on it is the open item.

## 6. Reproducing any of this

```powershell
# The scene JSON is the deliverable; the faces are derived from it.
# Requires the editor running — see the header of scripts/proto/export-skybox.mjs
node scripts/proto/export-skybox.mjs c6
node scripts/proto/capture-sky-matrix.mjs      # writes the gitignored shots/
node scripts/proto/measure-sky.mjs             # the table in section 2
node scripts/proto/make-contact-sheet.mjs      # the committed contact/ WebPs
```

Seam work specifically:

```powershell
# The two poses that can actually frame a cube boundary, plus the overlay that
# says whether a line on screen is the CUBE or the shell MESH.
node scripts/proto/capture-sky-matrix.mjs c6            # adds cube-edge, cube-corner, nadir
$env:SKY_DEBUG='faces'; node scripts/proto/capture-sky-matrix.mjs c6
$env:SKY_DEBUG='mesh';  node scripts/proto/capture-sky-matrix.mjs c6
```

In the app: `?sky=c6&stars=0&freezeEarth=1`, dev or preview build only.
Add `&skyDebug=faces` for the face-boundary overlay, `&skyDebug=mesh` for the shell
tessellation — the two are a real confound at the poles and the overlay is what separates them. `stars=0` matters — the
shipped panorama contains no stars at all (the median filter removed them), so every star on
screen today is a particle, and a baked sky has to be judged without them before the two are
judged together. `freezeEarth=1` stops the 0.035 rad/s surface spin, the only source of
screenshot non-determinism in the resting scene.
