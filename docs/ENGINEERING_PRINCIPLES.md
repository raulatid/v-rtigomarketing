# Engineering Principles

## 1. Purpose

This document defines the engineering principles used to design, implement, review, and refactor this repository.

These principles apply to both human developers and AI coding agents.

They exist to prevent complexity from accumulating as the application gains new scenes, interactions, animations, assets, transitions, and runtime responsibilities.

The primary engineering objective is not minimizing code quantity.

The primary objective is minimizing the amount of knowledge required to understand and safely modify the system.

---

# 2. Complexity Is the Primary Design Constraint

Treat complexity as the main long-term cost of software.

A design becomes problematic when a developer must understand too many unrelated details to make a local change safely.

Prefer designs that reduce:

- Number of assumptions
- Number of coordinated edits
- Hidden dependencies
- Required contextual knowledge
- Temporal ordering requirements
- Special cases
- Cross-module state knowledge

Fewer lines of code do not necessarily mean lower complexity.

More files do not necessarily mean better modularity.

Judge design primarily by cognitive load.

---

# 3. Understand Before Changing

Before modifying a subsystem, understand its runtime flow and ownership.

Do not infer the architecture solely from:

- Filenames
- Directory names
- Local code snippets
- Method names
- Comments

Trace the relevant runtime behavior.

Identify:

- Who creates the subsystem
- Who owns it
- Who calls it
- What state it depends on
- What resources it owns
- How it is destroyed
- What other modules depend on its behavior

Do not perform structural refactors based on partial understanding.

---

# 4. Prefer Deep Modules

Prefer modules with:

```text
small interface
+
substantial useful behavior
```

A good module hides implementation complexity behind a simple contract.

Avoid shallow wrappers that add another layer without hiding meaningful knowledge.

Examples of potentially deep modules include:

- Asset-loading infrastructure
- Navigation systems
- Interaction systems
- Resource lifecycle management

A module that merely forwards arguments to another module is usually not providing meaningful abstraction.

---

# 5. Information Hiding Is a Design Requirement

Implementation details should remain inside the module that owns them.

Consumers should know only what is necessary to use a capability correctly.

Prefer:

```ts
navigation.focusDistrict(id)
```

over requiring external code to coordinate:

```text
camera target
camera position
duration
easing
interpolation state
cancellation
navigation bounds
```

If consumers repeatedly need internal knowledge, the module boundary is likely too shallow.

---

# 6. Pull Complexity Downward

Complexity should be handled by the module best positioned to understand it.

Do not force every caller to reproduce the same low-level decisions.

For example, callers should not repeatedly need to know:

```text
Draco decoder path
GLTF loader configuration
cache semantics
decoder initialization
```

if an asset-loading module can own those decisions.

A small increase in internal module complexity is acceptable when it substantially simplifies all consumers.

---

# 7. Encapsulate Complexity; Do Not Redistribute It

Moving code is not the same as simplifying code.

A refactor that turns:

```text
one difficult module
```

into:

```text
eight tightly coupled small modules
```

may increase complexity.

Evaluate whether the refactor reduces the amount of knowledge required to understand the responsibility.

Do not optimize for file size in isolation.

---

# 8. Interfaces Should Express Intent

Interfaces should describe what the caller wants to accomplish, not the low-level mechanics required to accomplish it.

Prefer:

```ts
focusDistrict(id)
```

over:

```ts
setCameraPosition(...)
setCameraTarget(...)
setDuration(...)
setEasing(...)
beginCameraInterpolation()
```

Prefer domain language whenever the abstraction represents domain behavior.

Good interfaces hide mechanism.

---

# 9. Clear Ownership Over Convenience

Every long-lived mutable resource should have one clear owner.

This applies especially to:

- Renderer
- Canvas
- RAF
- Event listeners
- Camera
- Controls
- Timelines
- State
- GPU resources
- Timers
- Observers

Do not allow two modules to implicitly believe they control the same resource.

Shared access does not imply shared ownership.

Ownership must determine cleanup responsibility.

---

# 10. Avoid Temporal Coupling

Avoid APIs that require callers to remember fragile sequences such as:

```text
call A
then wait
then call B
but only after C
unless D already occurred
```

Prefer interfaces and state models that enforce valid transitions.

