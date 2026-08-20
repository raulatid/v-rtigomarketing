# Cybersecurity & Project Security Audit

## Context

This project is transitioning from prototype status into the production website.

Security must therefore be evaluated beyond obvious source-code vulnerabilities.

The audit must inspect the complete attack surface of the project, including:

- Application code
- Client-side code
- Build configuration
- Deployment configuration
- Vercel configuration
- Dependencies
- Package management
- Repository contents
- Git history where available
- Environment variables
- Secrets management
- CI/CD
- Third-party services
- Browser security policy
- Network requests
- Static assets
- Public files
- Development tooling
- Debug functionality
- Operational practices
- Project structure and ownership
- Documentation that may expose sensitive implementation details
- Human or organizational weaknesses in how production changes are managed

The goal is not to generate a generic cybersecurity checklist.

The goal is to determine the realistic security posture of THIS repository and THIS deployment architecture.

This task is primarily a read-only security audit.

Do not modify production code until the audit is complete.

---

# Primary Objective

Identify any vulnerability, weakness, unsafe assumption, configuration problem, exposed information, dependency risk, architectural weakness, or operational practice that could allow:

1. Unauthorized access.
2. Code execution.
3. Data theft.
4. Secret leakage.
5. Dependency or supply-chain compromise.
6. Cross-site scripting.
7. Injection attacks.
8. Malicious redirects.
9. Unauthorized third-party content execution.
10. Browser security-policy bypass.
11. Manipulation of application state.
12. Abuse of APIs or external services.
13. Denial of service or resource exhaustion.
14. Exposure of internal architecture or sensitive metadata.
15. Deployment of unauthorized code.
16. Accidental production configuration changes.
17. Development/debug functionality leaking into production.
18. Exploitation caused by poor project organization rather than a direct code vulnerability.

Assume that anything shipped to the browser is public.

Do not treat client-side obscurity as a security boundary.

---

# Before You Start — Baseline and Delta

This brief is run repeatedly. Each run is a **delta** against the previous one, not a fresh start.

- Results of this brief are written to `docs/audits/cybersecurity-project-security-<YYYY-MM-DD>.md`.
  Earlier security results also include `docs/audits/reports/security-wordpress-api-2026-08-11.md` (2026-08-11, with a
  2026-08-20 addendum) and the security sections of the latest `docs/audits/production-readiness-vercel-*.md`.
- Read the latest security result and the latest production-readiness result **before Phase 1**.
- Re-verify **every finding still marked open** in those results and report its current status with
  evidence (see Required Output §0) *before* hunting for new findings. Treat prior findings as
  hypotheses to revalidate, not as facts — code moves, and a finding can be fixed, dissolved, or
  made worse without anyone updating the old report.
- Discover the current architecture from the repository; do not assume it matches the previous
  result. File paths named in this brief are pointers that must be confirmed to still exist.
- This brief is the stable template. A run never edits this file. If a run reveals that the brief is
  missing a surface, say so in the result under a one-line "Brief gaps" note so the brief can be
  amended deliberately afterwards.

---

# Phase 1 — Threat Model

Before searching for individual vulnerabilities, establish a lightweight threat model.

Identify:

- What is publicly accessible.
- What executes in the browser.
- What executes server-side, if anything.
- What executes at build time (any step that pulls external data into the bundle or into `public/`).
- Content sources (CMS, fixtures, committed seed snapshots).
- External APIs and services.
- Build and deployment systems.
- Environment variables.
- Credentials.
- Administrative surfaces.
- Third-party scripts.
- Analytics.
- Forms.
- User-generated or externally sourced content.
- Dynamic URLs or routing.
- External asset origins.
- Any backend endpoints.
- Any future-facing hooks that could become security-sensitive.

Identify potential attacker classes:

- Anonymous web visitor
- Automated bot
- Malicious site embedding/linking to the application
- Dependency/supply-chain attacker
- Compromised developer account
- Accidental developer mistake
- Malicious third-party service
- Person with repository access
- Person with deployment-platform access
- Person with deployment-platform environment-variable access
- Compromised CMS / malicious CMS author

Define the primary trust boundaries.

Do not assume that the site is low risk simply because it may currently have little or no authentication.

---

# Phase 2 — Repository Secret Audit

Search the complete repository for exposed secrets.

Inspect:

