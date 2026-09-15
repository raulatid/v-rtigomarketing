# Cookie preferences

The cookie icon reopens preferences on both the main site and the blog. The
policy is collapsed until the visitor expands it. Category switches are drafts:
only Save preferences, Accept all or Reject all persists a decision.

## Categories and persistence

- Necessary: consent choice and music explicitly enabled or disabled by the user.
- Experience preferences: remembers the introduction with `vertigo:intro`.
  Withdrawing this category removes that entry immediately.
- Analytics: records permission independently. Google Analytics is not installed
  and this switch does not currently load a tracking service.

Consent version 2 requires both optional category flags. Earlier records prompt
again instead of implying consent for the new category. Optional categories
default to disabled. Decisions synchronize across browser tabs through storage
events. Closing without saving discards the draft.

Before installing analytics, implement consent-gated loading and withdrawal,
update the actual storage inventory and policy, and review the consent version.

## Editing in Sanity

Development Studio: https://cliente-dev.sanity.studio/

- Site settings → Cookies y preferencias: all 19 interface strings, including
  category descriptions, buttons, feedback and the disclosure label.
- Textos legales → Política de cookies: the full policy body.

The shared field definitions live in `src/content/cookieCopy.ts`. The content
build validates required text and length limits, then emits the copy used by
the app. Older documents without the object receive the build-time defaults.
Changing copy does not change category behavior or install analytics. Site
content changes reach the published website through its normal build/deploy.

The development documents and Studio schema were updated on 2026-09-15.
The website itself was not deployed as part of this change.
