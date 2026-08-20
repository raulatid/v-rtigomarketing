# Audits

This directory holds two different kinds of file, and the distinction is load-bearing.

**`docs/audits/*.md` — briefs.** The audits that *can be run*. Reusable methodology: what to look
for, in what order, and what to produce. They contain no findings, so they carry no risk.

**`docs/audits/reports/*.md` — reports.** The audits that *were run*. Dated, pinned to a commit,
and superseded by later passes rather than overwritten. These contain findings, which is what makes
the rest of this document necessary.

A report is named `<slug>-YYYY-MM-DD.md`, slug first, so every pass in a lineage sorts together —
the three `production-readiness-vercel-*` passes read as a series. Never overwrite or delete an
earlier report; it is the record of what was true at its commit. Where two disagree, the newer
one wins, and it should say so in its own header.

---

# Sanitization contract

Audit documents committed to this repository must never contain credentials, secret values,
personal data, authentication material, raw production dumps, or unnecessary exploit-ready
information.

This is not a style preference. A leaked secret in a report is **unrecoverable**: deleting the file
later does not remove it from Git history, and the only real remedy is rotating the secret and
rewriting history. The gate has to hold the first time.

## Before any report enters Git history

1. **Scan** the generated report for credentials, tokens, keys and secrets.
2. **Redact** all secret values.
3. **Remove** raw environment dumps.
4. **Remove** authentication headers and cookies.
5. **Remove** unnecessary personal or production data.
6. **Replace** exploit payloads with the minimum reproduction necessary.
7. **Verify** that referenced files do not expose sensitive generated artifacts.
8. **Only then** allow the report to enter Git history.

## What is enforced, and what is not

`npm run check:audit` (`checks/audit-hygiene.ts`, part of `npm run check`) enforces the mechanical
half of this list against every file in `reports/`. It fails the build, because a warning in a long
check log is a warning nobody reads.

| Rule | Enforced by the harness |
|------|-------------------------|
| 1. Credentials, tokens, keys | Yes — high-confidence patterns |
| 2. Secret values redacted | Yes |
| 3. Raw environment dumps | Yes — `KEY=value` runs and `.env` blocks |
| 4. Auth headers and cookies | Yes — `Authorization:`, `Bearer`, `Set-Cookie:` |
| 5. Personal / production data | **No — human judgment** |
| 6. Minimum reproduction | **No — human judgment** |
| 7. Referenced generated artifacts | Partly — cited paths are checked against `.gitignore` |

Rules 5 and 6 cannot be pattern-matched and are the ones most likely to be skipped. Rule 6 in
particular: a report should describe a vulnerability precisely enough that a developer can fix and
verify it, and no more. A working end-to-end exploit adds nothing a fix needs, and it is the part
that hurts most if this repository's visibility ever changes.

The harness passing does not mean a report is sanitized. It means the report is free of the
mistakes a machine can recognise.

## How to redact

Keep the shape, drop the value — a redacted report should still be diffable against the next pass.

```
Authorization: Bearer <redacted>
VERTIGO_API_KEY=<redacted, 32 chars>
https://example.wordpress.com/wp-json/... (host redacted)
```

Never commit a "temporarily" unredacted value intending to clean it up before pushing. The commit
is the event this contract exists to gate.

---

# Visibility

This repository is private, and the reports in `reports/` assume it stays that way. Several
document live findings — an input-validation bypass, an unhandled WebGL context loss — that are a
roadmap for anyone who should not have them.

**Decide before the first public push, not after.** Git history is permanent: if these commits ever
become public, removing the files at that point removes nothing. If this repository is ever opened
up, handed to a client, or mirrored, `docs/audits/reports/` is the one directory that has to be
extracted first — which is why reports live in their own directory rather than beside the briefs.

The briefs themselves are methodology and carry no findings. They can stay.
