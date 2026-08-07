# ADR 004 — Transition and Prefetch

Status: **Accepted** — 2026-08-07

## Context

The product requirement for the Earth ⇄ Murcia transition is specific: it has its own
duration, but it must never *wait*. No loading state, no stall, no hitch.

Three costs could produce one:

1. Downloading and Draco-parsing a 456 KB GLB.
2. Compiling the city's shader programs.
3. Uploading geometry attribute buffers for 957 GPU-instanced buildings.

## Decision

### The transition is a hard cut under a flash

`useExperienceTransition` runs a GSAP timeline: cover to full black (0.32s, `power2.in`),
**swap on that frame**, reveal (0.5s, `power2.out`). The swap changes the active scene, the
active camera and which experience owns input, all at full cover.

Never a cross-fade. `docs/earth/DECISIONS.md` calls this the project's single most
important visual principle, and both intro substitutions already work this way. It is also
what makes the transition cheap: there is no frame on which both worlds are drawn.

The flash reuses the existing `.warp-overlay` element via a third `SequenceState`
contributor, `transitionOverlay`, combined by the same `max()` rule as the other two.
`CameraController` remains its single DOM writer — which is why P3 kept it running while
inactive.

Durations are asymmetric on purpose: matching them reads as a dissolve.

### Murcia prefetches during the intro, non-blocking

`murcia:model` joins the boot manifest with `required: false`, mirroring the existing
`satellite:assets` precedent. It contributes to the drawing's measured progress but can
never gate readiness — `required` is what unlocks the intro's final zone, and Murcia is
not required to render the scene the warp cuts into.

Weight is deliberately low (10 against a 110 total): these are the only manifest bytes the
viewer is not actually waiting for.

### Warming is two operations, not one

`MurciaExperience.warm()`:

1. `renderer.compileAsync(scene, camera)` — shader programs and texture uploads. Verified
   against three 0.174: signature is `compileAsync(scene, camera, targetScene = null)`, and
   it works on a scene that is not R3F's default.
2. **One render into a 1×1 `WebGLRenderTarget`.** `compileAsync` does *not* upload geometry
   attribute buffers; three does that lazily on first draw (`PROJECT_MEMORY` §2.4). This is
   the smallest draw that still walks the whole visible graph. A tiny render target rather
   than the canvas because Earth is still on screen.

Progress is reported to 0.8 during download, with the last slice held for the warm — the
same split the corner logo uses, so the drawing's fill cannot claim the city is ready
before it can actually be shown.

## Failure behaviour

- **Load fails** → `isUsable` is false, `onReady` never fires, and the transition button is
  never offered. An entry point into a world that cannot render is worse than no entry
  point. The manifest step is left un-done, which is harmless because it is not required.
- **Warm fails** → reported and swallowed. It costs a hitch on first show, not correctness.

## Consequences

- The button is gated on `murciaReady` rather than shown-and-disabled. Because the city is
  prefetched during the intro, it is normally already warm by the time the timeline reaches
  `site`, so the button simply exists.
- A button, never scroll (`murcia/PROJECT_MEMORY` §2.1): touch has no `wheel`, single-finger
  drag is committed to navigation, and an accidental scroll must never warp the viewer to
  another world. Murcia already `preventDefault`s wheel for this reason.
- Re-entrancy is guarded: without it a double click starts a second timeline whose reveal
  races the first one's cover, and the overlay can settle at any value.
- The timeline is killed and the overlay forced to 0 on unmount. Leaving it part-way up
  would black out the page permanently.
