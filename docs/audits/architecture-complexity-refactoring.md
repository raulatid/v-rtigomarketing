# Architecture, Complexity & Refactoring Audit

## Context

This project has evolved through multiple prototypes and is becoming the long-lived production codebase.

The project combines several distinct domains:

- React application architecture
- Three.js / React Three Fiber
- 3D scene lifecycle
- camera control
- interactions
- content/UI
- asset loading
- configuration
- rendering quality
- animation
- post-processing
- responsive behaviour
- platform compatibility
- deployment

As the project grows, the primary architectural risk is no longer simply bugs.

The larger risk is accumulated complexity:

- responsibilities leaking across modules
- implicit dependencies
- duplicated knowledge
- unclear ownership
- special cases
- fragile sequencing
- shallow abstractions
- configuration spread across the codebase
- modules that require understanding several unrelated systems before they can be safely changed

This audit should be strongly informed by the principles in John Ousterhout's "A Philosophy of Software Design".

The objective is not "clean code" in the cosmetic sense.

The objective is to reduce the amount of complexity a developer must understand when making future changes.

This task is primarily an architecture audit.

Do not begin a broad refactor until the existing design has been mapped and the proposed architecture has been justified.

---

# Core Design Principle

Treat complexity as the primary cost.

Evaluate complexity through symptoms such as:

- Change amplification
- Cognitive load
- Unknown unknowns

Look for designs where a concept requires changes in many places, where understanding one module requires understanding several others, or where dependencies are difficult to discover.

Prefer designs that hide complexity behind deep, stable interfaces.

---

# Primary Objective

Determine whether the current codebase has:

1. Clear module boundaries.
2. Clear responsibility ownership.
3. Deep abstractions.
4. Appropriate information hiding.
5. Minimal cross-module knowledge.
6. Stable interfaces.
7. Predictable data flow.
8. Predictable lifecycle/resource ownership.
9. Centralized policy where policy should be centralized.
10. Localized implementation details.
11. Minimal duplication of knowledge.
12. Minimal special-case behaviour.
13. Low change amplification.
14. Low cognitive load.
15. Sufficient architectural documentation.

Identify opportunities where restructuring could make future development:

- safer
- simpler
- more modular
- easier to reason about
- easier for humans and coding agents to modify
- less likely to introduce regression

---

# Phase 1 — Build the Current Architecture Map

Before proposing changes, reconstruct the current architecture from the code.

## Start from the executable ground truth

Do not hand-derive what the repository already asserts.

`checks/architecture.ts` (`npm run check:architecture`, gated inside `npm run check`) reads the
real import graph and enforces the dependency rules recorded in `docs/ARCHITECTURE.md`: shared
infrastructure never imports an experience; `content/` never imports `experiences/`, `app/` or
`graphics/`; the two experiences never import each other; the boot entry depends on nothing; and
there are no circular dependencies. It names the offending file and specifier.

Five sibling harnesses cover behaviour the import graph cannot see — `check:navigation`,
`check:footprint`, `check:district`, `check:warp`, `check:space`.

Run them first. Treat their output as the verified baseline, and treat `docs/ARCHITECTURE.md`
§ "What the import graph cannot tell you" as the map of where hand analysis is actually required.

These harnesses are themselves part of the architecture. Assess them as such in Phase 26 and
Phase 27 rather than overlooking them.

## Identify:

- application entry points
- scene entry points
- React component hierarchy
- core modules
- services
- hooks
- contexts
- state stores
- configuration
- asset loaders
- renderer setup
- camera system
- animation systems
- interaction system
- content system
- post-processing
- responsive/platform logic
- routing
- deployment-related code

Produce a dependency-level architecture map.

For each important module identify:

- Responsibility
- Public interface
- Dependencies
- Consumers
- Mutable state owned
- Resources owned
- Lifecycle responsibility

Do not rely only on filenames.

Infer actual ownership from behaviour.

---

# Phase 2 — Responsibility Audit

For each important module, ask:

> What single coherent responsibility does this module own?

Identify modules that simultaneously own unrelated concerns.

Examples:

- camera logic + UI state
- asset loading + scene composition
- interaction detection + navigation policy
- renderer configuration + platform detection
- content definitions + animation behaviour

Flag modules where changes in one concern routinely require understanding unrelated concerns.

Avoid dogmatic "one function per file" thinking.

A module may be large and still be well designed if it hides substantial complexity behind a simple interface.

---

# Phase 3 — Deep vs Shallow Modules

Evaluate major abstractions using the deep-module principle.

