# ADR 007 — Loading has a deadline, and the deadline is a failure

Status: **Accepted** — 2026-08-07
Amends: plan 007 Phase 4 ("a timeout is not a readiness signal"), narrowly

## Context

The loading design draws a hard line: **a timeout may never be treated as ready.** The intro
must not release the sequence into a scene that cannot render, so `DRAW_TIMING.timeoutNotice`
(15s) is diagnostics only — it logs, sets a flag, changes the caption to *Esto está tardando
más de lo habitual*, and the intro keeps waiting. `boot.ts` says so in as many words: *"The
intro keeps waiting; it will NOT enter an unready scene."*

That reasoning is correct and is not being reversed.

What it did not account for is a required resource that **neither completes nor fails**.
Readiness is `REQUIRED.every(fraction >= 1)`, and `fatal` is only ever reached by an explicit
`markFatal`. A step that does neither leaves readiness pinned at `loading` with no path out
of it, forever.

The production-readiness audit found **three of the five required steps in exactly that
state**:

| Step | How it got stuck |
|---|---|
| `logo:assets` | The GLB error branch called `onFailed()`, which only logged. A 404 on a 20 KB file trapped every visitor. |
| `gpu:warmup` | `gl.initTexture()` sat outside the `try`, and `warmUp()` was called without `await` or `.catch`. |
| `orbits:build` | A bare `markDone` after a synchronous build that can throw. |

The visitor's experience of all three is identical and indistinguishable from a slow
connection: the outline holds at the pre-ready limit, the dot pulses to prove the page is
alive, and the caption sits on *Esto está tardando más de lo habitual* until they leave.
`No se pudo cargar la experiencia` — which exists, and is exactly the right message — was
unreachable for every one of them.

## Decision

Two parts, and the second exists because the first is not sufficient.

**1. Each required step gets a failure path**, chosen per step rather than uniformly:

- `logo:assets` — **done**, not fatal. The caller already degrades by holding the 2D isotype
  on screen, the site is entirely usable without the 3D mark, and the KTX2 texture beside it
  has always degraded this way. A decoration must not be able to stop the site existing.
- `gpu:warmup` — **done**. A cold GPU costs one stall at the reveal, which is the thing this
  optimisation avoids, not a broken scene. There is nothing here to be fatal about.
- `orbits:build` — **fatal**. The orbits carry the case studies and the reveal is composed
  around them.

**2. A hard deadline**, `DRAW_TIMING.hardDeadline` = 45s, that marks the boot **fatal** and
names the still-pending required steps in the reason.

## Why the deadline, given the three fixes

Because the three fixes address the failures that were found, and the deadline addresses the
class. Every one of these was a step that forgot to report; the next one will be too, and it
will be equally invisible in review — nothing in the type system or the harnesses connects
"a required manifest entry" to "every code path eventually resolves it".

The amendment is narrow and worth stating precisely:

> A timeout still may not report **ready**. It may now report **fatal**.

The original rule protects against showing an unready scene. Reporting fatal does not show
anything — it shows the failure caption. So the deadline cannot violate the invariant the
rule exists to defend, which is what makes it an amendment rather than a reversal.

45s is deliberately three times `timeoutNotice`. A genuinely slow connection reaches the
notice at 15s and is then given three times as long again. This is a last resort, not a
patience limit, and on any connection that will eventually succeed it never fires.

## Consequences

- The failure caption is now reachable from every required step, which was the point.
- `boot.ts` grows a `setTimeout` and an import of `DRAW_TIMING`. The intro entry went from
  12,996 B to 13,325 B against its 16,000 B budget — still standalone, still asserted.
- The timer is cleared when readiness reaches `ready`, so nothing is left pending on the
  happy path.
- `scripts/simulate-intro.mjs` models the playhead, not wall-clock boot, so it does not cover
  the deadline. It remains untested by the harness and is listed as such.
- Anyone adding a **required** manifest entry now has two obligations, not one: report
  completion, and report failure. The deadline is the backstop for forgetting the second, not
  a licence to.
