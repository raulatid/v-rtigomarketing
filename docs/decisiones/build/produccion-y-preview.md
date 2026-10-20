# Producción y preview son builds distintos, y los separa un solo valor

**Estado:** vigente · **Desde:** 2026-08-07 (`fc986d9`); valores de entorno validados desde el 2026-09-05 (`1087422`); regla compartida en `scripts/buildEnvironment.ts` desde el 2026-10-20 (`21c9843`) · **Sustituye a:** DECISIONS §16, salvo el presupuesto de la entrada (ver [JS inicial de la portada](js-inicial-de-la-portada.md))

## Decisión

1. **El entorno se lee solo de `process.env`.** `resolveBuildEnvironment` (`scripts/buildEnvironment.ts`) toma `VERCEL_ENV`, si no `VITE_VERCEL_ENV`, si no `development`, con los espacios recortados; la usan `vite build` y `check:publication`. `content:build` lee solo `VERCEL_ENV`, a través de `content/lib/config.ts` (punto 3). Los tres comparten la negativa de `buildEnvironmentProblem`: un `.env*` que nombre las variables y un valor desconocido (punto 2).
2. **El build se niega a seguir si:**
   - el valor no está en `VERCEL_ENVIRONMENTS`;
   - un `.env`, `.env.local`, `.env.production` o `.env.production.local` nombra `VERCEL_ENV` o `VITE_VERCEL_ENV`;
   - en Vercel (`VERCEL` definida) falta `VERCEL_ENV`.
3. **`content/lib/config.ts` y `server/config.ts` aplican las mismas tres palabras a `VERCEL_ENV`.** Leen solo `VERCEL_ENV`, no `VITE_VERCEL_ENV`.
4. **El valor entra en el bundle como literal de compilación** (`define: __VERTIGO_ENV__`). `src/platform/buildFlags.ts` deriva de él `DEBUG_TOOLS_ENABLED`, `VERCEL_INSIGHTS_ENABLED` y `GOOGLE_ANALYTICS_ENABLED`. En producción el minificador elimina la consola `/debug`, las anulaciones por parámetro de URL y los diagnósticos (ver [depuración fuera de producción](depuracion-fuera-de-produccion.md)). `__VERTIGO_BUILT__` distingue un `dist/` construido del servidor de desarrollo, sea cual sea el entorno.
5. **El flag se pasa como parámetro a `src/experiences/**`, no se importa allí,** y se lee con una guarda `typeof` para que los harnesses empaquetados con esbuild funcionen sin `define`.
6. **El mismo valor decide la superficie de buscadores:**
   - `robots.txt` y `sitemap.xml` se generan en el build (`seoFiles` en `scripts/publicationPolicy.ts`), no se versionan;
   - producción permite rastrear, salvo `/debug`, y publica el sitemap;
   - cualquier otro entorno responde `Disallow: /` y lleva `noindex`;
   - canonical y `og:url` salen de `VERCEL_PROJECT_PRODUCTION_URL`, así que un preview apunta a producción.

## Por qué

Las herramientas de depuración son la forma de ajustar este proyecto, y un preview (hardware real, red real, sin indexar) es justo donde se quieren. Lo que estaba mal era su alcance: `/debug` era una página viva en el origen público y la consola volcaba geometría en cada visita.

Todas las reglas comparan con `=== 'production'`. Un valor mal escrito (`Production`, `prod`) o ausente en Vercel se leería como «no es producción» y publicaría la consola con un robots que lo prohíbe todo, desde un despliegue que se cree en vivo.

El `.env` se rechaza porque `vite.config.ts` no lo ve al cargarse y `content:build` y `check:publication` sí: un valor escrito ahí partía un build en dos entornos, un bundle de desarrollo verificado como si fuera de producción. Decisión del usuario (respuesta P6).

## Qué se descartó

- Borrar las herramientas de depuración.
- Leer `import.meta.env` dentro de `src/experiences`.
- Decidir por el nombre de host en tiempo de ejecución: publicaría el panel y lo escondería tras una comparación de cadenas.
- Un `robots.txt` versionado en `public/`: no puede variar por entorno.
- Un valor por defecto en Vercel cuando falta `VERCEL_ENV`.
- Leer el entorno de `.env` en algunos pasos y no en otros.

## Se ha roto si…

- Falla `scripts/buildEnvironment.test.ts` (valor desconocido, entorno en un `.env`).
- Fallan `content/lib/config.test.ts` («refuses a Vercel build whose environment is unknown») o `server/config.test.ts` («refuses the state where VERCEL is set but VERCEL_ENV is not»).
- Falla `scripts/publicationPolicy.test.ts` (robots de producción y de preview).
- `/debug` muestra el panel en producción, o `window.__vertigoBootDebug` existe allí. Fijan: `check:publication` («boot diagnostic exposed») y `e2e/production-hygiene.spec.ts`, solo con `VERCEL_ENV=production` exportado.
- `curl <preview>/robots.txt` devuelve `Allow: /`. Sin test contra el despliegue.

## Afecta a

`scripts/buildEnvironment.ts`, `vite.config.ts` (bloque de entorno, `define`, `seoAssets`, `siteHead`), `scripts/build-content.ts`, `scripts/check-publication.ts`, `src/platform/buildFlags.ts`, `scripts/publicationPolicy.ts`, `content/lib/config.ts`, `server/config.ts`, `.env.example`
