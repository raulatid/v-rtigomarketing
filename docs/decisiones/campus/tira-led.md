# La tira LED del campus corre sobre el motor de la pantalla de la torre

**Estado:** vigente · **Desde:** 2026-09-11 (`346035b`); reproductor compartido con la torre desde el 2026-09-15 (`c5f0021`); frase actual desde el 2026-09-16 (`0c33d12`), y el número de copias de ese mismo día (`0b894e1`) · **Sustituye a:** DECISIONS §45 (en parte: punto 3, «One LED engine»; «The strip is 8192, not the lab's 16384»; y el párrafo de la frase de la tira)

## Decisión

1. **Hay una sola máquina LED.** La tira `CAMPUS_SCREEN_Continuous` usa la fachada, el compositor y el carrusel de `landmark/towerScreen/` a través de `screens/screenPlayer.ts`, el mismo reproductor que la torre. Solo `campusScreen/attachCampusScreen.ts` y su documento son del campus.
2. **El documento está en código** (`campusScreen/campusScreenContent.ts`, con la forma de `FacadeContentDocument`): la frase «CLICA AQUI, VE NUESTROS SERVICIOS», pintada `REPEATS` veces a paso uniforme y centrada en altura. No viene de Sanity ni sigue a `district.label`. La torre sí viene de Sanity: [pantalla de la torre](../contenido/pantalla-de-la-torre.md).
3. **La frase no se anima: se desliza** la textura en u (`setScroll`; `scrollMetresPerSecond` en `screenTuning`, `attachServicesCampus.ts`). `REPEATS` divide la tira exacta, así que no hay costura. El shader solo envuelve u mientras desliza, y la torre queda igual píxel a píxel.
4. **Una frase más larga lleva menos copias, nunca un paso más apretado.** El compositor avisa en consola si una línea asentada se pasa del ancho del lienzo (`warnIfOverflowing` en `facadeRenderer.ts`).
5. **Resolución:** la `resolution` que pasa `createServicesCampus.ts`, la mitad de `DEFAULT_RESOLUTION` del laboratorio (`attachCampusScreen.ts`) y limitada a `maxTextureSize`. Anisotropía: la misma que la pantalla de la torre (`MurciaExperience.setupCampus`).
6. **Las medidas son metros de diseño** (`DESIGN_METRES_WIDE`, `DESIGN_METRES_TALL`): la fachada normaliza lo que mide a ese ancho, y otra escala de exportación muestra el mismo diseño.
7. **Sin `flipY`, y con el canal UV de `CAMPUS_SCREEN_UV_CHANNEL`** (`campusConfig.ts`); ver [contrato del GLB](../build/contrato-del-glb.md).
8. **Sin tira, no pasa nada:** si falta la malla o sus UV, avisa una vez y se queda oscura (`INERT_SCREEN`). Al liberarse, devuelve el material del cargador.
9. **Con movimiento reducido** no hay brillo ni polvo (`screenPlayer.ts`). El deslizamiento sigue.

## Por qué

- Una sola máquina se decidió con el cliente al portar el laboratorio (§45). El motor de la torre ganó `flipY` y `setScroll` para ello.
- Resolución: la fachada guarda dos lienzos para el fundido, y la del laboratorio no cabía en el presupuesto de GPU medido en móvil (comentario de `resolution` en `createServicesCampus.ts`).
- Menos copias: con una copia más, la frase se pasaba de su paso, cada copia se metía en la siguiente y la última se envolvía sobre la primera (`0b894e1`).
- Sin `flipY`: la plantilla de UV dice que V va de abajo arriba, pero la exportación lo mide al revés, como en la torre. Con el giro, la palabra salía boca abajo (`attachCampusScreen.ts`).
- Que la frase esté en código y que el deslizamiento siga con movimiento reducido: sin porqué registrado.

## Qué se descartó

- La resolución del laboratorio.
- La palabra «SERVICIOS» sola (hasta `0c33d12`).
- Una copia más de la frase.
- Apretar la letra para que quepan más copias.

## Se ha roto si…

- Falla `landmark/towerScreen/mediaFacade.test.ts` («holds the picture still unless asked, and uploads unflipped, as the tower always has», «slides the picture by turns per second, and wraps rather than growing»).
- Falla `campusScreen/attachCampusScreen.test.ts` o `screens/screenPlayer.test.ts`.
- `npm run check:asset:contract` §5 no encuentra la tira o su canal UV.
- La frase se solapa consigo misma: solo el aviso en consola; sin test.

## Afecta a

`src/experiences/murcia/campus/campusScreen/attachCampusScreen.ts`, `src/experiences/murcia/campus/campusScreen/campusScreenContent.ts`, `src/experiences/murcia/campus/attachServicesCampus.ts` (`screenTuning`, `LED_PITCH_METRES`), `src/experiences/murcia/campus/createServicesCampus.ts`, `src/experiences/murcia/screens/screenPlayer.ts`, `src/experiences/murcia/landmark/towerScreen/mediaFacade.ts`, `src/experiences/murcia/landmark/towerScreen/facadeRenderer.ts`, `sanity-studio/schemas/district.ts` (descripción de `label`)
