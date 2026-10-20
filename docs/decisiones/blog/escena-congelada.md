# Con el blog abierto, la escena se congela y se oculta

**Estado:** vigente · **Desde:** 2026-08-31 (`950edce`, ADR 013) · **Sustituye a:** ADR 013 §2 y la consecuencia sobre la memoria de GPU

## Decisión

En una sesión caliente (el blog abierto desde la escena), el Canvas sigue montado:

1. **Congelar es `frameloop="never"`.** `App` pasa `suspended={blogOpen}` a `LazyScene`, y `SceneCanvas.tsx` lo convierte en `frameloop`. R3F deja de llamar al bucle. No se libera nada.
2. **Ocultar es `visibility: hidden` sobre el envoltorio `.app__scene`** (`data-hidden`, regla en `styles.css`), más `inert` para el foco y los lectores de pantalla. Nunca `display: none`.
3. **El blog es hermano de `.app__scene`, no hijo** (`<LazyBlog>` en `App.tsx`), para seguir visible e interactivo mientras todo lo demás está oculto e inerte.
4. **Con el blog abierto:** `attentionIsFree` es falso (no se acumula ningún gesto de navegación detrás), el cursor propio se apaga (`CustomCursor enabled={!blogOpen}`), la música se silencia (ver [música](../transicion/musica.md)) y el panel de depuración no se monta.
5. **Murcia sigue siendo la experiencia activa** durante toda la lectura. No hay cambio de mundo: por eso volver no cuesta nada (ver [ciclo de vida](../transicion/ciclo-de-vida.md)).

## Por qué

- Quien lleva minutos leyendo no debe pagar un bucle rAF, la postproducción y el trabajo por fotograma de los dos mundos detrás de una página opaca.
- Recargar sería peor: tiraría el contexto GL, el composer y la ciudad, y volvería a pasar la intro.
- `display: none` hace que R3F mida 0×0: el buffer de dibujo se rehace, el bloom rehace sus mips y Murcia recalcula su huella con aspecto 0. Sería una reconstrucción en cada ida y vuelta.
- Cortar desde `RenderPipeline` no congela: deja el lienzo en blanco (ver [trampas de transición](../../trampas/transicion.md), n.º 15).

## Qué se acepta

La memoria de GPU de las dos escenas sigue ocupada mientras se lee. Nunca se ha medido en un iPhone real.

Pendiente de confirmar con el usuario: si se deja como riesgo aceptado sin medición o se abre una tarea para medirlo en iOS.

## Qué se descartó

- Pausar con un retorno temprano en `RenderPipeline`.
- Ocultar con `display: none`.
- Navegar a otro documento desde la escena (`location.assign('/blog')`).

## Se ha roto si…

- `e2e/blog.spec.ts`, «a warm round trip freezes the scene and never rebuilds it»: el contador de fotogramas de `__vertigoGl` avanza con el blog abierto, cambian geometrías o texturas, la ciudad se construye más de una vez (`__vertigoMurciaBuilds`) o la página se recarga.
- Al volver del blog se ve una carga, la intro otra vez o un lienzo negro.

## Afecta a

`src/App.tsx` (`blogOpen`, `.app__scene`, `suspended`, `attentionIsFree`), `src/styles.css` (`.app__scene[data-hidden='true']`), `src/components/LazyScene.tsx`, `src/components/SceneCanvas.tsx` (`frameloop`), `src/components/LazyBlog.tsx`
