/**
 * Do a phone's two spellings describe the same number?
 *
 * Every phone is typed twice — once to be read ("+34 968 12 34 56"), once to be
 * dialled ("+34968123456") — and the likely mistake is not a typo in either but
 * updating one and forgetting the other. The site would then show one number
 * and ring another, and nothing downstream could tell.
 *
 * "Same number" means the dial digits END WITH the display digits, rather than
 * being equal: a display written without the country code ("968 12 34 56") is a
 * perfectly normal way to print a Spanish number and must stay quiet.
 *
 * A WARNING, not an error. Formats vary more than a rule can know (an extension,
 * a number shown as words), and blocking Publicar on a guess would be the Studio
 * overruling an editor who is right.
 */
export function phoneSpellingsAgree(value: unknown): true | string {
  const phone = value as { display?: unknown; tel?: unknown } | undefined
  if (typeof phone?.display !== 'string' || typeof phone.tel !== 'string') return true

  const shown = phone.display.replace(/\D/g, '')
  const dialled = phone.tel.replace(/\D/g, '')
  // Either side still empty is the required-field rules' job, not this one's.
  if (shown === '' || dialled === '') return true

  return dialled.endsWith(shown)
    ? true
    : 'El número para llamar no coincide con el que se ve: revisa que los dos sean el mismo.'
}