A good module should expose a relatively simple interface while hiding substantial internal complexity.

Look for shallow abstractions where:

- interface complexity is close to implementation complexity
- callers must understand internal sequencing
- callers must configure many internal details
- modules mostly pass parameters through
- wrappers add indirection without abstraction

Identify:

- pass-through methods
- pass-through components
- pass-through hooks
- unnecessary adapters
- wrappers whose only purpose is forwarding

Do not assume more abstraction means better design.

---

# Phase 4 — Information Hiding

Identify implementation knowledge duplicated across modules.

Examples may include:

- decoder paths
- camera constants
- renderer configuration
- asset naming conventions
- scene identifiers
- quality parameters
- interaction semantics
- responsive breakpoints
- environment assumptions
- animation timing
- resource lifecycle knowledge

For each duplicated concept ask:

> Which module should own this knowledge?

Prefer one authoritative owner.

Identify cases where multiple modules must know the same internal implementation detail.

---

# Phase 5 — Change Amplification Analysis

Select representative future changes and simulate what files would need modification.

Examples:

### Scenario A
Add a new interactive district.

### Scenario B
Add another city scene.

### Scenario C
Change the camera navigation model.

### Scenario D
Introduce a new renderer quality level.

### Scenario E
Replace the texture/decoder loading strategy.

### Scenario F
Add another mobile-specific rendering constraint.

### Scenario G
Add a new post-processing effect.

### Scenario H
Change the way content is associated with geometry.

For each scenario determine:

- Number of modules affected
- Whether changes are conceptually related
- Whether duplicated updates are required
- Whether hidden coupling exists

High change amplification should be treated as architectural evidence.

---

# Phase 6 — Cognitive Load Audit

Identify files or systems where a developer must understand too much context before making a safe change.

Look for:

- long control flows crossing multiple modules
- complex lifecycle sequencing
- implicit state
- mutable global/shared state
- cross-context dependencies
- callbacks passed through many layers
- conditional behaviour distributed across files
- configuration assembled indirectly
- modules requiring knowledge of Three.js internals and UI policy simultaneously

Identify cognitive hotspots.

Complexity should be moved downward into appropriate abstractions rather than documented away where possible.

---

# Phase 7 — Unknown-Unknown Audit

Look for architecture where dependencies are difficult to discover.

Examples:

- side effects during imports
- global singleton mutation
- hidden event listeners
- implicit registration
- code relying on initialization order
- modules modifying shared objects they do not own
- undocumented cross-module state
- callbacks invoked indirectly
- hidden browser globals
- implicit scene-name conventions
- lifecycle behaviour triggered far from its owner

These are particularly dangerous because developers may not know they need to inspect them.

---

# Phase 8 — State Ownership

Map mutable state.

For each state value determine:

- Who creates it?
- Who owns it?
- Who can mutate it?
- Who observes it?
- When is it destroyed?
- Why is it React state, store state, local mutable state, or Three.js object state?

Look for:

- duplicate sources of truth
- state mirrored between React and Three.js
- derived state stored independently
- synchronization effects
- state lifted higher than necessary
- state hidden globally
- state exposed too broadly

Prefer clear ownership over universal accessibility.

---

# Phase 9 — Resource Ownership

This project contains non-trivial resources.

Audit ownership of:

- GLTF loaders
- Draco loaders
- KTX2 loaders
- workers
- textures
- geometries
- materials
- render targets
- EffectComposer
- post-processing passes
- observers
- browser event listeners
- animation controllers

For every resource answer:

- Who creates it?
- Who owns it?
- Who may use it?
- Who disposes it?
- When?

Unclear disposal is usually evidence of unclear ownership.

---

# Phase 10 — Lifecycle Architecture

Map lifecycle for:

- application
- canvas
- scene
- city/asset
- camera
- interaction
- post-processing
- loaders

Identify components relying on incidental React mounting/unmounting behaviour to manage important engine resources.

Determine whether lifecycle responsibility is explicit enough.

---

# Phase 11 — Configuration Architecture

Inventory configuration distributed across the project.

Look for:

- camera constants
- renderer settings
- quality values
- asset paths
- animation durations
- interaction thresholds
- breakpoints
- scene-specific values
- post-processing parameters

Classify configuration as:

- Product/design configuration
- Scene data
- Technical policy
- Implementation detail

Do not centralize everything into one giant config file.

Instead place each value with the abstraction that conceptually owns it.

---

# Phase 12 — Special Cases

Search for branches that exist because the architecture cannot represent a concept uniformly.

Look for:

