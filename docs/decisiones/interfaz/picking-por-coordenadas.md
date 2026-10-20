# El picking 3D se resuelve con las coordenadas del propio evento

**Estado:** vigente · **Desde:** 2026-08-11 (`10a68b4`, DECISIONS §17); tolerancia táctil en Murcia desde el 2026-08-14 (DECISIONS §25); el satélite se pica solo contra su esfera desde el 2026-09-16 (`f27f393`) · **Sustituye a:** DECISIONS §17; de DECISIONS §25, el primer punto y «Still capability detection»; las filas «A click acts on the satellite the pointer is hovering» y «Tap tolerance is per pointer type *on Earth*» de «Superseded»

## Decisión

1. **Todo raycast que decide una acción recibe `clientX, clientY` y devuelve una respuesta.** Ningún manejador actúa sobre un hover de un fotograma anterior:
   - Earth: `pickAt` en `createSatelliteFocus.ts`, e `isOverSatellite`, definido en `InteractionLayer.tsx` sobre `pickAt` e inyectado en el rig (`createFocusCameraRig.ts`), para distinguir clic en vacío de clic en satélite;
   - Murcia: `targetAt` en `campusInteraction.ts` y `overTarget` en `panelPointer.ts`.
2. **El hover es otra cosa y solo existe con ratón.** Se resuelve una vez por fotograma desde el último `pointermove` (en Earth porque los satélites se mueven aunque el puntero esté quieto). Nada actúa sobre él.
3. **Las tolerancias de tap dependen del tipo de puntero, y son dos números:**
   - Earth: `dragClickThreshold` y `touchDragClickThreshold` en `INTERACTION_CONFIG.camera` (`interactionConfig.ts`); ver también [cámara de Earth](../earth/camara-de-earth.md), punto 5;
   - Murcia: `navigation.dragThresholdPx` y `touchDragThresholdPx` en `murciaConfig.ts`, que llegan como `tapThresholdPx` al campus y a la pantalla del blog. Son solo de tap (ver [trampas de la cámara de Murcia](../../trampas/murcia-camara.md), n.º 26).

   Un dedo se resuelve donde aterrizó. En la pantalla del blog, los dos extremos del gesto deben caer sobre el objetivo.
4. **El tipo de entrada se decide por capacidad, nunca por dispositivo:** `pointerType`, `(hover: none)` y `(pointer: coarse)`/`(pointer: fine)`. Nada se revela solo con hover sin una respuesta táctil equivalente: el tutorial de [satélites](../earth/satelites.md) y el parpadeo de [edificios interactivos](../murcia/edificios-interactivos.md).
5. **El raycast vive dentro de cada experiencia,** contra una lista explícita de objetivos (en Earth, la esfera invisible `hitTarget` de cada satélite, no el modelo). La conversión a NDC es compartida: `clientToNdc` en `src/interaction/screenSpace.ts`, con el rectángulo del canvas.

## Por qué

- Un tap dispara `pointerdown → pointerup → click` **sin `pointermove`**: un hover calculado en `pointermove` no existe en táctil, y todo lo que lo consultaba no hacía nada sin dar error. Hasta el 2026-08-11 el sitio solo funcionaba con ratón.
- Un dedo se desvía bastante más que un ratón; con la tolerancia del ratón, la mayoría de los taps se leían como arrastres. Un único número está mal para una de las dos clases de entrada.
- Con ratón, las coordenadas del clic y las del hover son el mismo punto: el cambio no altera nada en escritorio.

## Qué se descartó

- Sintetizar un `pointermove` antes del tap: inventa un hover y deja un satélite iluminado tras levantar el dedo.
- Bajar el umbral del ratón para que sirva al dedo.
- Adoptar el gestor de eventos de R3F: obligaba a reescribir todo el picking.
- Raycast contra el modelo del satélite: parpadea.
- **Acceso por teclado a los satélites:** no existe ni se ha planteado; es una decisión tomada, no deuda. El campus de Murcia sí tiene su superficie de teclado (`districtA11y.ts`).

## Se ha roto si…

- En un móvil nada responde y nada da error.
- Fallan en Murcia `campusInteraction.test.ts` («enters on a tap on the lake», «measures a finger against the touch threshold, where it landed», «still enters after a release that landed off the canvas») o `panelPointer.test.ts` («allows a finger more slop than a mouse», «needs BOTH ends of the gesture on the core», «resolves hover once a frame, not once an event»).
- Falla `npm run check:earth` §7 (un segundo dedo nunca es un tap). **Ningún test comprueba en Earth que un tap táctil use `touchDragClickThreshold` ni que seleccione un satélite.**
- Falla `src/interaction/screenSpace.test.ts`.

## Afecta a

`src/experiences/earth/interaction/createSatelliteFocus.ts`, `src/experiences/earth/interaction/InteractionLayer.tsx`, `src/experiences/earth/interaction/interactionConfig.ts`, `src/experiences/earth/camera/createFocusCameraRig.ts`, `src/experiences/earth/orbit/createSatellite.ts`, `src/experiences/murcia/campus/campusInteraction.ts`, `src/experiences/murcia/blogDisplay/panelPointer.ts`, `src/experiences/murcia/config/murciaConfig.ts`, `src/experiences/murcia/MurciaExperience.ts`, `src/interaction/screenSpace.ts`