If order matters, encode that constraint into the design whenever practical.

Undocumented call ordering is hidden complexity.

---

# 11. Design Invalid States Out Where Practical

Prefer APIs and state models where incorrect use is difficult.

Do not rely exclusively on runtime error handling for states the design can prevent.

For example, it is better to expose an operation that can only execute when an experience is valid than to accept arbitrary partial state and validate it repeatedly.

Error handling is necessary.

Preventable errors should still be prevented by design.

---

# 12. Duplication Is Cheaper Than the Wrong Abstraction

Do not create shared abstractions solely because code appears similar.

Two pieces of code may look similar while representing different responsibilities.

This is particularly relevant to Earth and Murcia.

For example:

```text
Earth camera behavior
Murcia camera behavior
```

both manipulate cameras but represent different systems.

Temporary duplication is preferable to coupling independent concepts through a false abstraction.

Abstract only after the shared responsibility is understood.

---

# 13. Every Abstraction Must Pay Rent

Every abstraction should provide meaningful value.

A useful abstraction should do at least one of the following:

- Hide complexity
- Enforce an invariant
- Centralize a real policy
- Remove meaningful duplication
- Provide a stable boundary
- Reduce consumer knowledge
- Simplify lifecycle management

If an abstraction only adds indirection, it should probably not exist.

---

# 14. Generalize Carefully, Not Speculatively

Slightly general interfaces can improve module design when they simplify the current system.

Do not build speculative frameworks for hypothetical future requirements.

Avoid premature constructs such as:

```text
UniversalSceneFramework
GenericExperiencePluginSystem
UniversalCameraManager
```

unless the repository already demonstrates a real need for them.

Solve current architectural problems while leaving reasonable extension points.

---

# 15. Prefer Stable Concepts Over Incidental Similarity

Organize modules around responsibilities and concepts, not implementation accidents.

Good boundaries usually survive internal implementation changes.

Poor boundaries often depend on:

- Current file layout
- Current library choice
- Current animation implementation
- Current object naming
- Temporary visual structure

Prefer concepts such as:

```text
navigation
loading
interaction
experience lifecycle
resource ownership
```

over abstractions tied to temporary implementation mechanics.

---

# 16. Preserve Conceptual Integrity

Use consistent solutions for the same kind of problem unless there is a clear reason not to.

Avoid solving equivalent responsibilities with unrelated patterns across the codebase.

For example, do not arbitrarily mix:

```text
callbacks
custom events
polling
global state
promises
```

for equivalent asynchronous responsibilities.

Consistency reduces cognitive load.

Consistency must not override legitimate differences between domains.

---

# 17. Keep State Local

State should live at the lowest level that fully owns the behavior.

Do not promote state to application scope because another subsystem might someday need it.

Prefer:

```text
Murcia interaction state → Murcia
Earth intro state → Earth
Application transition state → Application
```

Global state should exist only for genuinely global responsibilities.

---

# 18. Avoid Hidden Global State

Global mutable state creates implicit dependencies.

Avoid:

- Hidden singleton state
- Mutation through unrelated modules
- Global event buses without clear ownership
- State stored indirectly in DOM nodes
- Runtime behavior controlled by undocumented globals

If global state is necessary, its ownership and mutation rules must be explicit.

---

# 19. Separate Migration From Refactoring

Behavior-preserving migration and architectural refactoring are different operations.

Do not combine them unnecessarily.

During migration:

```text
preserve behavior
establish compatibility
verify correctness
```

After successful migration:

```text
identify real duplication
improve boundaries
remove debt
simplify architecture
```

If migration and refactoring happen simultaneously, failures become significantly harder to diagnose.

---

# 20. Preserve Behavior Before Improving Structure

When moving proven functionality into a new architecture, first reproduce its existing behavior.

Only then perform broader structural improvements.

Exceptions are allowed when the existing structure is directly incompatible with the target architecture.

Intentional behavior changes must be explicit.

Do not hide product or visual changes inside refactors.

---

# 21. No Speculative Refactoring

Do not refactor adjacent systems merely because they are visible during a task.

A refactor should be justified by:

- The requested change
- A correctness problem
- A demonstrated complexity problem
- A required architectural invariant
- A measurable performance issue
- Removal of proven dead code

