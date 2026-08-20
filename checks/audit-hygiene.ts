/**
 * The sanitization contract in `docs/audits/README.md`, asserted against the
 * reports that are about to enter Git history.
 *
 * The reason this runs instead of being a checklist is the reason every harness
 * in this directory runs: `checks/architecture.ts` was written because a rule
 * "lived in a document and the code drifted past it". A sanitization checklist
 * has the same failure mode with a worse consequence — an architecture
 * violation is fixed by a commit, a leaked credential is not. Deleting the file
 * afterwards leaves the value in history, and the only real remedy is rotating
 * the secret and rewriting history.
 *
 * It enforces the mechanical half of the contract: rules 1-4 and, partially, 7.
 * Rules 5 and 6 — "unnecessary personal or production data" and "the minimum
 * reproduction necessary" — are judgment calls, they are stated in the README,
 * and they are deliberately NOT faked here. A harness that pretended to check
 * them would make a reader trust a green run more than it deserves.
 *
 * Bias: a false positive costs one allowlist entry or one rewording. A false
 * negative costs a rotated credential and a rewritten history. Patterns are
 * tuned tight enough to stay quiet on prose, and when they do fire they name
 * the file and line rather than reporting that something, somewhere, matched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { banner, check, finish, section } from './lib/assert';

const REPORTS = 'docs/audits/reports';
const README = 'docs/audits/README.md';

interface Line {
  file: string;
  /** 1-indexed, so the output is clickable. */
  no: number;
  text: string;
}

function readReports(): { files: string[]; lines: Line[] } {
  if (!fs.existsSync(REPORTS)) return { files: [], lines: [] };
  const files = fs
    .readdirSync(REPORTS)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.posix.join(REPORTS, f));

  const lines: Line[] = [];
  for (const file of files) {
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach((text, i) => lines.push({ file, no: i + 1, text }));
  }
  return { files, lines };
}

const { files, lines } = readReports();

/**
 * A redaction marker on the line is the author saying "I know, and I removed
 * the value" — `Authorization: Bearer <redacted>` is the shape the README asks
 * for and must not fail the check that asks for it.
 */
const REDACTED = /<redacted[^>]*>|\bREDACTED\b|\[redacted\]|\bxxxxx+\b|\*{4,}/i;

/**
 * Asserts that no line in any report matches `pattern`.
 *
 * Reports the first three offenders with file:line, on the same reasoning as
 * the architecture harness — a list of forty is not more actionable than three.
 */
function forbid(label: string, pattern: RegExp, why: string): void {
  const hits = lines.filter((l) => pattern.test(l.text) && !REDACTED.test(l.text));
  const shown = hits
    .slice(0, 3)
    .map((l) => `${l.file}:${l.no}`)
    .join(', ');
  const detail = hits.length === 0 ? why : `${hits.length} hit(s): ${shown}`;
  check(label, hits.length === 0, detail);
}

banner('AUDIT HYGIENE — sanitization contract (docs/audits/README.md)');

console.log(`\n${files.length} report(s) under ${REPORTS}/, ${lines.length} lines scanned`);

section('1. Credentials, tokens and keys (contract rules 1-2)');

forbid(
  'no private key blocks',
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/,
  'no PEM material',
);
forbid(
  'no AWS access key ids',
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  '',
);
forbid(
  'no GitHub tokens',
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  '',
);
forbid(
  'no Slack / Stripe / Google API keys',
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\b[sr]k_(?:live|test)_[A-Za-z0-9]{20,}\b|\bAIza[0-9A-Za-z_-]{35}\b/,
  '',
);
forbid(
  'no JSON Web Tokens',
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  '',
);
forbid(
  'no assigned secret values',
  // `SECRET = "…"` with a real value. Requires an assignment and quotes, so
  // prose naming a variable ("the WORDPRESS_API_TOKEN is read at build time")
  // stays quiet — naming a secret is not leaking one.
  /\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|APIKEY|API_KEY|PRIVATE_KEY|CLIENT_SECRET)[A-Z0-9_]*\s*[:=]\s*["'][^"'\s]{8,}["']/i,
  'naming a secret is fine; assigning one is not',
);