- `if (city === ...)`
- `if (scene === ...)`
- object-name checks
- hardcoded asset-specific exceptions
- one-off camera behaviour
- device-specific special cases
- duplicated implementations with minor differences

Determine whether each special case is:

- inherent domain complexity
- temporary migration logic
- architecture leakage

Remove special cases by improving the abstraction only when doing so makes the common path simpler.

---

# Phase 13 — Temporal Decomposition

Look for modules organized around execution order rather than information ownership.

Examples:

- initializeX
- configureX
- prepareX
- startX
- updateX
- cleanupX

spread across unrelated files that all manipulate the same underlying concept.

Determine whether implementation knowledge has been fragmented by lifecycle phase.

Where appropriate, colocate related knowledge behind a single abstraction.

---

# Phase 14 — Pass-Through Architecture

Identify layers that add little abstraction.

Look for:

- components forwarding most props unchanged
- services forwarding API calls unchanged
- hooks exposing another hook unchanged
- functions forwarding arguments
- state passed through several components purely to reach a deeper consumer

Determine whether the layer:

- hides complexity
- enforces policy
- improves ownership

If not, consider removing it.

---

# Phase 15 — Interface Complexity

Inspect important APIs.

Count conceptually significant parameters.

Look for interfaces requiring callers to provide implementation details.

Bad signals include:

- boolean flag combinations
- large option objects
- callers knowing internal object structure
- callbacks required only to satisfy internal sequencing
- public APIs exposing Three.js internals unnecessarily

Prefer interfaces expressed in domain concepts.

---

# Phase 16 — Boolean and Mode Explosion

Search for modules controlled by many booleans.

Examples:

- `isMobile`
- `isTransitioning`
- `isEarth`
- `isCity`
- `isDebug`
- `isInteractive`
- `useBloom`
- `isLoading`

Determine whether combinations create implicit state machines.

Where behaviour genuinely represents states, consider explicit state modeling.

Do not introduce state-machine libraries unless complexity requires them.

---

# Phase 17 — Error Handling Complexity

Evaluate whether error handling creates unnecessary complexity.

Look for:

- repeated try/catch
- low-level errors propagated everywhere
- callers forced to understand implementation failures
- errors that can be eliminated by changing APIs

Apply the principle:

> Exceptions are easier to handle when the system is designed so fewer exceptional situations can occur.

Where possible, define interfaces that make invalid states impossible or irrelevant.

---

# Phase 18 — Dependency Direction

Construct the logical dependency graph.

Determine whether high-level policy depends directly on low-level implementation details.

Examples:

- UI knowing GLTF node structure
- camera policy knowing raw object-loader internals
- scene-specific code configuring global renderer internals
- asset loaders deciding navigation behaviour

Prefer dependencies that point toward stable abstractions.

Avoid circular conceptual dependencies even where JavaScript import cycles do not exist.

---

# Phase 19 — Domain Boundaries

Identify stable conceptual domains.

Possible domains may include:

- Rendering
- Scene/World
- Assets
- Navigation/Camera
- Interaction
- Content
- UI
- Quality/Capabilities
- Platform/Viewport
- Application orchestration

Do not force these exact boundaries.

Derive boundaries from the current system.

Determine which domains are currently mixed together.

---

# Phase 20 — React vs Engine Boundary

This deserves specific attention.

Determine whether React is being used for:

- declarative application composition

versus:

- high-frequency engine state

Identify places where React and Three.js responsibilities leak into each other.

Look for:

- React rerenders controlling per-frame engine state
- Three.js mutable objects becoming React state
- UI components manipulating renderer internals
- engine systems manipulating DOM/UI state directly

Define a cleaner ownership boundary where useful.

---

# Phase 21 — Data vs Behaviour

Inspect whether scene-specific data is embedded inside procedural/control code.

Potential examples:

- camera destinations
- district definitions
- interaction metadata
- asset paths
- content mappings

Determine whether stable data could be expressed declaratively without creating an over-generalized framework.

The goal is to add new content without modifying unrelated engine behaviour.

---

# Phase 22 — Duplicate Logic and Duplicate Knowledge

Search for both.

Duplicate code and duplicate knowledge are not identical.

Two similar functions may be harmless.

Two independently maintained copies of an important rule are dangerous.

Prioritize consolidation of duplicated knowledge such as:

- naming conventions
- quality rules
- loader setup
- navigation behaviour
- lifecycle rules

---

# Phase 23 — General-Purpose vs Special-Purpose Design

Evaluate whether abstractions are excessively tailored to current use cases.