Unrelated cleanup increases change scope and risk.

---

# 22. Keep Changes Locally Understandable

A local feature should require primarily local reasoning.

If adding or modifying one interaction requires coordinated edits across many unrelated modules, reconsider the design.

A strong architecture allows most feature work to remain inside the module that owns the behavior.

---

# 23. Prefer Fewer, Stronger Interfaces

Avoid exposing many configuration switches unless consumers genuinely need them.

Every public parameter becomes part of the conceptual surface of a module.

Prefer strong defaults and high-level operations.

Do not expose internal flexibility merely because the implementation supports it.

---

# 24. Comments Explain Why

Comments should provide information that code cannot express clearly by itself.

Good comments explain:

- Architectural constraints
- Browser behavior
- Performance trade-offs
- Non-obvious invariants
- Reasons behind unusual implementation
- Why an apparently simpler solution is incorrect

Avoid comments that simply restate the code.

Example to avoid:

```ts
// Increment index
index++;
```

Comments should preserve design knowledge.

---

# 25. Difficult Documentation Often Signals a Difficult Interface

If an API requires extensive explanation of exceptions and call ordering, inspect the design before adding more documentation.

Statements such as:

```text
Call this only after X, except when Y,
unless Z has previously been called...
```

often indicate excessive temporal coupling or a weak abstraction.

Improve the interface when possible.

---

# 26. Dependencies Must Have a Reason

Every dependency increases the conceptual surface of the project.

Before adding a library, evaluate:

- Runtime size
- Maintenance status
- Tree-shaking behavior
- Browser cost
- Whether the functionality already exists
- Whether the dependency introduces a new architectural pattern
- Whether the problem can be solved more simply

Do not add dependencies merely for convenience.

---

# 27. Performance Is a Feature

Performance requirements influence architecture.

This project contains interactive WebGL experiences, so performance cannot be deferred to final cleanup.

Design decisions should account for:

- CPU cost
- GPU cost
- Draw calls
- Texture memory
- Geometry memory
- Asset transfer size
- Main-thread work
- Device pixel ratio
- WebGL context count
- Per-frame allocation
- Mobile hardware

Avoid designs that inherently perform unnecessary continuous work.

---

# 28. Measure Before Optimizing

Do not introduce complexity for hypothetical performance gains.

Measure first.

Relevant metrics include:

```text
FPS
frame time
CPU time
GPU time
draw calls
triangles
texture memory
asset size
network transfer
startup time
```

Optimize demonstrated bottlenecks.

Keep performance improvements only when their complexity cost is justified.

---

# 29. Prefer Static Work Over Runtime Work

Where appropriate, move work out of the runtime.

Potential examples:

- Baked lighting
- Preprocessed geometry
- Texture atlases
- Trim sheets
- Compressed assets
- Precomputed metadata
- Geometry Nodes during asset authoring
- Offline optimization

Do not compute every frame what can be computed once.

Runtime simplicity is valuable.

---

# 30. Avoid Per-Frame Allocation

Rendering code should avoid unnecessary temporary allocations inside frequently executed loops.

Prefer reusable temporary vectors, matrices, arrays, and structures where this materially affects hot paths.

Do not micro-optimize code that is not performance-sensitive.

Measure hot paths first.

---

# 31. Dispose What You Own

Modules that own runtime resources must explicitly release them.

Do not depend on garbage collection for GPU resources.

Pay particular attention to:

- Three.js geometries
- Materials
- Textures
- Render targets
- Event listeners
- Controls
- Observers
- Timers
- Animation timelines
- RAF callbacks

Cleanup is part of correctness, not optional maintenance.

---

# 32. No Silent Architectural Changes

Do not change architectural ownership or dependency direction as a side effect of implementing a local feature.

If a task conflicts with an architectural invariant, treat it as an architectural issue.

Examples include:

- Moving renderer ownership
- Introducing a second permanent render loop
- Creating direct Earth ↔ Murcia dependencies
- Introducing global state
- Changing the asset-loading model
- Making shared infrastructure depend on an experience

Such changes require explicit justification.

---

# 33. Respect Module Boundaries

Do not bypass a module's interface to manipulate internal state from another part of the application.

Avoid reaching through abstractions simply because internal objects are accessible.

