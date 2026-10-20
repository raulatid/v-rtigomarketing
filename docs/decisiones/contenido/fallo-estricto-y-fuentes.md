# Fallo estricto, fuentes de contenido y estado de publicación

**Estado:** vigente; el modo `seed`, en retirada (decidido 2026-10-20) · **Desde:** 2026-08-20 (ADR 010); entorno de Vercel validado desde 2026-09-05 (`1087422`); sello de versión desde 2026-09-19 (`a430e9b`) · **Sustituye a:** DECISIONS §27 («Strict by default…», «Cost…») y ADR 010 y 011 en lo que dicen de la política de fallo, las fuentes y el entorno

## Decisión

1. **Estricto por defecto, y producción es el caso estricto.** CMS inalcanzable, respuesta no 2xx, timeout o validación fallida: `content:build` sale con código distinto de cero, el build de Vercel falla y el despliegue anterior sigue sirviendo. No hay respaldo implícito «a lo que haya en disco».
2. **La fuente se decide en una función pura**, `readConfig` (`content/lib/config.ts`), y todas comparten la interfaz `ContentSource` (`content/lib/source.ts`):
   - `SANITY_PROJECT_ID` presente (o `CONTENT_SOURCE=sanity`) elige Sanity. `SANITY_DATASET` es obligatorio en **todos** los entornos y nunca tiene valor por defecto.
   - Sin fuente nombrada: `content/fixtures/` en local y en Preview; **error en producción**.
   - `CONTENT_SOURCE=fixture` está prohibido en producción.
   - Un `WP_CONTENT_BASE` sobrante falla con un mensaje que explica el cambio a Sanity.
   - `VERCEL` sin `VERCEL_ENV`, o un `VERCEL_ENV` fuera de `VERCEL_ENVIRONMENTS`, falla: sin eso las guardas de producción fallarían abiertas.
   - Un `SANITY_TIMEOUT_MS` inválido falla en lugar de caer a `DEFAULT_TIMEOUT_MS`.
3. **El modo `seed` está en retirada: no se usa.** El código aún lo tiene (`CONTENT_SOURCE=seed` lee `content/seed/` con un aviso en el log y producción lo acepta), pero su contenido es casi una copia de los fixtures, así que usarlo publicaría contenido de demostración. Retirarlo es una tarea de código pendiente: `readConfig` y sus mensajes, `buildSource` en `scripts/build-content.ts`, `content/seed/`, `.env.example`, `content/lib/config.test.ts` y el contrato de campos.
4. **El token, si existe, solo vive en el build.** `SANITY_TOKEN` nunca lleva prefijo `VITE_`, y un valor en blanco equivale a ausente. Se prefiere un dataset público sin token.
5. **El sitio publica de qué contenido se construyó.** Después de escribir el contenido, nunca antes, el build deja `public/content-version.json` con el `_updatedAt` más reciente de lo publicado (`latestUpdatedAt` en `content/lib/contentVersion.ts`), o `null` si la fuente no fue Sanity. `vercel.json` lo sirve sin caché y a cualquier origen. «Estado de la web», en la portada del Studio, lo compara con Sanity (`sanity-studio/components/siteStatusModel.ts`): así el editor ve que un build falló sin tener acceso a Vercel.

## Por qué

Un despliegue en verde es lo que el editor lee como «mi cambio está publicado»; un build que no pudo validar no puede dar esa señal. Que producción tenga que nombrar su fuente evita un despliegue en verde sirviendo fixtures anunciados por una sola línea de log. El sello existe porque el 2026-09-18 tres textos legales publicados hicieron fallar el build y nadie se enteró hasta el día siguiente.

## Qué se descartó

- Respaldo automático a fixtures o a la última salida.
- Un valor por defecto para el dataset: un `.env` a medias acabaría leyendo el contenido real del cliente.
- Consultar Vercel desde el Studio con un token para saber si el build falló: el sello no necesita credenciales.
- Reintentos o esperas por la consistencia eventual de Sanity tras publicar (ver [Sanity y la proyección GROQ](sanity-y-proyeccion-groq.md)).
- Mantener el seed como salida de emergencia: nadie lo refrescaba y no reflejaba el contenido real.

## Qué cuesta

Mientras Sanity está caído no se puede desplegar nada, tampoco un arreglo que solo toca código.

## Se ha roto si…

- Un despliegue termina bien con Sanity inalcanzable o con una colección inválida.
- Un build de producción sin fuente nombrada no falla, o uno con `CONTENT_SOURCE=fixture` pasa. Fija: `content/lib/config.test.ts` («fails when nothing names its source», «refuses to guess a dataset», «refuses a Vercel build whose environment is unknown»).
- `SANITY_TOKEN` aparece en `dist/`. Fija: `scripts/secretScan.ts` (`KNOWN_SECRETS`), usado por `assertNoSecrets` en `vite.config.ts` y por `check:publication`; tests en `scripts/secretScan.test.ts`.
- `content-version.json` cambia de forma. Fija: `content/lib/contentVersion.test.ts`; el lado del Studio, `sanity-studio/tests/editorial.test.ts` («whether the site has caught up…»), que `npm run check` no ejecuta.
- «Estado de la web» dice «al día» tras un build fallido (no lo fija ningún test de extremo a extremo).

## Afecta a

`content/lib/config.ts`, `content/lib/source.ts`, `content/lib/contentVersion.ts`, `scripts/build-content.ts`, `content/fixtures/`, `content/seed/`, `.env.example`, `vercel.json` (`/content-version.json`), `scripts/publicationHygiene.ts` (`PUBLIC_ROOT_FILES`), `sanity-studio/components/SiteStatus.tsx`, `sanity-studio/components/siteStatusModel.ts`
