# The sky panorama is not equirectangular — Audit

**Diagnosed:** 2026-08-19 · **Corrected and verified:** 2026-08-20 · **Against:** working tree
at `a207f2b`
**Reported as:** "the image is the one that's supposed to be used, but it's like zoomed" and
"the moment the image collapses, users can see the edge of the image".
**Touches:** `scripts/prepare-sky-panorama.mjs`, `scripts/preview-sky-poles.mjs` (new),
`public/textures/sky-panorama*`, `CREDITS.md`, `DECISIONS.md` §19 and its supersession ledger,
`PROJECT_MEMORY.md` §9/§11.55/§12, `plans/000-testing-strategy.md` §6.

---

## 1. Executive summary

**One root cause produces both symptoms, and it is in the asset, not the renderer.**

The image that replaced the ESO panorama on 2026-08-18 is a flat 2:1 picture, not an
equirectangular projection. The shader maps it over the entire sphere regardless, so the top
and bottom strips — which in a real panorama converge to a point — get wrapped into discs
around the poles. Their horizontal detail becomes azimuthal detail and renders as a **pinwheel
of radial spokes on a vertex, with a hard straight wedge along the meridian**. That is the
"edge of the image".

It got through because the only projection guard in the prep script is `width === height * 2`.
**Aspect ratio is not projection.** Every flat 2:1 image passes it, and all six CC0 candidates
screened in the 2026-08-18 swap fail the actual test.

Fixed by fading each row toward its own azimuthal mean over the polar caps. **The first attempt
— band-limiting each row to what its latitude can resolve — drove the measured pole ratio from
0.54 to 0.015 and changed the picture not at all.** §4 records why, because that trap is more
reusable than the fix.

The perceived *zoom* is a separate matter and is only partly fixable — see §6.

---

## 2. The measurement

`shell.frag.glsl` maps `v = asin(dir.y)/π + 0.5`, so the top row **is** the zenith: one point
of sky smeared across all `W` columns. In a real panorama those pixels are near-identical.

Row standard deviation at each pole over the equator's, **computed per channel and averaged**:

| source | top | bottom |
|---|---|---|
| `eso0932a.tif` — the panorama this replaced | **0.029** | 0.152 |
| `sky-panorama-001.png` — **shipped** | **0.670** | 0.383 |
| `sky-panorama-002.png` | 0.583 | 0.549 |
| `sky-panorama-003.png` | 0.319 | 0.174 |
| `sky-panorama-004.png` | 0.563 | 1.235 |
| `sky-panorama-005.png` | 0.581 | 0.560 |
| `sky-panorama-006.png` | 0.838 | 1.257 |

**Read the gap, not a threshold.** The reference itself scores 0.152 at the bottom, so a rule
like "under 0.05" would reject a real panorama. The candidates sit at 0.319 and above; that
separation is what means something.

**Per channel matters.** Pooling R, G and B into one distribution also measures the spread
*between* the channel means, so a perfectly converged row — flat in each channel, at three
different levels — still scores non-zero. Pooled, a pole row that was in fact constant read
0.473. That very nearly sent this investigation after a bug in the correction that was only
ever in the ruler.

---

## 3. Why it renders as an edge

The top strip of the image is wrapped into a disc around the pole, so its **horizontal detail
becomes azimuthal detail**, compressed harder the closer to the pole it lands. It renders as a
pinwheel of radial spokes converging on a vertex, with a hard straight wedge where the meridian
lands. The ESO image has none of this, because in a real panorama the content near the top rows
is the pre-stretched version of a small patch of sky and un-stretches when mapped.

Section 4 records why the obvious reading of this — "unresolvable detail, therefore aliasing,
therefore anti-alias it" — is wrong, and what it cost to find out.

