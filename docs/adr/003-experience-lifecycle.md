# ADR 003 — Experience Lifecycle

Status: **Accepted** — 2026-08-07

## Context

The product requirement is that moving between Earth and Murcia never stalls, waits or
hitches, and that the move is reversible. Two lifecycle models were available:

- **Mount/destroy per transition** — the model `docs/plans/000-migration-plan.md` Phase 5
  assumes ("Confirm that the previous experience correctly stops or is destroyed").
- **Both permanently mounted** — nothing created or destroyed at the transition.

## Decision

**Both experiences are mounted for the application's lifetime.** A transition swaps which
one the render pipeline draws. Neither is ever destroyed.

`activate` / `deactivate` are therefore not lifecycle *phases* but a single boolean:
`ExperienceId` in React state (`src/app/experience.ts`), read as an `active` prop by every
layer that does per-frame work or consumes input.

## Rationale

Destroying and rebuilding is precisely the cost the product requirement forbids: a rebuild
means re-uploading geometry and recompiling shaders at the exact moment the viewer is
watching a transition. Keeping both resident spends VRAM — a bounded, one-off cost — to buy
a transition that cannot hitch.

It also makes reversibility nearly free, which is why Earth ⇄ Murcia was affordable at all.

## What "deactivated" means

**Frozen, not reset.** Every gate is an early return, never a state reset:

- `CameraController` stops writing the camera but **keeps writing the warp overlay** — it
  is that DOM element's only writer, and the transition flash depends on it.
- `OrbitSystemLayer` stops advancing its orbit clock, so satellites resume where they were
  instead of teleporting forward.
- `EarthScene` stops advancing the surface spin.
- `InteractionLayer` calls `rig.deactivate()` and `focus.setEnabled(false)`, and the rig
  keeps the pose the viewer left, so a return does not snap the camera.
- `GeoMarkersLayer` additionally hides its CSS2D DOM layer (`display: none`) — it sits at
  z-index 15, above the canvas, so leaving it visible would float Earth's labels over
  another experience. Hidden rather than unmounted so the `CSS2DObject` bindings survive.
- The corner logo is **not** gated. It is application chrome and persists across the
  transition (ADR 002).

## Input is gated, not detached

Earth's input goes fully inert without touching the DOM. Verified by reading every handler:

- `createFocusCameraRig` — every handler short-circuits on `!active`, or on
  `orbit.isDragging`, which `deactivate()` clears via `endDrag()`. Its `wheel` listener is
  `{ passive: true }`, so it cannot `preventDefault`. There is no `stopPropagation`
  anywhere in the module.
- `createSatelliteFocus` — `onPointerMove` only records coordinates; `onClick` returns on
  `!enabled`. Its capture-phase `keydown` on `window` only calls `stopPropagation()` while
  a satellite is *selected*, and `setEnabled(false)` deselects first. So Escape passes
  through once Earth is inactive.
- `createGeoMarkers` — already has `setEnabled`, which clears the cursor it writes.

Detaching listeners on deactivate was considered and rejected: it would mean rebuilding the
rig on every toggle, which reseeds the camera from `EARTH_REST` and would snap the pose on
return — the exact discontinuity this ADR exists to avoid.

## Consequences

- Peak VRAM holds both worlds. Accepted; bounded.
- `renderer.info` must show no growth across repeated transitions (verified in P6).
- P3 is behaviour-preserving by construction: `activeExperience` has no setter until P6, so
  it is always `'earth'` and every gate added here is unreachable.
