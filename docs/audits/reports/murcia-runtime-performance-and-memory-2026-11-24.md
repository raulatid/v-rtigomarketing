# Murcia en sesiones largas y en móvil: rendimiento y memoria en ejecución

**Fecha:** 2026-11-24 · **Base:** `8a2e219`, árbol limpio
**Guía:** ninguna; es un análisis a petición, no una pasada de `audits/website-performance-and-optimization.md`

Pregunta: ¿hay fugas de memoria o costes que degraden la escena de Murcia en sesiones largas, sobre todo en móvil, donde tiene que ir fluida?

Se repartió en cuatro frentes, todos por lectura de código:
- pantalla de la torre y pantalla del blog;
- Conócenos, cielo y campus;
- entrada, cámara, tráfico y agua;
- carga de assets, memoria de GPU y pipeline compartido.

No se modificó ningún archivo. **No se ejecutó nada:** ni tests, ni checks, ni build, ni perfiles en un dispositivo.

**Etiquetas.** *Leído*: comprobado en el código. *Plausible*: deducido del código sin seguir todos los caminos. *Estimado*: aritmética sobre tamaños, sin medir.

---

## 1. Resumen

- **No hay fugas que crezcan con la sesión.** Murcia se construye una vez por vida del canvas ([ciclo de vida](../../decisiones/transicion/ciclo-de-vida.md)). Todo listener, observer y temporizador tiene su `dispose` simétrico, y las texturas que se sustituyen se liberan antes. Ninguna colección crece sin tope.
- **Lo que puede notarse en móvil son costes de régimen estable y picos puntuales:**
  - las partículas del campus;
  - las dos pantallas pintadas en lienzo 2D;
  - asignaciones pequeñas por fotograma.
- **Bug funcional encontrado de paso:** la inclinación hacia el cursor no llega a activarse nunca (§2.1).
- **Con el contexto WebGL perdido, el bucle sigue corriendo** (§2.5).

## 2. Hallazgos, por prioridad

### 2.1 La inclinación hacia el cursor no se activa nunca (*leído*)

**Dónde:**
- `src/experiences/murcia/MurciaLayer.tsx:345`
- `src/experiences/murcia/MurciaExperience.ts` (`setZoomDepth` y `publishZoomTargets`)
- `src/experiences/murcia/camera/CameraRig.ts:462` y `:532-535`

**Qué pasa:**
1. `MurciaLayer` llama a `experience.setZoomDepth(...)` en cada fotograma, también con Earth en pantalla.
2. `setZoomDepth` pasa por `publishZoomTargets` y llega a `rig.setTargetZoom`.
3. `setTargetZoom` llama a `markNavigated()`, que pone `secondsSinceNavigation` a 0.
4. Por tanto `secondsSinceNavigation` no llega nunca a `cursorIdleDelay`. La inclinación de [sensación de cámara](../../decisiones/murcia/sensacion-de-camara.md) queda apagada.

**Qué más cuesta:** la llamada asigna varios objetos por fotograma toda la sesión, porque `zoomBand()` y `murciaZoomPose` devuelven objetos nuevos.

**Por qué no lo detecta nada:** `check:navigation` (`checks/navigation-feel.ts`, §8) prueba el rig aislado, sin la llamada por fotograma de `MurciaLayer`.

**Sin ver en el navegador.** Confirmarlo en escritorio: quieto más de 2 s con el ratón en un lateral.

**Arreglo posible:**
- no publicar si la profundidad y el aspecto no cambiaron, o
- no contar como navegación un objetivo de zoom que no se movió.

### 2.2 Partículas del campus: layout vivo de 4000 objetivos por fotograma (*leído*)

**Dónde:** `src/experiences/murcia/campus/attachServicesCampus.ts:345-362` (`setLiveLayout`) y `src/experiences/murcia/campus/particles/particleField.ts` (`tick` → `fillTargets`).

**Qué pasa:**
- Se repite en cada fotograma mientras un servicio está abierto y `figureMotion.amplitude !== 0`.
- En cada uno se reevalúa el layout de las 4000 partículas, con un closure de `seededRandom`, una tupla por partícula y varios `Vector3` en `facing`/`focus`.
- Después se sube el atributo con `aTarget.needsUpdate` (unos 48 KB, *estimado*).

**Por qué importa:** es la mayor presión de recolector de basura de Murcia en móvil. `count: 4000` no tiene variante por dispositivo. Se detiene al volver a la vista general.

### 2.3 Pantalla del campus a 16384×318 también en teléfonos (*leído*; tamaños *estimados*)

