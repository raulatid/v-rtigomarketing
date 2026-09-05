/**
 * The one thing a marketing site cannot undo: a credential compiled into a
 * public bundle.
 *
 * Every other rule in this repository about secrets — the `SANITY_STUDIO_`
 * prefix split, "never VITE_-prefix a credential", the sanitization contract in
 * `checks/audit-hygiene.ts` — is a rule someone has to remember. This is the
 * one place the property is CHECKED, on the bytes that are about to be written
 * to `dist/`, where a false negative costs a rotated key and a false positive
 * costs one line here.
 *
 * Two independent failures, because they fail at different moments:
 *
 * 1. A VITE_-prefixed variable with a credential's name. Vite compiles every
 *    `VITE_*` into `import.meta.env`, so this leaks the moment someone adds the
 *    variable — before any code reads it, and whether or not the value happens
 *    to be present in this particular build. Caught by NAME, at the source.
 *
 * 2. A secret's VALUE appearing anywhere in the emitted output. This is the
 *    backstop for every route the first rule cannot see: a `define`, a
 *    generated module, an interpolated error string, a stray console line that
 *    serialized the whole environment. Caught by VALUE, on the artifact.
 *
 * Rule 2 can only fire when the secret is actually set in the build
 * environment, which on Vercel it is and on a laptop it usually is not. That is
 * a real limit and not a reason to skip it: the build that matters is the one
 * holding the credentials.
 */

/** Substrings that make a variable name a credential rather than a setting. */
const SECRET_NAME_PARTS = ['TOKEN', 'SECRET', 'PASSWORD', 'PASSWD', 'CREDENTIAL', 'PRIVATE_KEY', 'API_KEY']

/**
 * Names whose value must never appear in emitted output, whether or not they
 * match the pattern above. Kept explicit so this file names the repository's
 * actual credentials rather than only a shape.
 */
const KNOWN_SECRETS = ['SANITY_TOKEN', 'RESEND_API_KEY']

/**
 * A value short enough to collide with ordinary minified output is not usable
 * as a needle. Real keys are far longer than this — Resend's are ~35 chars, a
 * Sanity token ~80 — so the floor only excludes placeholders and junk.
 */
const MIN_SCANNABLE_VALUE = 12

export function isSecretName(name: string): boolean {
  const upper = name.toUpperCase()
  if (KNOWN_SECRETS.includes(upper)) return true
  return SECRET_NAME_PARTS.some((part) => upper.includes(part))
}

/**
 * `VITE_*` variables whose name says credential. Their presence alone is the
 * defect — Vite will compile the value into the client bundle.
 */
export function publicPrefixedSecrets(env: Record<string, string | undefined>): string[] {
  return Object.keys(env)
    .filter((name) => name.startsWith('VITE_'))
    .filter((name) => isSecretName(name.slice('VITE_'.length)))
    .sort()
}

/** The secret values present in this build environment, longest first. */
export function scannableSecrets(env: Record<string, string | undefined>): Array<{ name: string; value: string }> {
  return Object.entries(env)
    .filter(([name]) => isSecretName(name))
    .map(([name, value]) => ({ name, value: (value ?? '').trim() }))
    .filter(({ value }) => value.length >= MIN_SCANNABLE_VALUE)
    .sort((a, b) => b.value.length - a.value.length)
}

export interface Leak {
  /** The variable whose value was found. The value itself is never carried. */
  name: string
  /** The emitted file it was found in. */
  file: string
}

/**
 * Scan emitted files for the secrets' values.
 *
 * The value is deliberately absent from the result and from every message this
 * produces: a build log is not a place to reprint a credential, and the name
 * plus the file is everything the fix needs.
 */
export function findSecretLeaks(
  files: ReadonlyArray<{ name: string; text: string }>,
  secrets: ReadonlyArray<{ name: string; value: string }>,
): Leak[] {
  const leaks: Leak[] = []
  for (const file of files) {
    for (const secret of secrets) {
      if (file.text.includes(secret.value)) leaks.push({ name: secret.name, file: file.name })
    }
  }
  return leaks
}