- `.env`
- `.env.*`
- configuration files
- source files
- scripts
- tests
- documentation
- examples
- generated files
- logs
- build artifacts
- public directories
- deployment configuration
- `.env.example` (documented variables must carry no values)
- build logs (deployment platform) — source descriptions, banners and error messages must not print credentials or credential-bearing URLs
- generated build output that is gitignored but deployed (e.g. `src/content/generated/`, `public/logos/`)

Search for:

- API keys
- tokens
- passwords
- private URLs
- database credentials
- cloud credentials
- signing keys
- webhook secrets
- analytics secrets
- service-account credentials
- Vercel tokens
- GitHub tokens
- SSH/private keys
- certificates
- authentication cookies
- credentials accidentally embedded in URLs
- `VITE_`-prefixed variables carrying credentials (Vite compiles `VITE_*` into the public bundle)

Where Git history is available, determine whether secrets may have previously been committed even if they are no longer present in the current working tree.

Classify every discovered credential as:

- Public by design
- Restricted but safe
- Potentially sensitive
- Definitely compromised

Never print full secrets into the report.

Redact them.

If a real secret appears exposed, recommend rotation rather than merely deleting it from the current source tree.

---

# Phase 3 — Client-Side Exposure Audit

Inspect everything included in the browser bundle.

Determine whether the application exposes:

- Internal API endpoints
- Service credentials
- Hidden administrative URLs
- development configuration
- debugging flags
- internal project paths
- source maps
- private comments
- internal documentation
- environment variables
- feature flags
- infrastructure names
- staging endpoints
- third-party identifiers
- unnecessary metadata

Remember:

Anything included in frontend JavaScript can be extracted by an attacker.

Identify any code that incorrectly relies on a client-side value remaining secret.

---

# Phase 4 — Build-Time Content Pipeline

Audit every build step that fetches external data and writes source files or public files.

A build-time pipeline is an execution context of its own: it runs in Node on the deployment
platform, it may hold a credential, and what it writes is compiled into the bundle. It is often the
only place external data enters the product, so treat it with the same rigour as a runtime API.

Today (ADR 010, `docs/adr/010-content-is-generated-at-build-time.md`) this is the WordPress content
build: `scripts/build-content.ts`, `content/lib/{source,html,validate,generate,emit}.ts`,
`content/collections/*`, inputs `content/fixtures/` and `content/seed/`, outputs
`src/content/generated/` and `public/logos/` (both gitignored build output), environment variables
`WP_CONTENT_BASE`, `WP_AUTHORIZATION`, `WP_TIMEOUT_MS`, `CONTENT_SOURCE` (documented in
`.env.example`), field contract `docs/content/wordpress-field-contract.md`. Confirm these still
exist; if the pipeline has moved or grown, audit where it is now.

## Treat CMS content as attacker input

A compromised CMS install is the likely path; a malicious author is the other.

- Trace every CMS field to where it is rendered.
- Confirm each field passes sanitisation (strip tags, then decode entities — the order matters; the
  reverse silently deletes an escaped `&lt;script&gt;`) and bounds validation before it is emitted.
- Confirm no field reaches an HTML sink, `img.src`, a URL, a CSS value, or a WebGL label without
  validation.
- Confirm the hostile-input tests exercise the sanitiser and validator with real payloads, not only
  happy paths.

## Generated source is a sink

Generated modules are compiled into the bundle, so a string-escaping bug turns CMS text into
executable source. Confirm:

- values are serialised with `JSON.stringify` only — no hand-rolled printer, no template literals;
- U+2028 / U+2029 are escaped;
- writes are transactional (staging directory, then swap), so a killed run cannot leave a half-written module;
- generated directories are gitignored build output, never committed as source.

## Credential handling

- The CMS credential must not appear in `dist/`, in generated modules, in `public/`, in build logs,
  in `describe`/banner strings, or in error messages (including URLs that embed `user:pass@`).
- The CMS base URL must be `https:` — verify whether the source adapter enforces the scheme; if a
  plain-`http:` base would send the credential in clear, that is a finding.
- The credential must be read-only and scoped to the environments that need it; never `VITE_`-prefixed.

## Build-side availability and abuse

- Per-request deadline, bounded pagination, torn-snapshot detection, non-zero exit on any failure.
- A CMS outage or a malformed response must fail the build, never produce a green deployment
  carrying wrong or stale content.

## Media mirroring

Where CMS media is copied into `public/` (today `public/logos/`; the mirroring step may or may not
be built yet — state which):

- scheme and parsed-origin allowlist (compare `URL.origin`, never a string prefix);
- SVG rejected; size cap; content-type verified by sniffing, not by extension;
- image-processing dependencies counted in the supply-chain phase.

