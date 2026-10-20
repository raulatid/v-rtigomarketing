# Configuración del renderer de la escena

**Estado:** vigente · **Desde:** 2026-08-14 (`c5c90aa`: `dpr` y `alpha` explícitos); `offsetSize` desde el 2026-09-09 (`e2bef6c`); 1,5× en móviles probado y retirado el 2026-09-25 (`de3ac0e`, `3a758f5`); tone mapping y espacio de color explícitos desde el 2026-10-20 · **Sustituye a:** la fila «The renderer takes R3F's defaults» de «Superseded»

## Decisión

1. **Toda la configuración del renderer de la escena está en el `<Canvas>` de `SceneCanvas.tsx`**, que es su único dueño. Lo que no se escribe ahí es el valor por defecto de R3F. El registro de clases de three con `extend` (el catálogo de three) es del área de Build y presupuestos.
2. **La densidad de píxeles tiene el mismo límite en todos los dispositivos, móviles incluidos:** la prop `dpr` del `<Canvas>`, escrita aunque coincida con el valor por defecto de R3F, para que una actualización de la librería no la mueva sin avisar.
3. **`antialias: true`.** Es el MSAA que conserva la ruta directa de Murcia (ver [el pipeline dibuja un contrato](el-pipeline-dibuja-un-contrato.md)).
4. **`alpha: false` y `setClearColor` con el negro de la apertura** (el mismo que pinta `index.html`): nada se ve a través del canvas. three crea el contexto con `alpha: true` de todos modos, así que esto no ahorra composición del navegador; solo hace correcta la limpieza opaca.
5. **El tone mapping (ACES Filmic) y la salida sRGB se escriben en el `gl` del Canvas,** aunque coinciden con el valor por defecto de R3F, para que una actualización no los mueva. R3F aplica esas props después de sus valores por defecto. No se pasa `flat` ni `linear`. No hay exposición propia ni sombras.
6. **El canvas se mide con `resize={{ offsetSize: true }}`**, no con el rectángulo transformado, para que el menú del móvil, que inclina la escena, no redimensione el buffer de dibujo.
7. **Se exige WebGL 2.** Se pregunta una vez antes de montar el Canvas (`isWebGLAvailable`); ver [fallos de WebGL](fallos-de-webgl.md).

## Por qué

- **El límite de densidad en móviles se queda donde está porque por debajo se notaba a la vista el empobrecimiento** (decisión del usuario, 2026-10-20). El límite en sí existe para que un móvil de 3× no pase por la cadena de postproceso todos los píxeles que pediría su pantalla (comentario de `dpr` en `SceneCanvas.tsx`).
- El límite existía y se perdió en una mudanza: `appConfig.ts` lo quitó diciendo que pertenecía a quien crea el renderer, y el nuevo dueño nunca lo escribió. Escribir los valores es lo que les da un sitio donde discutirlos.

## Qué se descartó

- **Limitar a 1,5× en móviles y tabletas** (`de3ac0e`): ahorraba alrededor de un 44 % de píxeles sombreados y de memoria de framebuffer, según su commit, pero el empobrecimiento se notaba. Retirado el mismo día (`3a758f5`).
- Leer `alpha: false` como ahorro de composición.

## Se ha roto si…

- `e2e/boot.spec.ts` («never paints a light frame during boot») falla: color de limpieza.
- `e2e/mobile.spec.ts` («the burger hinges the scene away…») ve cambiar el buffer de dibujo al redimensionar con el menú abierto: `offsetSize`.
- `e2e/backdrop.spec.ts` cambia de píxeles: tone mapping o espacio de color.
- La densidad de píxeles, `antialias` y el tone mapping **no tienen test**.

## Afecta a

`src/components/SceneCanvas.tsx`, `src/graphics/webglSupport.ts`, `src/blog/headerLogoRuntime.ts` (copia el tone mapping, el espacio de color y el límite de densidad), `src/experiences/murcia/blogDisplay/pageImage.ts` (`TEXTURE_SCALE`), `scripts/blog-preview.mjs` (`DEVICE_SCALE_FACTOR`)
