# El picking 3D se resuelve con las coordenadas del propio evento

**Estado:** vigente · **Desde:** 2026-08-11 (`10a68b4`, DECISIONS §17); tolerancia táctil en Murcia desde el 2026-08-14 (DECISIONS §25); el satélite se pica solo contra su esfera desde el 2026-09-16 (`f27f393`); el lápiz con la tolerancia del dedo desde el 2026-10-20; los casos tienen camino de teclado y de lector desde el 2026-11-23 (auditoría de accesibilidad del 2026-11-18, T1 y T2) · **Sustituye a:** DECISIONS §17; de DECISIONS §25, el primer punto y «Still capability detection»; las filas «A click acts on the satellite the pointer is hovering» y «Tap tolerance is per pointer type *on Earth*» de «Superseded»

## Decisión

1. **Todo raycast que decide una acción recibe `clientX, clientY` y devuelve una respuesta.** Ningún manejador actúa sobre un hover de un fotograma anterior:
   - Earth: `pickAt` en `createSatelliteFocus.ts`, e `isOverSatellite`, definido en `InteractionLayer.tsx` sobre `pickAt` e inyectado en el rig (`createFocusCameraRig.ts`), para distinguir clic en vacío de clic en satélite;
   - Murcia: `targetAt` en `campusInteraction.ts` y `overTarget` en `panelPointer.ts`.
2. **El hover es otra cosa y solo existe con ratón.** Se resuelve una vez por fotograma desde el último `pointermove` (en Earth porque los satélites se mueven aunque el puntero esté quieto). Nada actúa sobre él.
3. **Las tolerancias de tap dependen del tipo de puntero, y son dos números:**
   - Earth: `dragClickThreshold` y `touchDragClickThreshold` en `INTERACTION_CONFIG.camera` (`interactionConfig.ts`); ver también [cámara de Earth](../earth/camara-de-earth.md), punto 5;
   - Murcia: `navigation.dragThresholdPx` y `touchDragThresholdPx` en `murciaConfig.ts`, que llegan como `tapThresholdPx` al campus y a la pantalla del blog. Son solo de tap (ver [trampas de la cámara de Murcia](../../trampas/murcia-camara.md), n.º 26).

   Solo el ratón usa la tolerancia corta; el dedo y el lápiz usan la táctil (`pointerType !== 'mouse'`). Un dedo o un lápiz se resuelven donde aterrizaron. En la pantalla del blog, los dos extremos del gesto deben caer sobre el objetivo.
4. **El tipo de entrada se decide por capacidad, nunca por dispositivo:** `pointerType`, `(hover: none)` y `(pointer: coarse)`/`(pointer: fine)`. Nada se revela solo con hover sin una respuesta táctil equivalente: el tutorial de [satélites](../earth/satelites.md) y los puntos de [edificios interactivos](../murcia/edificios-interactivos.md), siempre visibles y con su nombre en cada llegada.
5. **El raycast vive dentro de cada experiencia,** contra una lista explícita de objetivos (en Earth, la esfera invisible `hitTarget` de cada satélite, no el modelo). La conversión a NDC es compartida: `clientToNdc` en `src/interaction/screenSpace.ts`, con el rectángulo del canvas.
6. **Lo que se pica también se alcanza sin puntero.** Un raycast no se puede tabular ni leer en voz alta, así que cada objetivo que abre contenido tiene un control DOM que llega a la misma acción:
   - Earth: `CaseList.tsx`, un grupo «Casos de éxito» con un botón por caso en órbita, con el nombre de la marca. Llama a `InteractionHandle.select(id)`, que es `selectById` en `createSatelliteFocus.ts`: la misma `select` del clic, rechazada en los mismos casos (capa desactivada, satélite oculto o aún entrando). Los casos llegan por el handle y no por un import, porque el contenido vive en el chunk de la escena (`orbitConfig.ts`, «NO CONTENT RE-EXPORT HERE»);
   - Murcia: `districtA11y.ts` para el campus.

   Los botones siguen el patrón de `.nav-control`: recortados a un píxel y visibles con `:focus-visible`. No hay una segunda interfaz visible.
