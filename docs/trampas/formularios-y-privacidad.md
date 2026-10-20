# Trampas: formularios, consentimiento, analítica y legal

Errores reales y comportamientos que parecen bugs pero son intencionados. Las decisiones están en [`decisiones/formularios/`](../decisiones/formularios/) y [`decisiones/privacidad/`](../decisiones/privacidad/).

## Backend de los formularios

1. **Los `api/*.ts` deben importar con extensión `.js`.** Vercel transpila sin empaquetar, y el resolvedor ESM de Node exige la extensión. Vite, Vitest y esbuild lo perdonan; por eso los dos formularios dieron `FUNCTION_INVOCATION_FAILED` en producción del 2026-09-04 al 2026-09-21 sin que fallara nada. Fija: `npm run check:functions`.
2. **E2E llega al handler real por `vite preview` (`apiRouting`), nunca por `api/*.ts`.** Que las e2e pasen no prueba que la función arranque en Vercel (ver la trampa 1).
3. **No pongas tests ni utilidades dentro de `api/`.** Vercel publica como ruta cualquier archivo de esa carpeta. El camino HTTP se prueba en `server/endpoint.test.ts`.
4. **En producción, un formulario sin `RESEND_API_KEY` responde error, a propósito.** No se arregla con un dry run: `MAIL_DRY_RUN` está prohibido en producción. Fija: `server/config.test.ts`.
5. **Con el remitente sandbox de Resend hace falta `MAIL_TO_OVERRIDE`.** Sin él, `server/config.ts` rechaza la configuración: el sandbox solo entrega al dueño de la cuenta.
6. **Un honeypot relleno responde éxito y no envía nada.** Es el único «éxito» falso del código, y es intencionado: un rechazo le diría al script qué campo dejar vacío. Fija: `e2e/forms.spec.ts` («a filled honeypot is accepted and silently discarded»).
7. **El limitador es por instancia y orientativo.** Cada instancia de función tiene sus contadores, y la IP sale de `x-forwarded-for`, que no es una identidad.
8. **Cambiar `contactEmail`, los tramos o los mensajes en Sanity no hace nada hasta redesplegar.** `server/recipient.ts` y `server/validate.ts` leen el contenido generado en el build.
9. **`CAPS.revenue` y `CAPS.budget` son copias de `EDITORIAL_BOUNDS` y nadie comprueba que coincidan.** Solo lo dice un comentario en `server/validate.ts`. Si cambias el límite en `editorialBounds.ts`, cámbialo también en el servidor. Sin test.

## Consentimiento

10. **`CONSENT_VERSION` está copiado en varios sitios:** `src/intro-draw/returningVisitor.ts` (no puede importar `app/consent`; fija: `returningVisitor.test.ts`), los literales de `e2e/boot.spec.ts` y `e2e/consent.spec.ts`, y la semilla de `playwright.config.ts` (sin test). Al subir la versión, actualiza todas las copias.
11. **La semilla de consentimiento de `playwright.config.ts` lleva hoy una versión anterior a `CONSENT_VERSION`.** El registro sembrado se lee como «sin preguntar», así que el banner aparece en todas las specs, justo lo que la semilla existía para evitar (que el banner quede bajo un clic por coordenadas, en una captura de referencia o sobre el edificio del blog). Verificado por lectura, no ejecutado. Es una corrección de código pendiente; ver también [trampas de la intro](intro.md), «Posibles defectos sin verificar».
12. **La clave `vertigo:intro` está escrita a mano en `consent.ts`** (`clearWithdrawnPreferences`), no importada de `INTRO_STORAGE_KEY` en `introSeen.ts`. Si se renombra en un sitio, la retirada deja de borrarla.
13. **El banner fija las dos categorías a la vez** (`choose` en `ConsentBanner.tsx`). Solo el panel de preferencias las separa. No es un bug.
14. **La página 404 arranca la analítica pero no monta el banner.** Allí solo carga para quien ya consintió, y desde allí no se puede cambiar la elección.

## Textos visibles

15. **Los textos por defecto dicen que Google Analytics no está instalado, y sí se carga.** `bannerBody` y `analyticsBody` en `COOKIE_COPY_FIELDS` (`src/content/cookieCopy.ts`), `content/fixtures/siteSettings.json` y `content/seed/siteSettings.json` lo afirman, y no nombran Vercel Web Analytics ni Speed Insights. El `terminos` de `content/fixtures/legalDoc.json` y `content/seed/legalDoc.json` dice además que los datos no se envían a ningún servidor. **Está pendiente verificar qué dice el dataset de producción**, que es lo que ve el visitante. Los textos son del cliente; cambiar los valores por defecto es una tarea de código aparte. Sin test.

## Analítica

16. **Un script cargado no se descarga.** La retirada no quita los scripts: Vercel descarta los eventos en `beforeSend` y GA4 se detiene con `ga-disable-<id>`. Ver `gtag.js` en el DOM tras retirar el consentimiento es lo esperado.
17. **Nada de esto carga fuera de producción.** En un preview no basta con aceptar el banner: los flags de `buildFlags.ts` lo impiden.

## Cabeceras

18. **`vercel.json` no admite comentarios, y una clave desconocida tumba el despliegue en silencio:** la URL sigue sirviendo el build anterior, y `JSON.parse` no lo detecta. El porqué de cada cabecera va en `scripts/vercelConfig.test.ts`.
19. **`'unsafe-eval'` en `script-src` no es un descuido:** sin él, el transcodificador KTX2 falla y el arranque termina en fatal tras el plazo. Se puede quitar el día que el transcodificador se compile con `-sDYNAMIC_EXECUTION=0`.
20. **El test «sets no CORS header» solo mira la regla global.** `/content-version.json` sí lleva `Access-Control-Allow-Origin`, para el Studio.

## Código pendiente de retirar

21. **El juego del mirador (`api/view.ts`, `api/claim.ts`, `server/view/`, `ClaimDialog.tsx`) y la puerta de lanzamiento (`middleware.ts`, `server/launchGate.ts`) se retiran** (decidido el 2026-10-20, en su propia tarea de código). Siguen desplegados: el mirador está cerrado por `VIEW_OPEN` en `server/view/config.ts`, y la puerta se ejecuta antes de cada petición aunque está inerte desde `LAUNCH_AT`. No construyas nada sobre ellos ni los documentes como decisión.

## Cómo verificar esta área

| Cambio | Comprobación |
|---|---|
| `server/` o `api/` | `npm test` (incluye `server/**`) + `npm run check:functions` + `npm run check:architecture` |
| Transportes del navegador o estados del formulario | `contactSubmission.test.ts`, `auditSubmission.test.ts`, `submissionResponse.test.ts`, `ContactSection.test.tsx`, `AuditSection.test.tsx`; `e2e/forms.spec.ts` si se pide e2e |
| Consentimiento | `consent.test.ts`, `ConsentBanner.test.tsx`, `returningVisitor.test.ts`; `e2e/consent.spec.ts` si se pide e2e |
| Analítica | `googleAnalytics.test.ts`, `vercelInsights.test.ts`, `scripts/vercelConfig.test.ts` |
| `vercel.json` | `scripts/vercelConfig.test.ts`; tras desplegar, comprobar que responde el despliegue nuevo |
| Textos legales y de cookies | revisión del texto en el dataset de producción frente a lo que carga el código |

**Sin cobertura:** `CAPS` frente a `EDITORIAL_BOUNDS`; la semilla de Playwright frente a `CONSENT_VERSION`; la CSP real con GA4 cargado en producción; que los textos visibles describan lo que de verdad se carga.