Prefer moderately general interfaces when they become simpler than special-purpose ones.

Do not create speculative frameworks for hypothetical future requirements.

Generalization is justified when it reduces current complexity.

---

# Phase 24 — Comments and Documentation

Evaluate whether comments:

- explain why
- document invariants
- document interface contracts
- explain non-obvious design decisions

rather than simply restating code.

Identify modules whose interface cannot be understood without reading their implementation.

That is potentially evidence of a poor abstraction.

Cross-reference:

- `docs/ARCHITECTURE.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/adr/` — the accepted decision records
- other project design documents

Determine where documentation no longer matches implementation.

## Accepted decisions are not findings

`docs/adr/` records decisions that were already argued and settled. Several sit directly inside
this audit's blast radius: renderer and scene ownership, the single render pipeline, the
experience lifecycle, the pipeline contract, navigation as a gesture, content generated at build
time.

An architecture audit is precisely the exercise that rediscovers a deliberate decision and reports
it as a defect. Before filing any finding, check whether an ADR already covers it.

Where a finding contradicts an accepted ADR, cite the ADR and argue against it as a decision to be
revisited — with what has changed since it was accepted. Never report it as though the decision
were an oversight.

The same caution applies to work that is deliberately unfinished. Distinguish incomplete from
wrong before ranking anything.

---

# Phase 25 — Naming Audit

Identify misleading names.

Focus on names that hide conceptual errors rather than cosmetic preferences.

Look for classes/functions/modules whose names:

- describe implementation rather than responsibility
- represent several different concepts
- are overly generic
- no longer match what they own

Naming problems often reveal abstraction problems.

---

# Phase 26 — File and Directory Structure

Evaluate whether the directory structure communicates architecture.

Look for:

- unrelated systems colocated
- one conceptual feature spread across many generic folders
- generic `utils/`
- generic `helpers/`
- giant `components/`
- modules difficult to locate
- duplication caused by directory boundaries

Do not reorganize files merely for aesthetic consistency.

Directory changes should follow actual ownership boundaries.

---

# Phase 27 — Tests and Refactor Safety

Evaluate whether important architectural behaviour has tests sufficient to permit refactoring.

Begin from what already exists: `vitest` unit tests, the Playwright suite in `e2e/`, and the six
`checks/` harnesses from Phase 1. A rule that a harness already enforces does not need a proposal;
a rule stated only in prose is a candidate for one, because that is exactly how the documented
rule in `graphics/RenderPipeline.tsx` drifted unnoticed.

Identify high-value contract tests for:

- camera navigation
- asset loading
- interaction resolution
- configuration
- resource lifecycle
- scene transitions

Do not demand tests for trivial implementation details.

Before proposing risky structural changes, identify the tests needed to preserve behaviour.

---

# Phase 28 — Agent Maintainability

This project is expected to be modified by both humans and coding agents.

Evaluate whether an agent can identify:

- where a responsibility belongs
- which module owns a rule
- which interface should be used
- what must not be bypassed
- how resources are managed
- how new features should be integrated

Architecture should reduce the amount of repository-wide context required for a correct change.

Do not create agent-specific abstractions.

Good architecture for agents should also be good architecture for humans.

---

# Required Analysis Scenarios

Use at least these hypothetical future changes to test architectural quality:

1. Add another interactive district.
2. Add another city.
3. Change renderer quality policy.
4. Replace the camera transition implementation.
5. Add another post-processing effect.
6. Change GLTF decoder infrastructure.
7. Add a new type of clickable scene object.
8. Add another device capability rule.

For each, explain how many architectural areas currently need to change.

Then compare against the proposed architecture.

---

# Required Output

Write the audit to a dated report, leaving this brief unchanged:

`docs/audits/reports/architecture-complexity-refactoring-YYYY-MM-DD.md`

`docs/audits/` holds briefs — the audits that can be run. `docs/audits/reports/` holds the audits
that *were* run. Never write a report beside the briefs.

Before the report enters Git history it must satisfy the sanitization contract in
`docs/audits/README.md`: no credentials, secret values, personal data, authentication material,
raw production dumps, or exploit detail beyond the minimum reproduction. `npm run check:audit`
enforces the mechanical half and fails the build. The judgment calls are yours.

Open it with the header this directory uses:

```
**Date:** YYYY-MM-DD · **Against:** working tree at `<commit>`
**Brief:** `audits/architecture-complexity-refactoring.md`
```

If earlier passes exist, write the new one as a delta against them. Say so in the header. Earlier
passes remain accurate for everything the new one does not restate, and where the two disagree,
the newer one wins. Do not overwrite or delete a previous audit — it is the record of what was
true at its commit.

