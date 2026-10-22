# La pantalla lleva una captura del blog construido, o una placa neutra

**Estado:** vigente · **Desde:** 2026-09-09 (plan 022); en Vercel desde el 2026-09-14 (`d19b599`) · **Sustituye a:** DECISIONS §42, desde «The panel wears a screenshot…» hasta «…zero egress from the browser process is not claimed»

## Decisión

1. **Solo hay dos imágenes posibles** (`blogDisplay/pageImage.ts`):
   - la **captura** del `/blog` que acaba de construir este build, hecha por `scripts/blog-preview.mjs` después de `vite build` en varias proporciones de ventana (`VIEWPORTS`) y anunciada en un manifiesto (`MANIFEST_URL` en `pageImage.ts`);
   - la **placa**: papel y una barra de cabecera, sin contenido. Es lo que se ve en `vite dev` y en cualquier build sin captura.

   No hay una tercera vía: `src/experiences/` no puede importar `src/blog/`, y copiar su marcado sería una segunda descripción del blog que caducaría sin aviso.
2. **Nada rancio sobrevive:** `vite build` vacía `dist/` y el script borra `dist/generated/` antes de empezar. Las capturas se promueven solo si salen todas, y el manifiesto se escribe el último.
3. **Una captura fallida nunca hace fallar un despliegue.** El script no tiene ningún `process.exit(1)`, y `scripts/vercel-install.sh` protege la instalación de librerías del sistema con `|| echo` y termina en `exec npm ci`.
4. **El navegador está confinado, no se confía en él:**
   - un servidor estático propio sirve `dist/`, solo GET y HEAD, nunca `/api` (`startStaticServer`, `isApiPath`);
   - todas las peticiones se interceptan antes de que exista la página (`hardenContext`); las de otros orígenes se cortan, salvo `cdn.sanity.io`, que se responde desde memoria con un GIF transparente (`EXPECTED_EXTERNAL`, `TRANSPARENT_GIF`);
   - los WebSocket y los service workers se bloquean;
   - Chromium y el instalador reciben un entorno filtrado (`chromiumEnv`, `installEnv`);
   - instalación y captura tienen plazos separados (`INSTALL_DEADLINE_MS`, `CAPTURE_DEADLINE_MS`).
5. **El sandbox de Chromium está activo en todas partes salvo en Vercel** (`chromiumSandbox: process.env.VERCEL !== '1'`). Es una decisión explícita por entorno, no un reintento tras un fallo.
6. **En Vercel**, el Chromium de la versión fijada de Playwright se instala solo allí, y las librerías del sistema las instala `scripts/vercel-install.sh` (el `installCommand` de `vercel.json`).

**Frontera:** la receta `build` de `package.json` (`check && vite build && blog:preview && check:publication`) y el `installCommand` son del área de build. Esta decisión se queda en el blog porque su única razón es la pantalla; build debe enlazar aquí.

## Por qué

- Una captura que ya no coincide con el contenido es peor que ninguna: se equivoca con seguridad y parece correcta. Una placa sin contenido no puede caducar.
- Producción llevó la placa hasta el 2026-09-14 porque el contenedor de build de Vercel no tenía navegador.

## Riesgo aceptado

El contenedor de build de Vercel no puede ejecutar el sandbox. Sin él, nada de este diseño sustituye el aislamiento del renderer: el enrutado, el servidor estático y el entorno filtrado limitan a qué llega el navegador, no lo que un renderer comprometido podría hacer en la máquina de build. Se consideró proporcionado porque la única página que se pinta es el blog de este mismo build, cuyo contenido es Portable Text restringido, convertido en build y pintado como texto.

**Obligación de mantenimiento:** Playwright y su Chromium (`@playwright/test` en `package.json`) se actualizan en el mantenimiento de dependencias; una vulnerabilidad publicada del renderer o de V8 adelanta la actualización.

**No se garantiza** que no salga tráfico de un WebSocket abierto dentro de un worker dedicado, ni las consultas DNS, ni las preconexiones especulativas, ni el tráfico propio del navegador, ni la descarga del instalador.

Pendiente de confirmar con el usuario: si este riesgo sigue aceptado y quién es responsable de la obligación de mantenimiento.

## Qué se descartó

- `vite preview` para la captura: evalúa `vite.config.ts` y monta el manejador real de formularios con `process.env`.
- El ráster SVG exacto del laboratorio.
- Una placa que imite el blog.
- Un servicio de captura aparte, un flujo de CI o una plantilla de imagen hecha a mano.
- Desactivar el sandbox como respaldo tras un fallo al lanzar.

## Se ha roto si…

- El log del build de Vercel muestra que la captura no se hizo (`[blog-preview] …`) y la pantalla de producción lleva la placa.
- Falla `pageImage.test.ts` (elección de variante, manifiesto, placa).
- Un fallo de la captura hace fallar el build.
- El confinamiento del navegador no tiene test: `blog-preview.mjs` exporta funciones pensadas para probarlo (`pickEnv`, `resolveStaticPath`, `startStaticServer`, `hardenContext`…), pero ningún test las importa.

## Afecta a

`scripts/blog-preview.mjs`, `scripts/vercel-install.sh`, `vercel.json` (`installCommand`, cabeceras de `/generated/`), `package.json` (`build`, `blog:preview`, `pree2e`), `src/experiences/murcia/blogDisplay/pageImage.ts`, `src/experiences/murcia/blogDisplay/handoffImage.ts`