**Both poles are reachable at rest.** The sky's pole lies along `bandAxis(22°) = (0.375,
0.927, 0)`. Centring it requires a camera `phi` of **158°** (north) or **22°** (south),
against an orbit clamp of `phiMin 0.15` / `phiMax π − 0.15` — that is **8.6° to 171.4°**. Both
are inside it, so ordinary dragging reaches them; no debug hook is needed to reproduce.

**The warp is where it gets noticed.** `CameraController.applyWarp` runs three things off one
`speed(p)` bell:

- FOV **45° → 74°** (`warpTransition.ts:44-46`). Angular magnification drops
  `tan(37°)/tan(22.5°) = 1.82×`, pulling ~1.8× more sky into frame at once. Half-angles go
  from 22.5° vert / 36.4° horiz to **37° / 53.3°** at 16:9.
- Camera radius **× 0.25** (14 → 3.5), which parallaxes the r=180 star shell against the
  effectively static r=1000 sky.
- The look-at swings off the globe centre toward the Murcia destination, sweeping the frame
  across sky never seen at rest.

Nothing geometric is wrong: the sky sphere encloses the camera by ≥12× even at the closest
warp pose. **The boundary being seen is in the texture, not the mesh.**

---

## 4. The fix, and the wrong turn on the way to it

`convergePoles` in `scripts/prepare-sky-panorama.mjs` does two things, and **only the second
one fixes the reported problem.** That is worth recording precisely, because the first is the
one that sounds right.

### What did not work: the band limit alone

Low-pass each row circularly to the harmonic count its latitude can carry — kernel width
`1/cos(lat)`, two box passes. This is the textbook anti-aliasing for equirect, has no width to
tune and no edge where correction starts, is untouched at the equator, and collapses the pole
row to its own mean.

It drove the measured pole ratio from **0.54 to 0.015**, and the rendered pole view was
**indistinguishable from before**. The reasoning was wrong: the spokes are not unresolvable
detail being aliased, they are resolvable content being stretched. At 22.5° from the pole —
the edge of a 45° frame centred on it — the kernel is **2.6 pixels out of 4096**.

**A pole ratio near zero says the pole row is constant. It says nothing about the ring one
degree out.** The metric agreed with a picture that was still visibly broken, which is exactly
the failure mode this project's own §19 already warned about in another form: an earlier pass
at the sky swap "built a 568-line candidate script and 44 MB of quality-ladder output without
ever putting one candidate in the scene".

The band limit is kept — it is genuinely correct at the innermost degree and costs nothing —
but it is not the fix.

### What works: fading toward the azimuthal mean

Each row is pulled toward its own azimuthal mean, `smoothstep` weighted from
`POLE_FADE_START_DEG = 55` to the pole.

The spokes are the image's *horizontal* detail becoming *azimuthal* detail when the top strip
is wrapped into a disc. A real panorama has genuine sky there; this has a picture stretched
into an annulus. Removing the azimuthal variation is the only thing that removes them.

Toward the row mean rather than to a flat colour, so the caps keep their brightness and colour
gradient and read as sky receding rather than a disc pasted over a hole.

**55° was chosen by rendering**, not derived: the pole view at the scene's widest FOV (74°, the
warp peak) at 90 (off) / 65 / 55 / 45. 65 already removes both things that read as an edge —
the convergence vertex and the hard meridian wedge. 45 is cleaner and flattens noticeably more
sky. 55 is the balance.

### Two details that are load-bearing

- **It runs after `levelSeam`, not before.** `levelSeam` ramps a per-channel offset across the
  width; running it second would paint that ramp — a few units against a sky background near
  12/255 — back across the pole rows and reopen what was just closed.
- **Round, not ceil, on the band-limit radius.** `ceil` turns a strict kernel of 1.41 at 45°
  latitude into a 3-px span and visibly softens the mid-latitudes for nothing.

### Results

| | before | after |
|---|---|---|
| pole convergence vertex, rendered | present | **gone** |
| hard meridian wedge at the pole, rendered | present | **gone** |
| pole ratio (source, at ship width) | 0.54 / 0.40 | 0.015 / 0.016 |
| desktop AVIF | 190,839 bytes (q50) | **194,642 bytes** (q59) |
| seam (signed) | −0.235 | −0.235, unchanged |
| resting-view e2e baselines | — | **pass unchanged**, within 2% |

That last row is the useful one: the resting backdrop screenshots did not move, which
independently confirms the correction is confined to the polar caps and does not touch the sky
the scene shows at rest.

Note the pole ratio is **unchanged by the fade** — it was already ~0 after the band limit. It
cannot see the fix. Keep rendering the pole view.

### AVIF quality moved 50 → 59

Not a preference. The correction removes detail the encoder was spending bits on — a little
from the band limit, far more from the fade — which walked the affordable quality up two
steps. The ladder was re-run twice on the corrected content and is in the script header.

**Why 59 and not 60.** "200 KB" is ambiguous by a factor that matters here. q60 is 202,169
bytes: 197.4 KiB, which passes a 1024-based reading and fails a 1000-based one. Every file
this project has shipped was under 200,000 bytes on both readings, so crossing that line
silently on a client requirement is not the script's call to make. q59 is 194,642 bytes, under
either, and at block 1.666 gives up essentially nothing against q60's 1.647.

Note also that the `block` ratio read *higher* after the band limit at identical settings (q50:
1.680 → 1.815). That is largely the ruler: the ratio is block-boundary steps over within-block
steps, and the correction drives within-block steps near the poles toward zero, shrinking the
denominator. A smoother image can score worse while looking better.

---

## 5. Why no check caught it, and why one still doesn't

- `checks/space-backdrop.ts` never touches `SPACE_CONFIG.sky` despite its name. Its 29 checks
  are entirely about the procedural star field and the galactic band density.
- `e2e/backdrop.spec.ts` is two pixel baselines at rest plus an attribution-absence test. Its
  own comment concedes it cannot aim the camera at the seam.
- The candidate screen that chose this image checked wrapping and whether a galactic plane was
  present. Neither looks at a pole.

**A Node harness cannot close this.** Decoding AVIF needs `sharp`, a 40 MB native binary the
project deliberately keeps out of `package.json`. The measurement therefore lives in the prep
script, which already requires `sharp` via `npm i --no-save`, and is printed on both sides of
the correction for every file it writes.

**And a metric would not have closed it either.** The pole ratio this audit introduces is a
good *source screen* — it separates the reference at 0.029 from every candidate at 0.319 and
above — but it is blind to the artifact once the pole row itself is constant. The thing that
caught the fix not working was rendering the pole view and looking at it. Any future change
here needs a picture, not a number — which is why `scripts/preview-sky-poles.mjs` now exists:

    npm i --no-save sharp
    node scripts/preview-sky-poles.mjs            # the two shipped AVIFs
    node scripts/preview-sky-poles.mjs <candidate.png>

---

## 6. What is fixed, and what is not

**Fixed:** the pole artifact — the convergence vertex and the hard meridian wedge — verified by
rendering both poles on the shipped AVIFs at the scene's widest FOV.

**Not fixed, and not fixable here:** the image is still a flat picture stretched across 360°.
Its features are drawn at whatever angular scale that stretch produces, which is the remaining
contributor to the "zoomed" complaint. No filter recovers a framing the image never had.

**Settled by decision, not a defect:** space backgrounds are **4096×2048** (2048×1024 narrow)
from now on — client decision, 2026-08-20. That fixes the texture at 11.4 px/deg against a
~20 px/deg viewport — 1.76× magnification, against the 1.17× the 6144-wide ESO source gave. It
is accepted. `WIDTH_WIDE` and `WIDTH_NARROW` are correct as they stand, and the
`width < WIDTH_WIDE` guard means a source must be exactly 4096×2048.

If the sky still reads as zoomed after this, **the answer is a different source, not a
different filter** — and the pole test above is how to screen one.
