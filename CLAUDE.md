# Core repository rules

## 1. Understand before editing

Before changing code, inspect the relevant files, nearby abstractions, and existing patterns.

Do not introduce a new abstraction, dependency, architecture pattern, or naming convention when an established repository pattern already solves the problem adequately.

Prefer the smallest change that correctly satisfies the task.

Do not rewrite working code merely to make it cleaner unless the task explicitly includes refactoring.

---

## 2. Preserve user work and repository state

Treat all pre-existing modifications as user-owned work.

Never discard, overwrite, revert, stage, commit, reformat, or otherwise alter unrelated changes.

Do not use destructive Git operations such as:

- `git reset --hard`;
- `git checkout -- <file>`;
- `git restore` on unrelated work;
- forced branch changes;
- history rewriting;

unless explicitly requested and the consequences are clear.

Do not create commits or push changes unless explicitly asked.

---

## 3. Stay within scope

Implement only what is required to satisfy the task and its acceptance criteria.

Do not opportunistically:

- refactor unrelated code;
- rename unrelated symbols;
- reformat unrelated files;
- upgrade dependencies;
- fix unrelated warnings;
- remove unrelated dead code;
- change public APIs without need.

If another issue is discovered and does not block the task, leave it unchanged and report it separately if relevant.

---

## 4. Never guess repository behaviour

Do not assume commands, package names, file locations, APIs, environment variables, scripts, or architectural conventions.

Inspect the repository before relying on them.

Prefer repository-defined commands from files such as:

- `package.json`;
- workspace configuration;
- `Makefile`;
- task runners;
- CI configuration;
- project documentation.

Do not invent a command because it is conventional in similar projects.

---

## 5. Follow existing architecture and conventions

Match the surrounding code unless there is a concrete reason not to.

Preserve existing:

- module boundaries;
- naming conventions;
- error-handling patterns;
- state-management patterns;
- dependency direction;
- test organization;
- formatting and lint conventions.

Avoid introducing parallel implementations of an abstraction that already exists.

When changing a public interface, inspect its call sites before modifying it.

---

## 6. Dependencies require justification

Do not add, remove, or upgrade dependencies unless the task requires it.

Before adding a dependency, determine whether the repository or platform already provides the needed capability.

Prefer existing dependencies and standard-library functionality when they adequately solve the problem.

Do not modify lockfiles unless a dependency operation requires it.

Any dependency change must be intentional and visible in the final report.

---

## 7. Handle errors explicitly

Do not silently swallow errors.

Do not add broad exception handling merely to make tests pass.

Preserve meaningful failure behaviour unless the task explicitly requires changing it.

When introducing fallback behaviour, make sure it does not hide data corruption, invalid state, security failures, or programmer errors.

Prefer explicit failure over silently producing incorrect output.

---

## 8. Preserve compatibility unless told otherwise

Do not intentionally break existing public behaviour, APIs, persisted data, URLs, configuration formats, or supported inputs unless the task explicitly requires a breaking change.

When changing shared interfaces, inspect affected consumers.

If backwards compatibility is impossible or undesirable, make the break explicit rather than accidental.

---

## 9. Treat generated and vendored files carefully

Do not manually edit generated files unless the repository explicitly expects it.

Find and modify the source of generation instead.

Do not modify vendored or third-party code unless the task specifically requires it.

If generated output must change, use the repository's normal generation path and verify the resulting diff.

---

## 10. Do not weaken safeguards to make a change pass

Do not solve failures by disabling or weakening:

- tests;
- assertions;
- validation;
- type safety;
- lint rules;
- security checks;
- permission checks;
- feature guards;

unless changing that safeguard is itself part of the requested behaviour.

A failing safeguard should normally reveal a problem to fix, not an obstacle to remove.

---

## 11. Comments should explain why

Do not add comments that merely restate obvious code.

Add comments when they preserve information that is not evident from the implementation, such as:

- non-obvious constraints;
- architectural intent;
- compatibility requirements;
- external-system behaviour;
- important tradeoffs.

Remove temporary debugging comments before completing the task.

---

## 12. Temporary instrumentation must not survive accidentally

Debug logs, temporary files, screenshots, experimental code, feature flags, test-only hooks, and local instrumentation must not remain in the final diff unless they are intentional deliverables.

Before finishing, inspect the diff for temporary artifacts.

---

## 13. Security-sensitive data must not be exposed

Never commit or print secrets, credentials, private keys, tokens, session data, or sensitive environment values.

Do not copy secrets into tests, fixtures, logs, documentation, or example configuration.

Use the repository's established secret and environment-variable mechanisms.

If sensitive data is encountered unexpectedly, avoid reproducing it in output.

---

## 14. Final diff is authoritative

Before declaring the task complete, inspect the final diff.

Verify that:

- every changed file is intentional;
- no unrelated edits are present;
- no temporary debugging code remains;
- generated changes are expected;
- the implementation matches the requested scope.

The final diff is part of the acceptance criteria.











# Testing, validation, and scope discipline

The repository has a substantial test and verification surface. Use it deliberately.