For example, application orchestration should not directly manipulate Murcia camera internals.

Expose the high-level operation the application actually needs.

---

# 34. Avoid Boolean Configuration Growth

Repeated boolean flags often indicate a module serving too many behaviors.

Be cautious with APIs such as:

```ts
createScene({
  useControls: true,
  autoStart: false,
  interactive: true,
  useIntroMode: false,
  ...
})
```

A growing matrix of flags creates invalid combinations and hidden complexity.

Prefer cohesive modules with clear responsibilities.

---

# 35. Do Not Hide Important Side Effects

Functions with significant side effects should make those effects conceptually clear.

Important side effects include:

- Starting render loops
- Adding global event listeners
- Mutating application state
- Allocating WebGL resources
- Starting timelines
- Changing active controls

Initialization helpers should not silently create long-lived global behavior.

---

# 36. Make Lifecycle Transitions Idempotent Where Reasonable

Operations such as cleanup should tolerate predictable repeated use when practical.

For example, destroying an already destroyed module should not accidentally recreate state or leave partial resources.

However, do not hide genuine lifecycle bugs merely to make APIs permissive.

Development invariants should still surface incorrect ownership or impossible states.

---

# 37. Error Handling Should Preserve Meaning

Do not catch errors simply to prevent them from appearing.

Error handling should answer:

- Can the system recover?
- Who owns the recovery?
- Should the user be informed?
- Is this fatal to the experience?
- Is this fatal to the application?

Do not invent fallback states that are not actually implemented.

---

# 38. Prefer Explicit Failure Over Corrupted State

When a required invariant cannot be preserved, a clear failure is usually safer than continuing with partially initialized behavior.

This is particularly important for:

- WebGL initialization
- Required runtime assets
- Experience lifecycle
- Renderer ownership
- Scene loading

Silent degradation should exist only when the degraded mode is intentional and implemented.

---

# 39. Delete Dead Code

Unused code increases cognitive load.

Remove verified:

- Dead branches
- Obsolete helpers
- Commented-out implementations
- Unused dependencies
- Legacy entry points
- Temporary migration adapters

Before deletion, verify that code is genuinely unused across runtime paths, dynamic imports, tooling, and build behavior.

Version control is the archive.

Source files should not serve as historical storage.

---

# 40. Keep the System Simpler After Every Change

A successful change should ideally leave the system easier to understand or at least not materially harder.

"Simpler" means:

- Fewer hidden assumptions
- Clearer ownership
- Smaller conceptual surface
- Fewer coordinated changes
- Better information hiding
- More predictable lifecycle
- Fewer special cases

It does not necessarily mean:

- Fewer files
- Fewer classes
- Fewer lines
- More reuse

---

# 41. Agent-Specific Rules

AI coding agents working in this repository must follow these additional constraints.

## Before implementation

Inspect the relevant code path and architecture before modifying it.

Do not infer global behavior from a single file.

## During implementation

Do not perform unrelated refactors.

Do not create speculative abstractions.

Do not silently modify architectural decisions.

Preserve existing behavior unless the task explicitly requires a change.

## When encountering architectural conflict

Surface the conflict explicitly in the implementation notes.

Do not quietly work around an architectural invariant.

## After implementation

Verify:

- Type correctness
- Build correctness
- Runtime behavior
- Resource lifecycle
- Relevant performance behavior
- No new dead code
- No duplicate ownership
- No accidental cross-experience coupling

---

# 42. Review Questions

Before merging a significant change, ask:

1. Does this change reduce or increase the amount of knowledge required to work on this subsystem?
2. Who owns every new mutable resource?
3. Is the lifecycle explicit?
4. Does the interface express intent or mechanics?
5. Is a new abstraction genuinely hiding complexity?
6. Could duplication be safer than the proposed abstraction?
7. Has state been placed at the lowest correct level?
8. Does this introduce hidden temporal coupling?
9. Does this create new global state?
10. Does it add unnecessary per-frame work?
11. Does it change an architectural invariant?
12. Are GPU and DOM resources cleaned up correctly?
13. Is the behavior preserved where expected?
14. Was performance measured if optimization motivated the change?
15. Will the next developer need less or more context to modify this safely?

If the answer to the final question is "more", reconsider the design.