## Source selection and fail-open

- Confirm the production rule: a production build that names no content source fails; an explicit
  emergency source (`seed`) prints a banner; fixtures cannot ship by omission.
- A committed seed snapshot that silently ships stale content is a fail-open case — assess it under
  Phase 19 as well.

## Committed content

`content/fixtures/` and `content/seed/` are committed inputs. Confirm they hold nothing sensitive and
nothing that presents itself as real client data when it is not.

---

# Phase 5 — Cross-Site Scripting and Injection

Search for every path where external or dynamically constructed data reaches:

- HTML
- DOM
- React rendering
- URLs
- CSS
- scripts
- iframe attributes
- WebGL text/labels where applicable
- redirects
- query parameters
- generated source modules (build-time emitters — see Phase 4)
- build logs / console output

Inspect use of:

- `dangerouslySetInnerHTML`
- `innerHTML`
- `outerHTML`
- `insertAdjacentHTML`
- `document.write`
- dynamic script creation
- dynamic style injection
- unsanitized URL construction
- `eval`
- `new Function`
- string-based timers
- unsafe markdown/HTML renderers

Trace the source of every value reaching those sinks.

Determine whether input is:

- trusted
- escaped
- sanitized
- validated
- unrestricted

Do not report theoretical XSS without identifying a plausible data path.

---

# Phase 6 — URL, Routing, Redirect and Navigation Security

Audit:

- URL parameters
- query strings
- hashes
- dynamic routes
- redirects
- external navigation
- deep links
- `window.location`
- `window.open`
- anchor targets

Look for:

- Open redirects
- `javascript:` URL injection
- unsafe external-link handling
- reverse tabnabbing
- unvalidated destination URLs
- route manipulation

Where `target="_blank"` is used, verify appropriate isolation behaviour.

---

# Phase 7 — Browser Security Headers

Inspect the deployed application's actual headers, not only the intended configuration.

Evaluate:

- Content-Security-Policy
- Strict-Transport-Security
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- frame restrictions / `frame-ancestors`
- cross-origin policies where appropriate
- caching of sensitive resources

For CSP specifically, inspect whether the project genuinely requires:

- `unsafe-inline`
- `unsafe-eval`
- unrestricted third-party domains
- wildcard origins

Do not propose a CSP that breaks Three.js, workers, WASM, analytics, or legitimate application functionality.

Instead derive the minimal realistic policy from actual resource usage.

---

# Phase 8 — Cross-Origin Security

Audit:

- CORS
- external APIs
- asset origins
- worker origins
- WASM loading
- fonts
- textures
- models
- analytics requests
- CDN usage

Determine whether any server/API configuration allows unnecessarily broad origins.

Check whether cross-origin isolation is required or accidentally assumed.

---

# Phase 9 — Third-Party JavaScript

Inventory every third-party script executed in the page.

For each one determine:

- Why it exists.
- Its origin.
- What data it receives.
- What DOM access it gets.
- Whether it can be removed.
- Whether it is pinned/versioned.
- Whether compromise of that service compromises the site.

Identify unnecessary third-party execution as a security risk, not merely a performance cost.

---

# Phase 10 — Dependency and Supply-Chain Audit

Inspect:

- `package.json`
- lockfile
- direct dependencies
- transitive dependencies
- development dependencies
- package scripts
- install hooks
- build hooks

Look for:

- Known vulnerabilities
- Abandoned packages
- Suspicious packages
- Typosquatting risk
- Unnecessarily powerful dependencies
- Packages executing install scripts
- Large dependencies used for trivial functionality
- Dependencies imported from Git repositories or arbitrary URLs
- Unpinned versions
- Lockfile inconsistencies

Use current vulnerability information where tooling/network access permits.

Separate:

- Exploitable vulnerability
- Vulnerable dependency not reachable by this application
- Development-only exposure
- Purely theoretical advisory

Do not rank every CVE as critical.

Assess actual exploitability.

---

# Phase 11 — Package Scripts and Local Execution Risk

Inspect all scripts capable of running commands during:

- install
- build
- development
- deployment
- testing

Audit:

- `preinstall`
- `postinstall`
- `prepare`
- shell scripts
- Node scripts
- custom build tools
- downloaded binaries

Identify scripts that:

- execute external content
- depend on mutable URLs
- modify the repository unexpectedly
- expose credentials
- execute with unnecessary privileges

---

# Phase 12 — Deployment / Vercel Security

Audit the production deployment configuration.

