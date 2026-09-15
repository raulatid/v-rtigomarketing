import type { ConditionalPropertyCallbackContext } from 'sanity'

/**
 * The rule for every identifier the website's code depends on.
 *
 * Four identifiers are welded to code: a case study's is referenced by
 * `orbitAssignments.ts`, a district's and each service's by
 * `cityDistrictBindings.ts` (a service's also by the blog's `?tema=` links), a
 * legal document's by the panels that link it. An editor changing one breaks a
 * build they cannot see. A blog post's slug is locked by the same function for
 * a different reason — it is the post's public URL — and says so in its own
 * description rather than this one. So an identifier is editable exactly once — until it has a value —
 * and read-only afterwards for everyone except an administrator, who is also
 * the only person able to update the code on the other side of the binding.
 *
 * A NEW case study therefore still works for an editor: they type the brand
 * name and EditorialDocument generates a stable identifier automatically.
 * Districts and legal documents never reach the unset state because they cannot
 * be created from the Studio at all (see `sanity.config.ts`).
 */
export function lockedOnceSet(context: ConditionalPropertyCallbackContext): boolean {
  const value = context.value as { current?: unknown } | undefined
  const hasValue = typeof value?.current === 'string' && value.current.length > 0
  const isAdmin = context.currentUser?.roles.some((role) => role.name === 'administrator') ?? false
  return hasValue && !isAdmin
}

/**
 * The description every locked identifier shows. One sentence about what it is,
 * one about who to ask — and nothing about files, builds or bindings.
 */
export const LOCKED_ID_DESCRIPTION =
  'Nombre interno que usa la web para reconocer este elemento. Una vez guardado no ' +
  'cambia; si hiciera falta cambiarlo, pídeselo al equipo técnico.'

/**
 * Recovery/admin controls for internal identifiers. Ordinary case/service
 * creation uses EditorialDocument; existing identifiers remain immutable.
 */
export const TECH_FIELDSET = {
  name: 'tecnico',
  title: 'Identificador interno',
  description:
    'Se genera automáticamente al escribir el nombre de un caso o servicio. No hace falta modificarlo.',
  options: { collapsible: true, collapsed: true },
}