## 1. Executive Architecture Assessment

Classify the project as:

- Structurally strong
- Healthy but accumulating complexity
- Functional but architecturally fragile
- Significant restructuring recommended

Explain why.

---

## 2. Current Architecture Map

Document:

- major modules
- responsibilities
- dependencies
- state ownership
- resource ownership

---

## 3. Complexity Hotspots

Rank the areas producing the most:

- Change amplification
- Cognitive load
- Unknown unknowns

---

## 4. Refactoring Findings

Rank:

### P1 — Architectural liability
Likely to significantly increase defects or future development cost.

### P2 — Important improvement
Meaningful reduction in complexity.

### P3 — Opportunistic improvement
Useful when touching the relevant area.

Do not invent P0 unless existing architecture directly threatens runtime correctness.

For each finding include:

- Relevant files
- Current responsibility
- Complexity mechanism
- Why the current abstraction leaks
- Concrete example of future change amplification
- Proposed responsibility owner
- Proposed interface boundary
- Expected complexity reduction
- Migration risk

---

## 5. Proposed Target Architecture

Do not provide a completely theoretical rewrite.

Describe the smallest architecture that meaningfully improves the existing system.

For each proposed module/domain specify:

### Responsibility

What it owns.

### Interface

What other modules are allowed to know.

### Hidden knowledge

What implementation details it prevents from leaking.

### Dependencies

What it may depend on.

### Lifecycle

When applicable.

---

## 6. Dependency Direction

Provide the proposed high-level dependency model.

Highlight dependencies that should be removed or inverted.

---

## 7. State Ownership Model

Document where important state should live.

Identify existing duplicate sources of truth.

---

## 8. Resource Ownership Model

Explicitly define owners for important Three.js/WebGL resources.

---

## 9. Refactoring Roadmap

The roadmap must be incremental.

Do NOT recommend a rewrite.

Use stages such as:

### Stage 0 — Safety

Add tests/observability needed for structural changes.

Extend the existing `checks/` harnesses rather than building a parallel mechanism. Adding a rule
there is cheap and it runs on every `npm run check`.

### Stage 1 — Clarify ownership

Move responsibilities without changing behaviour.

### Stage 2 — Remove duplicated knowledge

Create authoritative owners.

### Stage 3 — Deepen abstractions

Simplify caller interfaces.

### Stage 4 — Remove obsolete layers and special cases

Only after replacement architecture is stable.

### Stage 5 — Documentation

Update architecture documents to describe the new reality.

Every stage must leave the application deployable.

---

# Design Principles

Use these principles during the audit.

## Complexity is incremental

Small local shortcuts accumulate into system-wide complexity.

Do not dismiss architectural leakage because each individual example is small.

## Working code is not enough

Code that works today but makes future changes risky is still a design problem.

## Modules should be deep

Prefer simple interfaces hiding substantial complexity.

## Information should be hidden

Implementation knowledge should have one clear owner.

## General-purpose modules can be simpler

When a slightly more general interface removes special cases and reduces caller knowledge, prefer it.

## Different layer, different abstraction

Avoid adjacent layers that expose essentially the same concepts.

## Pull complexity downward

Callers should not need to understand internal implementation details.

## Define errors out of existence

Where reasonable, design APIs where invalid states cannot be represented.

## Design twice

For important architectural changes, consider at least two plausible designs and compare tradeoffs before recommending one.

---

# Anti-Goals

Do NOT:

- Rewrite the project.
- Create abstractions solely to reduce line count.
- Split files merely because they are large.
- Create one-file-per-function architecture.
- Introduce design patterns without a demonstrated problem.
- Create unnecessary dependency injection.
- Build generic frameworks for hypothetical future needs.
- Add interfaces whose only purpose is forwarding calls.
- Replace readable explicit code with clever abstraction.
- Refactor working code purely for stylistic consistency.
- Introduce additional state management libraries without evidence.
- Treat every duplicate line as harmful duplication.
- Confuse fewer lines with lower complexity.

---

# Decision Rule

A proposed refactor should answer:

> What knowledge no longer needs to exist in the caller after this change?

If the answer is "none", the abstraction probably does not reduce complexity.

A second useful test is:

> Does this change reduce the number of places a future developer must understand or modify?

If not, reconsider the refactor.

---

# Final Constraint

The objective is not maximum modularity.

The objective is minimum complexity with clear responsibility boundaries.

Prefer the smallest number of modules capable of hiding the system's complexity effectively.