Inspect:

- `vercel.json`
- framework configuration
- redirects
- rewrites
- headers
- serverless functions
- edge functions
- public/static directories
- environment-variable scopes
- preview deployments
- production deployments

Determine whether:

- Preview deployments expose production credentials.
- Production secrets are unnecessarily available during builds.
- Development variables can leak into production.
- Internal endpoints become publicly reachable.
- Files intended to remain private are included in the deployment.
- Debug routes exist.
- Source maps are publicly accessible.
- Caching could expose sensitive responses.

---

# Phase 13 — CI/CD and Deployment Integrity

Where CI/CD configuration exists, audit:

- GitHub Actions or equivalent
- Deployment triggers
- branch protection assumptions
- production deployment permissions
- pull request workflows
- secrets accessible to workflows
- third-party actions
- action version pinning
- artifact handling

Identify possible routes by which malicious or accidental code could reach production.

Pay particular attention to third-party CI actions.

Determine whether actions are pinned strongly enough to reduce supply-chain risk.

---

# Phase 14 — Repository and Organizational Security

Security is not limited to runtime code.

Evaluate the structure surrounding production changes.

Look for:

- Unclear ownership of sensitive configuration
- Multiple duplicated configuration sources
- Production configuration mixed with development configuration
- Secrets handled manually
- undocumented deployment procedures
- undocumented external services
- unclear environment ownership
- fragile manual steps
- scripts that individual developers must remember to run
- missing security checks before production deployment
- critical infrastructure knowledge existing only implicitly
- unrestricted or poorly separated preview/production environments

Determine whether the project structure itself makes security mistakes likely.

Prefer eliminating dangerous states rather than documenting that developers must avoid them.

---

# Phase 15 — Public Files and Information Disclosure

Inspect everything publicly deployed.

Look for accidental exposure of:

- source maps
- manifests
- internal docs
- debug output
- test data
- architectural diagrams
- development assets
- backups
- temporary files
- `.map`
- `.log`
- `.json`
- hidden configuration
- unused builds

Determine whether filenames, comments, or metadata reveal information useful to attackers.

Do not treat ordinary framework fingerprints as vulnerabilities unless they materially increase risk.

---

# Phase 16 — Debug and Development Functionality

Search for:

- debug routes
- debug panels
- developer shortcuts
- performance controls
- hidden keyboard commands
- verbose logging
- feature toggles
- test endpoints
- mock data
- debug query parameters

Determine whether any can:

- alter application state
- expose internal data
- trigger expensive operations
- reveal implementation details
- bypass normal behaviour

Ensure development tools cannot accidentally ship enabled in production.

---

# Phase 17 — Denial-of-Service and Resource Abuse

Inspect whether an attacker can intentionally trigger:

- repeated asset loading
- large memory allocation
- excessive WebGL work
- uncontrolled network requests
- expensive search or calculation
- repeated initialization
- worker creation
- animation duplication
- large URL-driven state

For a client-heavy Three.js website, also consider browser-level denial of service.

Determine whether malicious interaction or crafted URLs can cause:

- tab crashes
- GPU exhaustion
- memory exhaustion
- infinite loops
- runaway rendering

---

# Phase 18 — Data and Privacy Surface

Identify what information the application sends externally.

Audit:

- Analytics
- telemetry
- error reporting
- third-party embeds
- browser metadata
- IP-related services
- cookies
- local storage
- session storage

Document what data leaves the browser and which external service receives it.

Flag unnecessary collection or unexpected data transmission.

This is not a full legal/privacy compliance audit, but technical data flows must be understood.

---

# Phase 19 — Security Failure Handling

Inspect what happens when:

- an external service fails
- a resource is corrupted
- a worker fails
- a model fails validation
- network responses are malformed
- an expected environment variable is absent
- a third-party API behaves unexpectedly

Look for security-sensitive fail-open behaviour.

Prefer explicit failure over silently falling back to unsafe behaviour.

---

# Required Output

Write the result to `docs/audits/reports/cybersecurity-project-security-<YYYY-MM-DD>.md`.

`docs/audits/` holds briefs — the audits that can be run. `docs/audits/reports/` holds the audits
that *were* run. Never write a report beside the briefs.

Before the report enters Git history it must satisfy the sanitization contract in
`docs/audits/README.md`: no credentials, secret values, personal data, authentication material,
raw production dumps, or exploit detail beyond the minimum reproduction. `npm run check:audit`
enforces the mechanical half and fails the build. The judgment calls are yours.

