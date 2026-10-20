# Qué ejecuta Vercel, qué necesita del proyecto y cómo se cachea

**Estado:** vigente · **Desde:** 2026-08-07 (`adc5c6e`: `/assets/` y la caché corta de `public/`); `/fonts/` desde el 2026-08-31 (`950edce`); `/generated/` desde el 2026-09-09 (`31ec6c3`); `/audio/` desde el 2026-09-11 (`f4f706f`); `installCommand` en un script desde el 2026-09-14 (`12ea17d`); `/content-version.json` desde el 2026-09-19 (`a430e9b`); funciones comprobadas desde el 2026-09-21 (`131022f`); `media` en la caché corta desde el 2026-09-22 (`90361a6`) · **Sustituye a:** DECISIONS §16 («Depends on Vercel system environment variables»)

## Decisión

1. **La versión de Node la fija `engines.node` en `package.json`**, y `.nvmrc` dice lo mismo para trabajar en local. `engines` manda sobre el ajuste de Node del panel de Vercel.
2. **El panel de Vercel está en automático** para la orden de build, la carpeta de salida y la de instalación. Lo que manda está en el repositorio.
3. **Instalación:** `installCommand` en `vercel.json` apunta a `scripts/vercel-install.sh`. El script instala, con una guarda, las librerías del sistema que necesita la captura del blog y termina en `exec npm install`, así que su código de salida es el de npm (ver [captura de la página](../blog/captura-de-la-pagina.md)).
4. **Build:** sin `buildCommand` ni `outputDirectory`. Vercel ejecuta `npm run build` y publica `dist/` (ver [puerta de despliegue](puerta-de-despliegue.md)).
5. **Rutas:** solo hay rewrites para las rutas con documento propio (`/debug`, `/blog`, `/blog/:slug`); cualquier otra recibe `404.html` con estado 404. Como `vercel.json` no admite comentarios, el porqué de cada valor y de las cabeceras de seguridad vive en `scripts/vercelConfig.test.ts` (ver [cabeceras y CSP](../privacidad/cabeceras-y-csp.md)).
6. **Funciones:** cada archivo de `api/` es una ruta. Vercel lo transpila sin empaquetar, así que los imports relativos llevan extensión `.js`. Cada ruta declara su `maxDuration` en `export const config`; `vercel.json` no tiene bloque `functions`. La lógica vive en `server/` (ver [backend de los formularios](../formularios/backend-de-formularios.md)).
7. **Variables:** `.env.example` es su inventario, en dos clases.
   - De build: las leen `scripts/build-content.ts` y `vite.config.ts`. Un cambio exige volver a desplegar.
   - De ejecución: las leen las funciones en cada petición. Un cambio se aplica sin desplegar, y quitar una rompe un sitio que construye bien.

   Ninguna credencial lleva prefijo `VITE_`.
8. **El proyecto de Vercel debe tener activado «Automatically expose System Environment Variables».** Es el único ajuste del panel que el repositorio exige; sin él, el build falla a propósito (ver [producción y preview](produccion-y-preview.md)).
9. **Caché por ruta** (`headers` de `vercel.json`), según si el nombre del archivo cambia con su contenido:
   - **larga e `immutable`**: `/assets/` (hash de Vite), `/fonts/` y `/audio/` (hash del contenido en el nombre, por convención) y `/generated/*.webp` (la captura del blog);
   - **corta, con `stale-while-revalidate`**: `earth`, `models`, `textures`, `libs`, `draco`, `logos` y `media`, que no llevan hash;
   - **`no-cache`**: `/content-version.json` (con `Access-Control-Allow-Origin` para el Studio) y `/generated/blog-preview.json`;
   - el HTML y lo que no tiene regla se quedan con el valor por defecto de Vercel.
10. **Publicar en Sanity despliega por un webhook gestionado fuera del repositorio** (ver [trampas de contenido](../../trampas/contenido.md), n.º 13).

Pendiente de retirar: `middleware.ts` y las rutas del mirador (ver [trampas de formularios y privacidad](../../trampas/formularios-y-privacidad.md), n.º 21).

## Por qué

Que la receta y la versión de Node vivan en el repositorio hace que el despliegue se revise en un diff. Hoy el panel marca otra versión de Node en «Project Settings», y no se aplica mientras exista `engines`.

`installCommand` va en un script porque Vercel limita la longitud de ese campo y rechazó el build con la lista de paquetes en línea.

Las funciones van sin empaquetar porque así las carga la plataforma. El 2026-09-21 los dos formularios llevaban dos semanas y media respondiendo `FUNCTION_INVOCATION_FAILED`: Vite, Vitest y esbuild perdonan un import sin extensión, y Node no.

Vite pone hash a lo que empaqueta, pero copia `public/` tal cual. Lo que tiene nombre por contenido puede ser `immutable` sin riesgo; lo demás, no. `/logos/` y `media/` no pasan a `immutable` porque no llevan hash (decisión del usuario).

## Qué se descartó

- Un `buildCommand`, un `outputDirectory` o un bloque `functions` en `vercel.json`: duplicarían lo que ya dicen `package.json` y cada archivo de `api/`.
- Un `installCommand` en línea.
- Rewrites comodín: responderían a cualquier URL desconocida con la escena y estado 200.
- `immutable` para todo `public/`, incluidos `/logos/` y `media/`: congelaría archivos sin hash.
- Sin caché para todo: cada visita repetida volvería a descargar texturas y modelos.

## Se ha roto si…

- `engines.node` y `.nvmrc` no coinciden. Sin test.
- Falla `npm run check:functions` (una ruta de `api/` no arranca como la carga Vercel) o `scripts/vercelConfig.test.ts`.
- Un despliegue «no cambia nada»: una clave desconocida en `vercel.json` hace que Vercel lo rechace y la URL sigue sirviendo el anterior (ver [trampas de formularios y privacidad](../../trampas/formularios-y-privacidad.md), n.º 18).
- Un recurso sustituido sin cambiar de nombre sigue viéndose viejo días después, o entra en `/fonts/` o `/audio/` un archivo sin hash en el nombre. Ningún test mira las reglas de caché; se comprueba con `curl -I` contra el despliegue.
- El panel de Vercel deja de estar en automático. No se ve desde el repositorio.

## Afecta a

`vercel.json`, `package.json` (`engines`, `build`), `.nvmrc`, `scripts/vercel-install.sh`, `api/`, `server/`, `checks/function-boot.ts`, `scripts/vercelConfig.test.ts`, `.env.example`, `public/`
