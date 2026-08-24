import type { ConditionalPropertyCallbackContext } from 'sanity'

/**
 * The rule for every identifier the website's code depends on.
 *
 * Three identifiers are welded to code: a case study's is referenced by
 * `orbitAssignments.ts`, a district's by `cityDistrictBindings.ts`, a legal
 * document's by the site footer. An editor changing one breaks a build they
 * cannot see. So an identifier is editable exactly once — until it has a value —
 * and read-only afterwards for everyone except an administrator, who is also
 * the only person able to update the code on the other side of the binding.
 *
 * A NEW case study therefore still works for an editor: they type the brand
 * name, press "Generar", and the identifier is set and locked in one motion.
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

/** The collapsed fieldset every document keeps its identifier in. */
export const TECH_FIELDSET = {
  name: 'tecnico',
  title: 'Técnico',
  description: 'No hace falta tocar nada aquí en el día a día.',
  options: { collapsible: true, collapsed: true },
}