Validation should be proportional to the change and its risk. More validation is not automatically better validation, and repeatedly running unrelated global checks during a local change is considered wasted work.

Repository-specific required checks, explicit task acceptance criteria, and explicit user instructions take precedence over the default heuristics in this section.

## Core rule

During implementation, use the cheapest targeted check capable of falsifying the current change.

At completion, run the narrowest set of checks that provides sufficient evidence for the change's integration risk.

Use broader gates at meaningful checkpoints, not after every edit.

Distinguish required gates from discretionary confidence checks:

- required gates must run when applicable;
- discretionary checks should run only when they materially reduce unresolved uncertainty.

A task is complete when:

1. the requested behaviour is implemented;
2. the directly relevant tests and checks pass;
3. any required integration, build, typecheck, or e2e validation passes;
4. the final diff contains only intended changes.

Once these conditions are satisfied, stop.

Do not continue investigating unrelated areas merely to increase confidence unless there is a concrete unresolved risk that materially affects correctness.

---

## 1. Preserve the working state

Before making changes, inspect `git status` and understand what is already modified.

Never overwrite, reformat, stage, revert, delete, or otherwise disturb unrelated user WIP.

Treat existing staged changes as user-owned unless the task explicitly says otherwise.

Prefer changes that are small and commit-coherent.

Do not create commits unless explicitly requested.

If commits are requested, keep independent fixes in separate coherent commits when practical.

Do not combine unrelated audit findings into one implementation merely because they were discovered in the same report.

Do not push unless explicitly asked.

A clean and well-scoped diff is part of the verification strategy because it reduces the uncertainty surface for subsequent work.

### Commands that may modify files broadly

Before running commands that can write beyond the immediate target files, understand their modification scope.

Examples include:

- formatters;
- lint autofixers;
- code generators;
- dependency installers;
- lockfile updates;
- snapshot updates;
- migrations;
- asset pipelines;
- build steps that emit tracked files.

Do not accept unrelated generated or reformatted changes into the diff.

After running a command with broad write potential, inspect the resulting diff before continuing.

---

## 2. Establish the baseline when relevant

If a directly relevant check already fails before the requested change, establish that baseline when practical.

Do not assume every failing test discovered during the task was caused by the current change.

If a failure is clearly pre-existing and does not block the requested work:

1. leave it untouched;
2. do not expand the task to fix it;
3. report it separately from regressions introduced by the change.

If a pre-existing failure prevents meaningful validation of the requested change, explain the limitation clearly and use the strongest narrower evidence available.

Do not claim a check passed if it did not.

---

## 3. During implementation: targeted validation only

While iterating, run only tests or harnesses that are directly capable of detecting a regression from the files or behaviour being changed.

Examples:

- navigation change → navigation tests or harness;
- Earth orbit change → Earth/orbit tests;
- Murcia interaction change → district/Murcia tests;
- content validation change → content/config tests;
- Studio schema change → Studio typecheck or schema-specific validation;
- documentation-only change → documentation or audit-hygiene checks;
- static asset re-encode → asset checks plus visual and size verification.

Do not run the entire unit suite after every edit.

Do not run every harness merely because it exists.

Do not run e2e as a substitute for a smaller test that already covers the behaviour.

If a targeted test fails:

1. determine whether the failure is caused by the current change;
2. fix the issue if it is in scope;
3. rerun the smallest relevant test first.

Broaden validation only when the narrower evidence is insufficient or reveals an integration concern.

---

## 4. Full repository gates are checkpoints

Run the complete repository gate when the scope justifies an integration checkpoint, normally:

- after finishing a complete feature whose integration surface is broad;
- before committing a cross-cutting architectural change, if a commit was requested;
- after changing shared infrastructure used by multiple subsystems;
- after changing build or repository-wide configuration behaviour;
- before a release or promotion;
- when required by repository policy;
- when explicitly requested.

Default rule: run the full repository gate at most once per completed task unless subsequent changes could invalidate the successful result.

A second full gate is justified when, for example:

- code changed after the successful run in a way that affects the validated surface;
- the first run exposed a failure that required another implementation change;
- a required final gate must be rerun because its inputs changed.

Do not repeatedly run the same green global suite without a concrete reason.

A green global suite is not improved merely by running it again unchanged.

---

## 5. Typecheck policy

Run typecheck when changing:

- TypeScript source;
- exported or shared types;
- schemas that affect generated or inferred types;
- compiler configuration;
- module resolution;
- configuration that affects compilation.

A documentation-only change does not require application typecheck unless repository policy explicitly requires it.

An image- or texture-only change does not require application typecheck unless code, metadata, generated files, or types also changed.

If a local package has its own typecheck, prefer that package's typecheck for package-local changes.

Use a repository-wide typecheck when the change crosses package boundaries, affects shared types, or repository policy requires it.

---

## 6. Build policy

Run a production build when the task can affect:

- bundling;
- tree shaking;
- build flags;
- environment handling;
- chunk boundaries;
- static asset resolution;
- generated production content;
- production-only behaviour;
- bundle budgets;
- packaging or deployment output.

