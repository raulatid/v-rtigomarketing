# Textos legales

**Estado:** vigente · **Desde:** 2026-08-20; tres documentos desde el 2026-09-05 (`3bec60b`); fuera del JS inicial desde el 2026-09-19 (`3e67b09`) · **Sustituye a:** DECISIONS §30 en «Legal pages are panels» y su revisión del 2026-09-05

## Decisión

1. **Los textos legales son paneles, no páginas:** la aplicación no tiene router. `LegalPanel` se abre sobre la escena o sobre el blog.
2. **Hay tres documentos y su lista es código:** `LegalDocId` en `src/content/site.ts` (`terminos`, `aviso`, `cookies`). Añadir uno es un cambio de código más un singleton fijo en el Studio, importado en el dataset antes de que el código lo exija. El build falla si falta alguno (`content/collections/legalDocs.collection.ts`).
3. **El texto es contenido de Sanity.** Cómo se ingiere y en qué formato lo decide el área de contenido.
4. **El texto viaja con el chunk perezoso del panel, no con el JS inicial:** `src/content/legal.ts` solo lo importa `LegalPanel` (cargado por `LazyLegalPanel`), y `check:architecture` impide que la entrada de la app alcance `src/content/generated/legalDocs`.
5. **El documento `cookies` lleva dentro el panel de preferencias** (`CookiePreferences`) y la política plegada (ver [consentimiento](consentimiento.md)).
6. **Los formularios de contacto y auditoría usan consentimiento implícito:** una nota «Al enviar aceptas los términos y privacidad» con enlace a `terminos` (`ContactSection.tsx`, `AuditSection.tsx`).
7. **El contenido de los textos es del cliente y de su revisión legal**, no del código.

## Por qué

Un panel mantiene al visitante en la escena. Los textos reescritos en el CMS el 2026-09-18 crecieron mucho y tumbaron el despliegue por `INITIAL_JS_BUDGET_BYTES` (`vite.config.ts`), un presupuesto pensado para código que se estaba gastando en prosa que nadie ve hasta abrir el panel.

## Qué se descartó

- Páginas legales con su propia URL.
- Llevar los textos en `site.ts`, junto al resto del contenido del JS inicial.

## Pendiente de decidir

**Casilla de consentimiento en contacto y auditoría.** Hoy no hay casilla, solo la nota del punto 6. Un comentario de `AuditSection.tsx` dice que la casilla espera al texto legal real y que el hallazgo SEC-12 de la auditoría del 2026-09-02 sigue abierto hasta entonces. El texto se reescribió el 2026-09-18. El usuario lo revisará; mientras tanto, no se añade la casilla ni se da por cerrado el consentimiento implícito.

## Se ha roto si…

- `check:architecture` falla en «the app entry cannot statically reach the generated legal texts».
- El build no falla cuando falta un documento de `LegalDocId`.
- La política de cookies deja de explicar cómo retirar el consentimiento.

## Afecta a

`src/components/LegalPanel.tsx`, `src/components/LazyLegalPanel.tsx`, `src/components/LegalBlock.tsx`, `src/content/legal.ts`, `src/content/site.ts`, `content/collections/legalDocs.collection.ts`, `sanity-studio/schemas/legalDoc.ts`, `src/components/ContactSection.tsx`, `src/components/AuditSection.tsx`, `checks/architecture.ts`
