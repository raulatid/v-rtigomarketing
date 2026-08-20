# ADR 010 — Content is generated at build time, and scene composition is not content

Status: **Accepted** — 2026-08-20
Amends: `DECISIONS.md` §18 (the logo is a CMS media URL — it is now a mirrored local path)
Amends: `DECISIONS.md` §26.13 (`SATELLITES` named as "the single seam an API would replace")

## Context

Every visitor-facing string in this repository was a static TypeScript module, and the client
needs to edit the case studies and the district copy in a headless WordPress install. The
question was not whether to connect a CMS but *where the network boundary goes*.

`caseStudies.ts` had already written down an answer, and it assumed a runtime fetch:

> the seam is `SATELLITES` in orbitConfig.ts, which would become a fetched value that
> OrbitSystemLayer waits on (its readiness flag already gates the intro, exactly like the
> Earth textures do).

That would have worked. It would also have put a third-party origin on the critical path of a
3D experience whose entire product is how fast and how smoothly it arrives — and it would have
needed a deadline, a fallback, a new required/optional boot resource, an async
`createOrbitSystem`, and CSP and CORS work, every piece of which is a new way for the site to
fail in a visitor's browser.

Three properties of this repo made the alternative cheap. The `checks/` harnesses already bundle
app modules for Node with esbuild, so a Node-side pipeline is an established shape rather than
new tooling. The content invariants were already asserted by tests (`districts.test.ts`). And
`npm run build` already runs `npm run check` before it builds.

## Decision

**WordPress is the editorial source of truth. Content is fetched, validated and emitted as
TypeScript modules in Node at build time. The browser never calls the CMS.**

**Generated modules are build output.** `src/content/generated/` is gitignored and written by
`npm run content:build` before every dev run, check and build. Git holds `content/fixtures/`
(development and test inputs) and `content/seed/` (an explicitly-drifting emergency snapshot).
Nothing pretends that a CMS edit produces a Git diff.

**The failure policy is strict, and production is the strict case.** A sync that cannot reach or
cannot validate the CMS exits non-zero, which fails the Vercel build and leaves the existing
deployment serving. A publish that cannot be validated must never report success, because a green
deployment is the signal an editor reads as "my change is live".

**Which case study occupies which orbit is scene composition, not editorial content.** `orbitId`
came off `CaseStudy` entirely; `src/experiences/earth/orbit/orbitAssignments.ts` binds preset to
case, mirroring what `cityDistrictBindings.ts` already did for Murcia. The CMS may hold any
number of case studies and publishing one does not create an orbit.

**Structural relationships are validation errors, not best effort.** A duplicate orbit
assignment, an unknown preset, or a case that a binding names and the content does not contain
all fail the build. Nothing is dropped with a warning.

**Generation is transactional.** Files are rendered to a temp directory and moved into place only
after every collection has mapped, audited and rendered. One invalid record fails its whole
collection; one failed collection fails the whole build.

## Alternatives considered

**Runtime fetch with a static fallback.** The shape `caseStudies.ts` assumed. Rejected on the
product's own terms: this is a 3D experience where runtime performance is what is being sold, and
a runtime fetch buys instant publishing at the cost of a permanent new failure mode. It also
needed everything listed in Context, none of which the build-time version needs at all.

**Pulling inside `vercel build` with a fallback to the last output.** Rejected because "the CMS
was down so we shipped something else" is indistinguishable from a successful publish in the
deployment record. The fallback is now a source you have to name.

**Committing the generated modules.** Attractive — reviewable diffs, offline builds, `git revert`
as rollback. Rejected because it claims a persistence model that does not exist: Vercel generating
files during a build does not commit them back, so the committed copy would go stale after the
first CMS-triggered deployment while still looking authoritative.

**Keeping `orbitId` on `CaseStudy` and resolving by it.** Fixes the ordering bug but leaves scene
composition editable in wp-admin. Rejected: the six orbits are hand-placed against the camera's
framing, and which client occupies which is a design decision that should be reviewable.

## Consequences

**Content is live one build after publishing, not instantly.** Accepted, and the reason the
publish flow is a Deploy Hook rather than a webhook into a running server.

**`npm run check` became the content validation gate.** Because `content:build` writes before
`check` runs, bad content from WordPress fails `npm run build` with the same assertions that have
always guarded hand-written content. That was not designed; it fell out of the ordering, and it is
the strongest single property of the arrangement.

**Nothing about readiness changed.** No new `StepId`, no change to `bootState.ts`, no async
`createOrbitSystem`, no interaction with `adr/007`'s deadline. `OrbitSystemLayer` is untouched.

**No CMS rewrite exists in `vercel.json`, and none is needed.** Content never crosses the network
at runtime and media is mirrored into `public/logos/`, so `connect-src 'self'` and
`img-src 'self'` are already sufficient. The same-origin rewrite that the security audit
recommends is now needed only for the audit form's future POST endpoint, which is a genuinely
different workstream (`API-2`, `API-3`).

**A CMS outage blocks every deployment, including a code-only hotfix.** This is the cost of strict
mode, and it is real. `content/seed/` exists to close it: a committed snapshot, selected by
`CONTENT_SOURCE=seed`, that prints a banner and is never a default. It will drift, nothing
refreshes it automatically, and the plan says so rather than calling it "last known good".

## How you would know it broke

A deployment that succeeded while the CMS was unreachable. A generated module carrying a
timestamp — the emitter is deterministic on purpose, and a per-run value would break both the
fidelity test and Vite's chunk hashing. `src/content/generated/` appearing in a commit. A case
study rendering another company's metrics, which is what `resolveOrbitCases` throws to prevent.
A satellite whose panel shows the previous satellite's logo, which is what the derived atlas grid
prevents.