**Dónde:**
- `src/experiences/murcia/campus/campusScreen/attachCampusScreen.ts:42` y `:84`
- `src/experiences/murcia/MurciaExperience.ts:1435`

**Qué pasa:** la resolución es `min(16384, maxTextureSize)`, y los móviles actuales admiten 16384.

**Cuánto ocupa:**
- unos 28 MB de GPU con mipmaps, más unos 21 MB del lienzo en CPU;
- el doble durante el fundido entre diapositivas;
- la ranura saliente se aparca a 1×1 al terminar.

**Picos:** cada cambio de diapositiva repinta el lienzo y sube la textura entera con mipmaps en un solo fotograma. Pasa aunque el campus no esté en cuadro: `screen.update` corre siempre con Murcia activa (`attachServicesCampus.ts:~419-421`).

**Contexto:** `modestDevice` solo lo usa el tráfico (`MurciaExperience.ts:~1393`).

### 2.4 Pantalla de la torre: 569×2048 sin reducción en móvil (*leído*)

**Dónde:**
- `src/experiences/murcia/landmark/towerScreen/attachTowerScreen.ts:31` (`DEFAULT_RESOLUTION`)
- `src/experiences/murcia/landmark/towerScreen/mediaFacade.ts` (`resizeSlot`, `park`, `update`)

**Qué pasa:**
- **Al entrar en Conócenos** (`carousel.replay` con `ABOUT_SENTENCES_ENTRANCE_SECONDS`), se repinta el lienzo y se sube la textura con mipmaps en cada fotograma durante 4,2 s.
- **En cada rotación del carrusel** se reasigna el lienzo (unos 4,6 MB, *estimado*) y se crean y destruyen dos `CanvasTexture`.

Es el intercambio que documenta el propio archivo, no una fuga, pero en móvil son tirones puntuales.

**Arreglo posible:** un tope de resolución en dispositivos modestos, o repintar la entrada a 30 Hz.

### 2.5 Con el contexto WebGL perdido, el bucle sigue corriendo (*leído*)

**Dónde:**
- `src/App.tsx:883`, donde `suspended` solo cubre el blog y la auditoría
- `src/graphics/contextLoss.ts`
- `src/graphics/RenderPipeline.tsx:97-108`

**Qué pasa:** tras `webglcontextlost`, `frameloop` sigue en `'always'`. Toda la simulación corre detrás del aviso de «Recargar», gastando batería y CPU. Según `contextLoss.ts`, en iOS es el final esperado de una sesión larga.

**Pendiente de verificar (*plausible*):** three hace su propio `preventDefault()` y, al restaurar, `initGLContext()` reinicia sus propiedades, así que podría volver a subir buena parte de la escena por sí solo. Eso contradiría lo que dicen `contextLoss.ts` y [fallos de WebGL](../../decisiones/render/fallos-de-webgl.md). Hay que probarlo en un iPhone real antes de cambiar la decisión.

### 2.6 Asignaciones pequeñas por fotograma (*leído*; gravedad baja)

- `src/experiences/murcia/blogDisplay/blogDisplay.ts:~463`: un `new THREE.Vector3()` en cada fotograma en reposo. Arreglo trivial: un scratch fuera del closure.
- `src/experiences/murcia/ui/compassBar.ts:~388-460`: un array `labels`, un objeto por marca y unos cinco template strings con `toFixed` por marca. Se construyen antes de que `writeVar` descarte la escritura sin cambios. Solo con la brújula visible.
- `src/experiences/murcia/about/aboutSky.ts`, `sky/skyPasses.ts` (`lapDraw`) y `about/brandPanels.ts:~76`: arrays, closures y un `Map` nuevos en cada fotograma. Solo en la parada del cielo de Conócenos.
- `src/experiences/murcia/landmark/towerScreen/carousel.ts`: `frame()` devuelve un objeto nuevo en cada fotograma.
- `src/experiences/murcia/blogDisplay/blogApproach.ts` (`solveDestination`): crea objetos con `anchor()` y `panelQuaternion()` en cada fotograma. Solo mientras dura el vuelo de ida o de vuelta.

### 2.7 Datos retenidos después de la carga (*leído*; gravedad baja)

- `src/experiences/murcia/assets/loadCity.ts:268`: `LoadedCity.gltf` se queda en `this.loaded` toda la sesión. No tiene usos después de la carga, y retiene el parser, su caché, el JSON y el body (unos 1,9 MB).
- `src/experiences/murcia/assets/cityBytes.ts:56-83`: un atlas precargado que nadie llega a pedir retiene su `ArrayBuffer` (*plausible*). Pasa si el viewport cruza el punto de corte o si la carga falla.

