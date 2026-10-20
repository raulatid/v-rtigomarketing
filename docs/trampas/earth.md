# Trampas: escena de la Tierra

Errores reales y comportamientos que parecen bugs pero son intencionados. Las decisiones están en [`decisiones/earth/`](../decisiones/earth/). Las trampas del warp y de la vuelta desde Murcia están en [transición](transicion.md).

## Cámara y órbita

1. **Los ángulos de la órbita no se acotan y se suavizan como ángulos.** Un lerp por la cuerda gira la cámara hacia atrás pasada media vuelta. Fija: `check:earth` §1–§3.
2. **El arrastre conserva las vueltas; la vuelta desde un primer plano usa `nearestEquivalentAngle`.** Si se mezclan, se deshacen vueltas o se pierde recorrido. Fija: `check:earth` §2 y §6.
3. **Un segundo dedo es un pasajero e invalida `dragDistance`.** Si no, un gesto de dos dedos se lee como tap y selecciona un satélite. Fija: `check:earth` §7.
4. **Un arrastre de ratón no tiene umbral.** Consumir su primer movimiento se come el comienzo de cada arrastre.
5. **`setZoomDepth` debe ejecutarse antes que `activate()`.** `activate` parte de la vista general al radio del zoom; en otro orden, la vuelta desde Murcia se aleja a la vista. Sin test directo.
6. **`setZoomDepth` se ejecuta cada fotograma, incluso con Murcia en pantalla.** Leer ahí `clientWidth` en vivo forzaba un layout (unos 40 ms por segundo en una tableta). Fija: `focusRigViewport.test.ts`.
7. **El extremo cercano lee el nivel de texturas FIJADO, nunca el ancho vivo.** Un móvil girado recibiría el extremo de escritorio con mapas estrechos. Fija: `earthConfig.test.ts` («LATCHES…»).
8. **Los dos mundos comparten canvas y el foco de satélites escucha en `window`.** Filtra por `active`/`setEnabled`, o el mundo inactivo acumula estado. Fija: `satelliteFocusExpansion.test.ts`.
9. **`AuditCameraShift.panelWidth` copia a mano el ancho CSS de `.audit-curtain`.** Sin test. Hoy solo copia el de escritorio (ver posibles defectos).
10. **`auditView.open` tiene un único escritor.** Fija: `auditView.test.ts`.
11. **La Tierra gira despacio (`EARTH_CONFIG.rotationSpeed`, minutos por vuelta):** un test que espera a que aparezca una región no debe sondear un minuto fijo.

## Satélites y hologramas

12. **Cambiar `modelSize` obliga a mover todo lo que depende de él** (`baseSize`, `PANEL_HEIGHT`, `PANEL_OFFSET_Y`, `coneFootRadius`, `cueRadius`, `closeUp`). Si no, aparecen zonas muertas al pasar el ratón, la placa se hunde en el modelo o el primer plano se sale. Fijado solo en parte.
13. **El tamaño de escritorio es UNA escala de grupo, nunca un segundo juego de constantes.** Las constantes se hornean en la geometría y la construcción no se repite al redimensionar. Fija: `satelliteScale.test.ts`, `orbitConfig.test.ts`.
14. **Los uniforms del panel se siembran con `deploymentFrom(0)`, nunca con literales.** Una proporción 0 borra todos los isotipos en reposo. Sin test.
15. **La comprobación de límites se hace sobre las UV ajustadas ANTES del pliegue de la celda, y difuminada, no cortada.** Si no, se cuela la placa vecina o aparece una caja alrededor de cada marca. Solo visual.
16. **El halo necesita soporte compacto, y el lavado bajo la línea debe tener SIGNO.** Si no, el quad los recorta en rectángulos o en una losa.
17. **Una promesa rechazada se queda en caché:** límpiala en `.catch` (`createSatellite.ts`).

## Placas de marca

18. **Un logo contaminado mata los seis paneles.** Fija `crossOrigin` antes que `src` Y pasa la sonda. Sin test.
19. **`needsUpdate` vuelve a subir el atlas entero con sus mipmaps:** agrupa las subidas.
20. **El límite de un texto en canvas es un ancho, no una coordenada.**
21. **El alfa no cuenta para el umbral de bloom:** para atenuar, oscurece el color.
22. **Una clave de `mediaRules` debe coincidir con el nombre del campo replicado.** Fija: `collections.test.ts`.
23. **El nivel de Studio falla en abierto**, y sus tests (`sanity-studio/tests`) no los ejecuta `npm test` de la raíz.

## Cielo y estrellas