7. **El panel del caso es un landmark con nombre y gestiona el foco** (`CasePanel.tsx`): `aria-labelledby` apunta a su título; al abrir (y al cambiar de caso) el foco va al título; al cerrar vuelve al control de origen: el botón del caso en la lista si el caso se abrió desde él (o se cambió a él desde él). Un caso abierto con un clic en su satélite no tiene control detrás, y el foco solo sale del panel. Desde el 2026-11-26: devolverlo siempre a la lista ponía un foco que el usuario no había puesto, y tras un Escape el navegador lo pintaba como `:focus-visible`, así que aparecía un botón junto al satélite. En ningún caso se toca el foco si otra superficie se lo ha llevado al salir (la auditoría que abre su propio enlace).

## Por qué

- Un tap dispara `pointerdown → pointerup → click` **sin `pointermove`**: un hover calculado en `pointermove` no existe en táctil, y todo lo que lo consultaba no hacía nada sin dar error. Hasta el 2026-08-11 el sitio solo funcionaba con ratón.
- Un dedo se desvía bastante más que un ratón; con la tolerancia del ratón, la mayoría de los taps se leían como arrastres. Un único número está mal para una de las dos clases de entrada.
- Con ratón, las coordenadas del clic y las del hover son el mismo punto: el cambio no altera nada en escritorio.
- Los casos son el contenido central del sitio. Sin un camino que no sea el puntero no los abría ni el teclado ni un lector de pantalla (que en táctil activa el centro del elemento, no un satélite), y el lector ni sabía que existían (WCAG 2.1.1, 1.1.1 y 4.1.2). La decisión de opción C (WCAG 2.2 AA completo) revierte la de no tenerlo.

## Qué se descartó

- Sintetizar un `pointermove` antes del tap: inventa un hover y deja un satélite iluminado tras levantar el dedo.
- Bajar el umbral del ratón para que sirva al dedo.
- Adoptar el gestor de eventos de R3F: obligaba a reescribir todo el picking.
- Raycast contra el modelo del satélite: parpadea.
- Hasta el 2026-11-23: **sin acceso por teclado a los satélites**, como decisión y no como deuda. Lo revierte el punto 6.
- Navegar entre satélites con las flechas sobre el canvas: obliga a dar foco al canvas, a inventar un orden espacial que cambia mientras orbitan y a enseñar las teclas. Una lista de botones no necesita nada de eso.
- Una lista visible de casos: cambia la escena. Los botones solo se ven con el foco del teclado.

## Se ha roto si…

- En un móvil nada responde y nada da error.
- Fallan en Murcia `campusInteraction.test.ts` («enters on a tap on the lake», «measures a finger against the touch threshold, where it landed», «measures a pen like a finger», «still enters after a release that landed off the canvas») o `panelPointer.test.ts` («allows a finger more slop than a mouse», «needs BOTH ends of the gesture on the core», «resolves hover once a frame, not once an event»).
- Falla `npm run check:earth` §7 (un segundo dedo nunca es un tap) o §8 (el dedo y el lápiz se miden con `touchDragClickThreshold`). **Ningún test comprueba en Earth que un tap táctil seleccione un satélite.**
- Falla `src/interaction/screenSpace.test.ts`.
- Tab en la Tierra no llega a ningún caso, o Enter en uno no abre su panel. Fijan: `CaseList.test.tsx` y `satelliteFocusExpansion.test.ts` («selecting a satellite by id»).
- Al abrir un caso el foco no va a su título; al cerrar uno abierto desde la lista el foco cae a `<body>`; al cerrar uno abierto con el ratón (también con Escape) aparece un botón de la lista; o el foco se queda en el panel oculto. Fija: `CasePanel.test.tsx` («the case panel and the focus»).

## Afecta a

`src/experiences/earth/interaction/createSatelliteFocus.ts`, `src/experiences/earth/interaction/InteractionLayer.tsx`, `src/experiences/earth/interaction/interactionConfig.ts`, `src/experiences/earth/camera/createFocusCameraRig.ts`, `src/experiences/earth/orbit/createSatellite.ts`, `src/experiences/murcia/campus/campusInteraction.ts`, `src/experiences/murcia/blogDisplay/panelPointer.ts`, `src/experiences/murcia/config/murciaConfig.ts`, `src/experiences/murcia/MurciaExperience.ts`, `src/interaction/screenSpace.ts`, `src/components/CaseList.tsx`, `src/components/CasePanel.tsx`, `src/App.tsx`
