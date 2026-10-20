# Trampas: render y gráficos

Errores reales y comportamientos que parecen bugs pero son intencionados. Las decisiones están en [`decisiones/render/`](../decisiones/render/).

## Bucle y prioridades

1. **Solo `RenderPipeline` usa una prioridad de `useFrame` distinta de 0.** Cualquier prioridad mayor que 0 hace que R3F deje de dibujar; una prioridad 2 correría DESPUÉS del dibujo y su efecto se vería un fotograma tarde. Entre las de prioridad 0 manda el orden de montaje (ver [`transicion.md`](transicion.md), n.º 6). Sin test.
2. **Un reloj que la escena lee no puede ir en un rAF propio:** si corriera después del de R3F, cada fotograma pintaría el valor anterior. Se monta como `TransitionClockDriver` dentro del Canvas. Sin test.
3. **`RenderPipeline` va el último en `SceneCanvas.tsx`:** es lo único que dibuja, y toda capa que escriba estado por fotograma que él consume tiene que montarse antes. Sin test.

## Composer y pases

4. **El composer no tiene MSAA.** Sus targets son HalfFloat sin `samples`; pasar Murcia por él fuera del warp quita el antialiasing a la ciudad sin ningún error.
5. **No añadas un segundo `OutputPass` ni conviertas color dentro de la cadena.** El tone mapping se aplica una vez: en el shader cuando se dibuja al canvas, y en `OutputPass` cuando se dibuja por el composer.
6. **`OutputPass` debe estar siempre activo.** El composer decide en cada render qué pase escribe en pantalla; desactivar los demás es seguro solo porque el último no cambia nunca.
7. **Desactiva un pase a cero; no lo dejes corriendo a cero.** Un afterimage con `damp` 0 seguía haciendo dos pasadas a pantalla completa en cada fotograma de la sesión. Lo mismo vale para bloom y vacío. Sin test.
8. **El composer no depende de `size`.** Reconstruirlo al redimensionar tiraría y recompilaría todos los pases; se redimensiona en un efecto aparte.
9. **El pase del logo debe devolver `autoClear` a su valor**, y el logo nunca debe llamar a `renderer.clear()`: borraría el framebuffer compartido. Sin test.

## Liberación

10. **R3F no libera geometría ni material pasados como props.** Un `useMemo` de geometría pierde memoria al desmontar y en cada reconstrucción del memo; libéralo en la limpieza de un efecto ligado al memo (`SpaceBackdrop.tsx`, `Starfield.tsx`, `SkyShell.tsx`). Sin test.
11. **`disposeObject3D` no sirve para modelos que comparten geometría con una plantilla en caché** (`createSatellite.ts`): liberaría la geometría de todos los clones posteriores.

## Fallos de WebGL

12. **El error boundary no ve la pérdida de contexto.** Es un evento DOM: three deja de dibujar en silencio y nada lanza. Sin `preventDefault()`, el navegador ni siquiera intenta restaurarlo. Fija: `e2e/mobile.spec.ts` («a lost WebGL context…»).

## Decodificadores

13. **Adquiere y suelta por parejas, y suelta al terminar la carga.** Un `release` de más quita el grupo de workers a quien aún decodifica; atarlo a la vida de un objeto que no se libera deja los workers para siempre. Fija solo para los lightmaps: `loadUnifiedLightmaps.test.ts`.

## Configuración

14. **El límite de densidad está copiado en cuatro sitios:** `dpr` en `SceneCanvas.tsx`, `setPixelRatio` en `headerLogoRuntime.ts`, `TEXTURE_SCALE` en `pageImage.ts` y `DEVICE_SCALE_FACTOR` en `scripts/blog-preview.mjs`. Si cambias uno, revisa los otros. Sin test.
15. **`alpha: false` no ahorra composición del navegador:** three crea el contexto con `alpha: true` igualmente. No vuelvas a deducir un ahorro de esa línea.
16. **El tone mapping y el espacio de color de la escena no están escritos en ningún sitio:** son el valor por defecto de R3F, y `headerLogoRuntime.ts` los copia a mano. Un `flat` o `linear` en el Canvas, o un cambio de R3F, separaría las dos marcas. Fija en parte: `e2e/backdrop.spec.ts`.
17. **El canvas se mide por `offsetSize`.** Con el valor por defecto de R3F, el rectángulo inclinado del menú del móvil entraría en `gl.setSize` → `composer.setSize` → `setViewport`. Fija: `e2e/mobile.spec.ts` («the burger hinges the scene away…»).

## Ya migradas en otras áreas

- Retorno temprano en `RenderPipeline` = lienzo en blanco, los dos buffers del afterimage, el bloom a 0 al tomar prestado el composer, `EffectComposer.dispose()`, el número de luces y el precalentado: [`transicion.md`](transicion.md), n.º 5 y 14-20.
- Fatal tras ceder el paso, `disposed` con StrictMode, `alpha: false` exige `setClearColor`: [`intro.md`](intro.md), n.º 4, 5 y 10.
- Promesa rechazada en caché, el alfa y el umbral de bloom, `scene.background` sin tone mapping: [`earth.md`](earth.md), n.º 17, 21 y 24; `colorspace_fragment` y KTX2: [convenciones de render](../decisiones/earth/convenciones-de-render.md).
- `display: none` y `detectSupport` con dos contextos: [`blog.md`](blog.md), n.º 7 y 24.

## Cómo verificar esta área

| Cambio | Comprobación |
|---|---|
| Imports de `graphics/` o `corner-logo/` | `npm run check:architecture` |
| Ruta, bloom retenido, vacío, reinicio de acumulación | `SceneCanvas.test.tsx` |
| Cadena del composer, tone mapping, cielo | `e2e/backdrop.spec.ts`, solo si se pide e2e |
| Un canvas, suspensión del bucle | `e2e/boot.spec.ts`, `e2e/blog.spec.ts`, solo si se pide e2e |
| Pérdida de contexto, sin WebGL 2 | `e2e/mobile.spec.ts`, `e2e/degraded.spec.ts`, solo si se pide e2e |
| Decodificadores | `loadUnifiedLightmaps.test.ts`; contar workers a mano en el build de producción |
| Cualquier cambio visual de render | inspección de los estados afectados (Earth en reposo, warp, Murcia directo, logo de esquina) |

**Sin cobertura:**
- el propio `RenderPipeline` (orden de pases, desactivación, caída al composer, pase del logo);
- que solo el pipeline dibuje en el canvas, que nadie más use prioridad distinta de 0 y que los rAF ajenos no dibujen;
- `new WebGLRenderer`, `new DRACOLoader` o `new KTX2Loader` fuera de su sitio;
- densidad de píxeles, `antialias` y las cuatro copias del límite;
- separación de escenas y cámaras;
- liberación de recursos al desmontar.

## Posibles defectos

- El tone mapping y el espacio de color implícitos (n.º 16) no son un defecto hoy, pero un cambio de valores por defecto de R3F desajustaría en silencio la marca del blog.