Do not run production builds repeatedly during ordinary local logic edits.

For bundle-size, tree-shaking, or dead-code-elimination tasks, the emitted production artifact is part of the acceptance criteria.

Verify the relevant output directly—for example, the expected string, module, symbol, asset, or chunk—rather than inferring success from unit tests alone.

Default rule: one production build at the end of the task unless the build exposes a problem that requires another edit.

If build inputs change after a successful build in a way that could affect production output, rerun it.

---

## 7. E2E policy

Run e2e only when the changed behaviour is meaningfully end-to-end and is not sufficiently covered by lower-level tests.

Typical reasons include:

- boot or handover behaviour;
- navigation between experiences;
- route-level interaction;
- browser-dependent state or lifecycle behaviour;
- pointer, touch, wheel, drag, or pinch behaviour requiring a browser;
- production-only browser behaviour;
- visual interaction whose integration cannot be represented adequately by unit or harness tests.

Do not run the full e2e suite for:

- documentation changes;
- comments;
- pure helper functions with direct unit coverage;
- schema bounds;
- import-path cleanup;
- static type-only refactors.

Prefer the specific e2e spec or test relevant to the change before considering the complete e2e suite.

Use the full e2e suite only when the changed surface is broad enough to justify it or repository policy requires it.

---

## 8. 3D and visual changes require the right evidence

Automated tests cannot determine whether a 3D composition, animation, transition, layout, or other visual result looks correct.

For visual and 3D work, distinguish:

- structural correctness → tests and harnesses;
- performance characteristics → measurement when performance is part of the task;
- artistic or interaction acceptance → focused visual inspection.

Use automated checks to validate properties they can actually prove.

Do not compensate for missing visual judgement by running increasingly broad automated suites.

Do not launch a full performance audit for an ordinary visual change unless:

- performance is part of the acceptance criteria; or
- there is concrete evidence of a regression.

When visual inspection is required, inspect the smallest set of representative states necessary to validate the changed behaviour.

---

## 9. Security and performance audits are checkpoint activities

Deep security and performance audits are not normal development-loop validation.

Do not automatically perform repository-wide:

- secret sweeps;
- dependency audits;
- vulnerability scans beyond required repository gates;
- live production probes;
- full bundle attribution;
- GPU resource censuses;
- long-duration performance runs;
- multi-network-profile testing;
- whole-history Git analysis.

Use these only when:

- the task explicitly concerns them;
- repository policy requires them; or
- a concrete observation creates a material reason to escalate.

Do not turn a local implementation task into a general repository audit.

---

## 10. Do not expand scope because you noticed another issue

If unrelated pre-existing debt, suspicious code, or a separate defect is discovered:

1. determine whether it blocks the requested change;
2. if it does not block the task, leave it untouched;
3. mention it clearly in the final report when materially relevant;
4. do not turn the current task into an opportunistic refactor, cleanup, or audit.

A known issue may deserve a separate task and commit.

It does not automatically belong to the current one.

If fixing the unrelated issue is necessary to proceed, make the minimum blocking change and explain why it became part of the task.

---

## 11. Prefer deterministic evidence over redundant validation

Choose the verification that most directly proves the property being changed.

Examples:

- dead-code elimination → inspect the production bundle;
- asset size improvement → compare bytes and dimensions, then inspect the result;
- URL validation → adversarial unit cases;
- Studio schema correctness → Studio typecheck and schema validation;
- architecture boundary → architecture harness;
- content-source production guard → config test plus production-path invocation;
- generated-file correctness → inspect or validate the generated artifact;
- import cleanup → module-resolution or targeted compilation check.

Do not add or run broad tests when a narrower deterministic assertion proves the requirement more directly.

Prefer evidence that is:

1. causally related to the changed behaviour;
2. reproducible;
3. narrow enough to diagnose failures;
4. sufficient for the integration risk involved.

Test volume is not a substitute for test relevance.

---

## 12. Stop condition

After the acceptance criteria are satisfied and the appropriate validation is green, stop.

Do not keep searching for additional improvements.

Do not rerun unrelated tests "for completeness."

Do not rerun a successful global gate without a concrete invalidating change.

Do not ask another agent or model to independently re-audit a completed change unless unresolved uncertainty materially affects correctness.

Do not expand the task merely because additional possible improvements are visible.

The objective is not maximum possible verification.

The objective is sufficient, proportionate, and directly relevant evidence that the requested change is correct.

---

## 13. Final report for implementation tasks

At the end of an implementation task, report concisely:

- what changed;
- files changed;
- tests and checks actually run;
- typecheck status, if applicable;
- production build status, if applicable;
- e2e status, if applicable;
- any relevant pre-existing failure encountered;
- any known caveat deliberately left out of scope;
- commit hash, only if a commit was requested and created.

Clearly distinguish:

- checks that passed;
- checks that failed;
- checks that were not run;
- failures known to predate the change.

Do not describe checks that were not run as though they were verified.

Do not imply repository-wide correctness from a narrower test unless that narrower test is actually sufficient for the property being claimed.