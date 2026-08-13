# ADR 008 — The Render Pipeline Draws a Contract, Not an Experience

Status: **Accepted** — 2026-08-13
Extends: ADR 001 (renderer and scene ownership), ADR 002 (a single render pipeline)

## Context

ADR 002 made `graphics/RenderPipeline.tsx` the application's single render authority, and
ADR 005 gave the direct-rendering experience a composer borrow for the duration of a warp.
Both decisions are sound and neither is revisited here.

What neither ADR addressed is *how* the pipeline reached the experience it was drawing. It
did so by importing it:

```ts
import type { MurciaExperience } from '../experiences/murcia/MurciaExperience'

interface Props {
  murciaRef: RefObject<MurciaExperience | null>
  activeExperience: ExperienceId
}
```

and then, per frame:

```ts
if (activeExperience === 'murcia' && murcia) {
  gl.render(murcia.scene, murcia.viewCamera)
}
```

`ARCHITECTURE.md` §17 lists `graphics → murcia` under **Forbidden dependencies**. §29
restates it as an invariant: "Shared infrastructure does not depend on an experience." §16.6
adds that a shared module "does not expose experience-specific concepts" — and the string
literal `'murcia'` was a concept the pipeline had no business knowing.

Because no ADR had ever discussed it, this qualified under PRINCIPLES §32 as an
architectural change made silently during feature work. It was found by auditing the code
against its own documents, not by anything failing.

## Problem

The pipeline needed two things from an experience — a scene and a camera — and to obtain
them it took a dependency on the entire experience: its lifecycle, its navigation, its
asset loading, its 32 imports. The conceptual surface it consumed was two properties. The
surface it declared was a module.

The second-order cost is the one that matters. As written, adding Earth as a real
experience would have meant a second import, a second ref prop and a second branch on a
string literal, because the shape did not generalise.

## Decision

`graphics/renderableExperience.ts` declares what the pipeline actually needs:

```ts
export interface RenderableExperience {
  readonly scene: THREE.Scene
  readonly viewCamera: THREE.PerspectiveCamera
}

export type RenderRoute = 'composer' | 'direct'
```

The pipeline takes `directRef: RefObject<RenderableExperience | null>` and `route`. The
route is chosen by `SceneCanvas`, which already knows which experience is showing because
it mounts them both.

## Why this is cheap

`MurciaExperience` satisfies the interface **unchanged**. It already exposed `scene` and
`viewCamera` as getters, each with a comment explaining why the camera is not shared. The
interface is structural, so there is no `implements` clause and no coupling in the other
direction either — `experiences/murcia` does not import from `graphics/` to satisfy it.

The diff is a type, two prop renames and one branch condition. No rendering behaviour
changes: the composer borrow during a warp, the fallback to the composer while the direct
experience is still loading, and the unconditional per-frame draw are all preserved exactly.

## Trade-offs

- **The route is now stated twice** — once as `earthActive` in `SceneCanvas`, once as
  `route`. That is deliberate: the alternative is the pipeline inferring it, which is the
  thing being removed. Orchestration deciding and infrastructure obeying is the direction
  §5 asks for.
- **`RenderableExperience` is a shallow interface**, and PRINCIPLES §4 warns against those.
  It earns its place under §13 by enforcing an invariant rather than hiding complexity: it
  is the seam that makes a forbidden edge impossible to reintroduce without deleting the
  interface first.
- **It does not fix the whole file.** See below.

## What this does NOT fix

`RenderPipeline.tsx` still imports `IntroConfig`, `SequenceState`, `CornerLogo` and
`app/warpTransition`. These are Earth-intro and application concepts in shared
infrastructure — the same class of violation, on the Earth side.

They cannot be resolved the same way, because **Earth has no boundary to hide behind**.
`src/experiences/` contains only `murcia/`; Earth is spread across ~21 top-level paths with
no lifecycle object, so there is no interface to depend on instead. The import block carries
a comment saying so, pointing here.

Once Earth is extracted, those imports become a second `RenderableExperience` plus a small
pipeline-settings object, and the special case in this file disappears entirely rather than
being generalised. That is the intended end state; this ADR is the half of it that could be
done without moving thirty files.

## Consequences

- `graphics/` no longer imports any experience. The §29 invariant holds for the first time.
- Adding Earth as an experience is now additive — a second `directRef`-shaped prop or a
  route value — rather than a second branch on an experience id.
- The pipeline can be reasoned about, and eventually tested, without constructing a city.