section('2. Environment dumps (contract rule 3)');

forbid(
  'no .env file dumps',
  // Three or more SCREAMING_SNAKE assignments is a pasted environment, not
  // prose. One is a documented variable name.
  /^\s*(?:export\s+)?[A-Z][A-Z0-9_]{3,}=\S+(?:\s|$)/,
  'documented names are fine; pasted environments are not',
);
forbid(
  'no printenv / env output blocks',
  /^\s*\$?\s*(?:printenv|env)\s*$/,
  '',
);

section('3. Authentication material (contract rule 4)');

forbid(
  'no Authorization headers with a value',
  /\bAuthorization\s*:\s*(?:Bearer|Basic|Token)\s+\S{8,}/i,
  '',
);
forbid(
  'no Set-Cookie / Cookie headers with a value',
  /\b(?:Set-)?Cookie\s*:\s*\S+=\S{8,}/i,
  '',
);
forbid(
  'no session or auth cookie values',
  /\b(?:session(?:id)?|sid|auth_token|access_token|refresh_token)\s*=\s*[A-Za-z0-9_-]{16,}/i,
  '',
);

section('4. Referenced files are not sensitive artifacts (contract rule 7)');

/**
 * Rule 7 is about REPRODUCING an artifact, not naming one.
 *
 * The first cut of this check flagged any backticked mention of a git-ignored
 * path and produced ten hits, all of them false: "no `.env` file exists",
 * "`.gitignore` covered `.env`", "`.env.example`". Naming these is exactly what
 * a deployment audit is for, and a check that fires on correct writing trains
 * people to ignore it.
 *
 * What is actually dangerous is a report pasting the CONTENTS of a file that is
 * not in the repository — the reader cannot diff it, and it may carry secrets or
 * unpublished CMS copy. That has a narrow shape: a fenced code block introduced
 * by a line naming one of these paths.
 *
 * The list is explicit rather than derived from `.gitignore`, because most of
 * that file is build output and editor noise that is harmless to quote. These
 * are the paths whose contents are sensitive.
 */
const SENSITIVE_ARTIFACTS = [
  '.env', // secrets, by definition
  'src/content/generated', // CMS copy, possibly unpublished
  'public/logos', // mirrored CMS media
];

const reproduced: Line[] = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  text.forEach((line, i) => {
    if (!/^\s*```/.test(line)) return;
    // The two lines above a fence are where its subject is named.
    const preamble = [text[i - 1] ?? '', text[i - 2] ?? '', line].join(' ');
    if (REDACTED.test(preamble)) return;
    const names = SENSITIVE_ARTIFACTS.some((p) => preamble.includes(p));
    // "does not exist", "is ignored", "no .env" — descriptions, not dumps.
    const denies = /\b(?:no|none|not|never|absent|missing|ignored?|excluded?)\b/i.test(preamble);
    if (names && !denies) reproduced.push({ file, no: i + 1, text: line });
  });
}

check(
  'no report reproduces the contents of a sensitive artifact',
  reproduced.length === 0,
  reproduced.length === 0
    ? `${SENSITIVE_ARTIFACTS.length} artifact path(s) considered, ${files.length} report(s)`
    : `${reproduced.length}: ${reproduced.slice(0, 3).map((l) => `${l.file}:${l.no}`).join(', ')}`,
);

section('5. The contract the reports are checked against exists');

check(
  'the sanitization contract is present',
  fs.existsSync(README),
  README,
);
check(
  'reports live in their own directory',
  fs.existsSync(REPORTS),
  `${files.length} report(s)`,
);
check(
  'every report is dated in its filename',
  files.every((f) => /-\d{4}-\d{2}-\d{2}\.md$/.test(f)),
  files
    .filter((f) => !/-\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map((f) => path.posix.basename(f))
    .join(', ') || 'slug-YYYY-MM-DD.md',
);
check(
  'no report was written beside the briefs',
  fs
    .readdirSync('docs/audits')
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .every((f) => !/-\d{4}-\d{2}-\d{2}\.md$/.test(f)),
  'dated files belong in reports/',
);

finish();