24. **`scene.background` no pasa por tone mapping:** el cielo sigue siendo una malla.
25. **Perturba las DIRECCIONES de las estrellas, no sus posiciones**, o se rompe la garantía de la capa. Fija: `check:space` §2.
26. **La fotografía y la capa de estrellas no pueden aportar estrellas las dos**, y WebP hace bandas en degradados oscuros. Solo una imagen lo verifica.
27. **Que algo sea 2:1 no significa que sea equirectangular.** Mide por canal y sobre la ENTRADA: una métrica tomada después de su propia corrección confirma la corrección.
28. **`sharp(buffer).toFile()` recodifica:** escribe con `fs.writeFile`.
29. **`public/` no lleva hash y se cachea** (`vercel.json`): un archivo sustituido «no se despliega».
30. **Nada comprueba que los archivos del cielo existan en las rutas configuradas**, y `markDone` convierte un 404 en un cielo negro.
31. **`MAX_TEXTURE_SIZE` y la VRAM no dependen del peso del archivo.** Se mantiene 4096×2048.
32. **La exposición del cielo se ajusta a cada imagen.** Reajústala antes de juzgar un cielo nuevo. Los comentarios de exposición y de `capLevel` hablan de imágenes anteriores: no te fíes de ellos.
33. **Los casquetes polares oscuros no son un defecto:** no los aclares.
34. **El comienzo del casquete tiene un suelo geométrico** derivado de `skyBandTilt`. Fija: `check:space` §7.
35. **Las precargas de `index.html` deben usar el mismo `narrowMaxWidth`** que el código (cielo y Tierra), o se descargan los dos juegos.
36. **Los KTX2 de la Tierra van en orientación abajo-izquierda; `flipY` no hace nada.**

## Pista de escena

37. **El 85 % de alfa de la pista va en `color`;** `opacity` es el canal del fundido.
38. **La flotación (`--hint-float`) tiene que estar en `bottom`**, o al flotar la pista invade el pie. Fija: `e2e/navigation.spec.ts`.
39. **La pista no tiene prop `visible` ni estado de React.** Fija: `EarthHint.test.tsx`.
40. **`pointermove` no puede entrar en la lista de acciones**, ni `satelliteHoverRef` escribirse después de un retorno temprano.
41. **El cambio de glifo tiene que estar en el mismo bloque `(pointer: coarse)` que la frase.**
42. **Cada dedo es un trazo que gira, nunca un morph.** Fija: `EarthHint.test.tsx`.
43. **Una capa debe borrar `data-visible` cuando `!active`.**
44. **Las reglas `'out'` sobreviven a la supresión por movimiento reducido solo porque fijan `animation-name` a secas.** Si se convierten al shorthand `animation`, la pista de Murcia seguiría animándose con movimiento reducido.

## Panel del caso

45. **`CASE_PANEL_DOCK_*` debe coincidir con la media query de `styles.css`.** Fija: `closeUpFraming.test.ts`, `e2e/mobile.spec.ts`.

## Cómo verificar esta área

| Cambio | Comprobación |
|---|---|
| Rig, órbita, arrastre | `npm run check:earth` + tests de `src/experiences/earth/camera/` |
| Zoom de Earth, texturas | `zoomPose.test.ts` (Earth), `earthConfig.test.ts`, `npm run check:warp` §7 |
| Satélites, hologramas | tests de `src/experiences/earth/orbit/` y `satelliteFocusExpansion.test.ts` |
| Placas y validación de marcas | `createBrandAtlas.test.ts`, `content/` (`mirror.test.ts`, `collections.test.ts`), `npm --prefix sanity-studio test`, `npm run content:build` |
| Cielo y estrellas | `npm run check:space`; `scripts/preview-sky-poles.mjs`; `e2e/backdrop.spec.ts` si se pide |
| Pista | `EarthHint.test.tsx`, `MurciaHint.test.tsx`, `hintIdle.test.ts`; `e2e/navigation.spec.ts -g "Earth hint"` si se pide |
| Panel del caso | `caseSheetLayout.test.ts`, `closeUpFraming.test.ts`; `e2e/mobile.spec.ts` si se pide |
| Inspección visual | vista general en móvil y escritorio, primer plano sobre el lado de día, hoja en `peek` y `expanded`, vista de polos |

Parámetros de depuración: `?hint=1`, `?holo=1&holoExpand=0|0.5|1`, `?tutorial=1`, `?skyImage=`, `?debug=1`.

## Posibles defectos

- **Las capturas de referencia de `e2e/backdrop.spec.ts`** son del 2026-08-20, anteriores a varios cambios de encuadre y de cielo. Probablemente fallan.
- **En tableta (768–1024 px), el desplazamiento de la auditoría usa el ancho de escritorio:** el CSS usa otro `clamp`, así que el encuadre queda algo descentrado.
- **Acoplamientos que nada comprueba:** los valores de la bandeja (`panel.glass*`) frente a `siteHeader.css`, y `closeUp.distance` frente a `modelSize`.
