# Consentimiento

**Estado:** vigente · **Desde:** 2026-09-05 (`3bec60b`); dos categorías desde el 2026-09-15 (`7503c3a`); versión actual desde el 2026-09-25 (`341f464`) · **Sustituye a:** DECISIONS §35 en todo lo que no cubre [Nada interactivo hasta `site`](../intro/nada-interactivo-hasta-site.md) (registro, categorías, versión, panel); `docs/archivo/content/cookie-preferences.md`

Cuándo y dónde aparece el banner (al llegar a `site`, no modal, sin Escape) está en [Nada interactivo hasta `site`](../intro/nada-interactivo-hasta-site.md). Aquí está qué guarda y qué decide.

## Decisión

1. **Un único registro versionado en `localStorage`** (`CONSENT_STORAGE_KEY` y `CONSENT_VERSION` en `src/app/consent.ts`). Se lee con tolerancia: un registro de otra versión, malformado o escrito a mano se lee como «sin preguntar», nunca como un fallo. Subir `CONSENT_VERSION` vuelve a preguntar a todo el mundo.
2. **Dos categorías opcionales e independientes, desactivadas por defecto:**
   - `preferences`: la memoria de la intro (`vertigo:intro`). Retirarla la borra en el acto, también si se retira desde el blog o desde otra pestaña;
   - `analytics`: los proveedores de [analítica](analitica.md).
   Las necesarias (el propio registro y la música que el visitante activa o desactiva) no se preguntan.
3. **Todo proveedor depende de este módulo para cargar y para retirarse** (`hasConsent`, `subscribeConsent`). Cada proveedor nuevo exige actualizar la política de cookies y subir `CONSENT_VERSION`: un «sí» dado a una lista de proveedores más corta no vale para una más larga.
4. **Las elecciones se sincronizan entre pestañas** por el evento `storage`, que `consent.ts` reenvía a todos los suscriptores.
5. **El banner se monta dos veces, una por superficie, sobre el mismo registro:** dentro de `.app__scene` (`src/App.tsx`) y dentro de `.blog-root` (`src/blog/BlogSurface.tsx`, `idPrefix="blog-consent"`), cada una bajo su propio `LegalPanel`. Una elección en cualquiera de las dos cierra ambas. Su capa está en `consentBanner.css`, que importa el propio componente porque el blog no carga `styles.css`.
6. **El banner tiene dos botones del mismo peso, Rechazar todas y Aceptar todas**, que fijan las dos categorías a la vez, y un enlace «Configurar» que abre el documento legal `cookies`. Rechazar tiene que ser tan fácil como aceptar.
7. **Dentro del documento `cookies`, `CookiePreferences` edita borradores:** solo «Guardar», «Aceptar todas» o «Rechazar todas» persisten. Cerrar sin guardar descarta el borrador. La política va plegada debajo.
8. **Con una elección guardada, el banner se convierte en un botón de información** que abre el mismo panel. Es el único acceso a la política una vez contestado, así que se puede cambiar o retirar el consentimiento en cualquier momento.
9. **Si el almacenamiento falla, la elección vive en memoria durante la sesión** y se vuelve a preguntar en la siguiente visita.
10. **Los textos del banner y del panel son contenido:** `COOKIE_COPY` en `src/content/site.ts`, con los campos, sus límites y sus valores por defecto en `COOKIE_COPY_FIELDS` (`src/content/cookieCopy.ts`). En el Studio se editan en Ajustes del sitio → «Cookies y preferencias»; la política, en el documento legal `cookies`. Un documento sin ese objeto recibe los valores por defecto en el build. Cambiar los textos no cambia el comportamiento de las categorías ni instala nada, y llega a la web con el siguiente build.

## Por qué

- El cliente exige un banner y quiere Google Analytics. Desde el 2026-09-18 hay analítica real detrás de la categoría, así que es un banner de consentimiento, no un aviso informativo.
- La memoria de la intro también es almacenamiento en el dispositivo (LSSI, art. 22.2), aunque no identifique a nadie; por eso tiene su propia categoría y no va con las necesarias.
- `localStorage` y no una cookie: ningún servidor lee la elección, y una cookie viajaría en cada petición a `/api/*` y necesitaría caducidad y renovación.
- La versión en el registro es la forma de volver a preguntar cuando cambia lo que se pregunta.

## Qué se descartó

- Una cookie para guardar la elección.
- Una sola categoría global (la versión anterior a `7503c3a`).
- Fijar las categorías por separado desde el banner: eso es trabajo del panel.

## Se ha roto si…

- Un script de proveedor carga sin `analytics: true` en el registro vigente (`googleAnalytics.test.ts`, `vercelInsights.test.ts`).
- `vertigo:intro` sobrevive a una retirada de `preferences`, o la retirada no llega a otra pestaña (`consent.test.ts`; `e2e/consent.spec.ts`, «saves categories independently and synchronizes withdrawal across tabs»).
- Un registro de otra versión no vuelve a preguntar (`e2e/consent.spec.ts`, «a record of another version asks again»).
- El blog en frío no lleva su propia copia del banner (`e2e/consent.spec.ts`, «the cold blog carries its own copy, and its link opens the policy»).
- `src/intro-draw/returningVisitor.ts` y `src/app/consent.ts` discrepan sobre quién vuelve (`returningVisitor.test.ts`).
- La política de cookies deja de explicar cómo retirar el consentimiento (revisión del texto; sin test).

## Afecta a

`src/app/consent.ts`, `src/components/ConsentBanner.tsx`, `src/components/consentBanner.css`, `src/components/CookiePreferences.tsx`, `src/components/LegalPanel.tsx`, `src/content/cookieCopy.ts`, `src/content/site.ts`, `content/collections/siteSettings.collection.ts`, `sanity-studio/schemas/siteSettings.ts`, `src/app/introSeen.ts`, `src/intro-draw/returningVisitor.ts`, `src/App.tsx`, `src/blog/BlogSurface.tsx`, `playwright.config.ts`
