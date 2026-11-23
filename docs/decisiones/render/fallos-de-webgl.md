# Los fallos de WebGL se declaran; no se recuperan

**Estado:** vigente · **Desde:** 2026-08-14 (`c5c90aa`; [auditoría de iOS Safari](../../audits/reports/ios-safari-2026-08-14.md), I1) · página sin escena desde el 2026-11-23 (auditoría de accesibilidad del 2026-11-18, D1) · **Sustituye a:** DECISIONS §23

## Decisión

1. **Sin WebGL 2, el chunk de la escena no se evalúa.** `LazyScene` pregunta una vez (`isWebGLAvailable`, en caché) y marca el arranque como fatal; no se monta ningún Canvas. Los bytes se descargan igualmente, por la precarga de módulos del HTML. La marca 3D del blog hace la misma pregunta (`headerLogoRuntime.ts`) y, sin WebGL 2, se queda en el SVG.
2. **Un error lanzado dentro del árbol de la escena lo recoge `SceneErrorBoundary`**, que marca el arranque como fatal y deja que el dibujo de la intro diga «No se pudo cargar la experiencia». No tiene interfaz propia.
3. **La pérdida de contexto es un evento DOM, no un error:** la observa `contextLoss.ts` (enganchado desde `RenderPipeline`), que llama a `preventDefault()` y lo comunica hacia arriba. `App` hace dos cosas, porque según el momento solo una se ve:
   - `markFatal`, visible mientras el dibujo de la intro sigue en marcha;
   - el aviso `.context-lost`, en español y con «Recargar», visible después (ver [plazo de carga](../intro/plazo-de-carga.md) y [trampas de la intro](../../trampas/intro.md), n.º 4).
4. **Sin escena, la portada ofrece lo que sigue siendo posible** (`SceneFallback.tsx`). Cuando el arranque queda fatal **antes de `site`** (sin WebGL 2, un chunk obligatorio que no llega, un error dentro de la escena o el plazo de carga) y no es una pérdida de contexto, `App` lo sabe por `loadProgress.subscribe` y:
   - monta la cabecera con Contacto y Auditoría y el banner de consentimiento, que si no esperarían a `site`, una fase que no llega;
   - pone encima del rótulo del dibujo un panel con nombre, «No se ha podido cargar la experiencia 3D» (vale para todas las causas, también un plazo vencido en una red lenta), la frase de presentación y tres controles: «Solicita la auditoría» y «Escríbenos», que abren los diálogos de la cabecera, y un enlace real a `/blog`, que es otro documento y no necesita WebGL;
   - el foco va al título del panel al aparecer, y vuelve al botón que abrió un diálogo si el diálogo lo deja en `<body>` (en el móvil su disparador está en el menú cerrado).

   Un fatal después de `site`, en un navegador que ya mostraba la escena, no lo monta: la cabecera ya está y el título mentiría. Mientras el menú del móvil está abierto, el panel se aparta como el resto (`siteMenu.css`). «Ir a Murcia» sigue en el orden de Tab sin hacer nada: es D3 de la auditoría, pendiente.

   Los casos no están: su contenido vive en el chunk de la escena y no entra en el de la portada ([JS inicial de la portada](../build/js-inicial-de-la-portada.md)).
5. **No se restaura el contexto.** Toda subida de texturas y compilación ocurre una vez, en efectos ligados a la carga; un contexto restaurado volvería vacío con una escena que se cree caliente. `webglcontextrestored` solo deja un aviso en la consola.

## Por qué

Antes nada escuchaba `webglcontextlost`: three deja de dibujar en silencio, React no se entera y el visitante ve un rectángulo negro para siempre. En iOS no es raro, es el final esperado de una sesión larga: Safari suelta contextos por memoria, y esta aplicación mantiene los dos mundos en la GPU toda la sesión ([ciclo de vida](../transicion/ciclo-de-vida.md)). Un estado de reserva solo existe si está implementado; convertir un negro silencioso en un fallo declarado es todo lo que se pide aquí.

## Qué se descartó

- Restaurar el contexto: es un proyecto propio.
- Confiar en el error boundary para la pérdida de contexto: no ve eventos DOM.
- Un segundo aviso de error dentro del boundary: competiría con el del dibujo de la intro. El panel de la página sin escena no lo sustituye: el rótulo sigue diciendo el fallo (`role="status"`) y el panel dice qué se puede hacer.
- Hasta el 2026-11-23, nada más que el rótulo: sin forma de escribir, pedir la auditoría ni llegar al blog (D1).
- Los casos en el panel: meterían el texto de los casos en el JS inicial de la portada.

## Se ha roto si…

- `e2e/mobile.spec.ts` («a lost WebGL context says so instead of going quietly blank») no ve el aviso.
- `e2e/degraded.spec.ts` («no WebGL 2: says so, and never evaluates the scene chunk») ve un canvas o la evaluación del chunk.
- Sin WebGL, la portada no ofrece Contacto, Auditoría y el blog, o el foco no está en el panel. Fija: `SceneFallback.test.tsx`; el cableado de `App`, solo en el navegador (`--disable-3d-apis`).

## Afecta a

`src/components/SceneFallback.tsx`, `src/loading/progress.ts` (`subscribe`), `src/graphics/contextLoss.ts`, `src/graphics/webglSupport.ts`, `src/graphics/RenderPipeline.tsx`, `src/components/LazyScene.tsx`, `src/components/SceneErrorBoundary.tsx`, `src/App.tsx` (`handleContextLost`, `.context-lost`), `src/blog/headerLogoRuntime.ts`