Las copias en CPU de la geometría (unos 20 MB, *estimado*) y de los mips KTX2 también siguen vivas. Liberarlas no es trivial: las usan el raycast y una eventual restauración del contexto.

### 2.8 Menores

- **`src/experiences/murcia/campus/section/campusSheet.ts:~100-101`.** Cada `resize` ejecuta `fit()`, que lee el layout (`getComputedStyle`, `offsetHeight`) aunque la hoja esté oculta. En móvil, `resize` salta cada vez que aparece o se oculta la barra de URL.
- **`src/experiences/murcia/blogDisplay/handoffImage.ts:~120`.** El temporizador de seguridad quita el elemento para siempre: si salta una vez, las aproximaciones siguientes de la sesión van sin cubierta. Es de corrección, no de rendimiento.
- **`src/experiences/murcia/MurciaExperience.ts:1921`.** `waterTime` crece sin dar la vuelta, a diferencia del giro del logo de la torre. Con highp no se nota hasta muchas horas con Murcia activa.
- **`src/experiences/murcia/blogDisplay/blogApproach.ts:~512`.** Cada `setViewport` vuelve a crear tres geometrías del panel, todas liberadas. Es una ráfaga al arrastrar el tamaño de la ventana, no una fuga.

## 3. Memoria de Murcia en un teléfono (*estimado*)

| Recurso | Aproximado |
|---|---:|
| Texturas de Murcia | ~50 MB |
| · Pantalla del campus | ~28 MB |
| · Página del blog | ~7 MB |
| · Pantalla de la torre | ~6 MB |
| · Lightmaps KTX2 a 512, según el formato al que transcodifique | ~2-4 MB |
| Geometría (~520 k vértices tras Draco) | ~20 MB |
| Cadena de postproceso a dpr 2 (compartida, siempre residente) | ~50 MB |

El backbuffer con MSAA va aparte. MSAA y dpr son iguales en todos los dispositivos. Es la mayor palanca de coste por fragmento, pero el límite de densidad ya está decidido ([configuración del renderer](../../decisiones/render/configuracion-del-renderer.md)) y aquí no se propone tocarlo.

## 4. Zonas limpias (*leído*)

- **Listeners e input.** `navigation/createCameraInput.ts`, `pointsOfInterest/*`, `ui/focusParking.ts`, `hint/MurciaHintLayer.tsx`, `about/aboutInteraction.ts`, `campus/campusInteraction.ts` y `blogDisplay/panelPointer.ts` registran una vez y liberan en `dispose`. La navegación no tiene rAF propio.
- **Raycasts.** Como mucho uno por fotograma, con `hoverDirty`, solo en la vista general y contra objetivos concretos, nunca contra la ciudad entera. `InteractionProbe` está inerte en producción.
- **Congelado.** `MurciaExperience.update()` sale si `!active`. Earth no se actualiza ni se dibuja con Murcia activa. La única excepción es la llamada de §2.1.
- **Pipeline.** Murcia en reposo dibuja directo con MSAA, sin composer. El afterimage, el bloom y el vacío se desactivan a cero, no corren a cero.
- **Shaders.** No hay recompilaciones en tiempo de ejecución: los parches de `onBeforeCompile` van antes de `warm()` y las claves de programa son estáticas.
- **Decodificadores.** Draco y KTX2 se adquieren y se sueltan por parejas, en `finally`.
- **Texturas sustituidas.** `mediaFacade.resizeSlot`, `blogDisplay.setPage` y `particleField.rebuild` liberan lo anterior antes de crear lo nuevo.
- **Tráfico.** Sin asignaciones por fotograma, con tope `maxActive` y sin trabajo con movimiento reducido.
- **Cielo.** `createSkyVeil`, `createSkySatellites`, `createSkyDome`, `nightPulse` y `skyPulse` no trabajan fuera de su momento.

## 5. Orden propuesto

1. §2.1: arreglar la publicación del zoom por fotograma. Es un bug y además cuesta toda la sesión.
2. §2.3 y §2.4: tope de resolución de las dos pantallas en dispositivos modestos o en móvil.
3. §2.2: menos partículas o un layout vivo más barato en móvil.
4. §2.5: parar el bucle al perder el contexto; antes, probar la restauración en iOS.
5. §2.6 y §2.7: scratch buffers y soltar `loaded.gltf`, cuando se toquen esos archivos.

Para confirmar los picos de §2.2-2.4 hace falta un perfil con depuración remota en un móvil real, entrando y saliendo varias veces del campus y de Conócenos. Ninguna cifra de este informe se ha medido.