This brief carries the highest risk of violating that contract, because finding secrets is part of
its job. A finding may state that a secret exists, where it lives and what it grants. It must never
quote the value — not truncated, not "the first eight characters". Reproduce a vulnerability with
the smallest input that demonstrates it, never a working end-to-end exploit.

The result must open with a header block:

```
Audited: <YYYY-MM-DD> · against commit <sha> (+ uncommitted changes, if any)
Scope: <what was in scope, and what was deliberately out>
Baseline: <the prior result file(s) this run is a delta against>
```

plus a one-line note stating which earlier result this one supersedes, and that the earlier one
remains accurate for everything not restated here.

Then produce:

## 0. Status of Prior Findings

One row per finding that was open in the baseline:

| ID | Prior severity | Status now (`FIXED` / `OPEN` / `DISSOLVED` / `WORSE`) | Evidence |

`FIXED` means verified fixed in this pass, not "a commit claims to fix it". `DISSOLVED` means the
surface no longer exists. New findings go in §3 with new IDs; do not renumber old ones.

---

## 1. Executive Security Assessment

Classify the project as:

- Strong security posture
- Generally safe with identifiable weaknesses
- Significant security risks
- Not safe for production deployment

Explain the evidence.

---

## 2. Threat Model

Document:

- Assets
- Attackers
- Trust boundaries
- Public surfaces
- Sensitive systems
- External dependencies

Keep it concise but project-specific.

---

## 3. Security Findings

Rank each finding:

### P0 — Critical
Direct realistic compromise, exposed production secret, arbitrary execution, or equivalent.

### P1 — High
Serious exploitable vulnerability or major security-control failure.

### P2 — Medium
Meaningful weakness requiring remediation.

### P3 — Low
Defense-in-depth or project-hardening improvement.

Each finding must contain:

- Evidence
- Relevant file(s)
- Attack surface
- Exploitation path
- Required attacker capability
- Potential impact
- Likelihood
- Recommended remediation
- Remediation complexity
- Verification method

Clearly distinguish:

- Confirmed vulnerability
- Likely vulnerability
- Security weakness
- Hardening opportunity

Do not inflate severity.

---

## 4. Secret Exposure Report

List any potential credential exposure separately.

Never reproduce complete credentials.

For each secret indicate whether:

- removal is sufficient
- rotation is required
- Git history remediation is required

---

## 5. Supply-Chain Assessment

Summarize:

- dependency risk
- package-script risk
- CI/CD risk
- third-party runtime risk

---

## 6. Deployment Security Assessment

Assess:

- Vercel
- environment separation
- production secrets
- preview deployments
- headers
- public assets
- deployment permissions

---

## 7. Organizational / Structural Security Risks

Identify project structures or workflows that make future security mistakes more likely.

Examples include:

- unclear ownership
- duplicated configuration
- implicit production procedures
- inadequate environment separation
- dangerous manual processes
- security-sensitive knowledge spread across unrelated modules

---

## 8. Remediation Plan

Order changes by:

1. Active vulnerabilities
2. Credential exposure
3. Deployment compromise paths
4. Supply-chain risks
5. Browser/application attack surface
6. Organizational weaknesses
7. Defense-in-depth

Separate:

- Immediate fixes
- Short-term engineering work
- Architectural improvements
- Operational improvements

---

## 9. Verification Results and Not Verified

Everything executed, and everything that could not be. Nothing is inferred in the first table;
nothing in the second is presented as checked.

**Verified:** commands run, URLs fetched, browsers driven, headers observed, with the result of each.

**Not verified:** what could not be checked in this run and why — e.g. no deployment URL was
reachable so live headers were not observed (`vite preview` does not apply `vercel.json`); only
Chromium was available; the CMS was not reachable so the build-time pull was exercised against
fixtures only; Git history was unavailable. Each item names what would be needed to verify it.

Close with a one-line **Brief gaps** note: any surface this run found that this brief does not
cover, or `none`.

---

# Constraints

- Audit first; remediate second.
- Do not modify production behaviour while gathering evidence.
- Never expose secrets in reports.
- Do not label hypothetical issues as confirmed vulnerabilities.
- Do not use CVSS severity without considering actual exploitability.
- Do not assume frontend values can remain secret.
- Do not introduce security libraries unless they solve a demonstrated problem.
- Prefer eliminating dangerous states over documenting warnings.
- Avoid security theatre.
- Avoid unrelated refactors.
- Preserve functionality unless insecure functionality itself must change.