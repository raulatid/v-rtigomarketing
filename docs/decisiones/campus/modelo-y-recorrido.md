# El campus es la sección de servicios, y se recorre en anillo

**Estado:** vigente · **Desde:** 2026-09-11 (`a7b4a3e`, `c856f84`), decidido con el cliente al portar el laboratorio; sin «[+]» desde el mismo día (`c050313`); los edificios son objetivo desde el 2026-09-15 (`ecc5418`); flechas de paso en la placa desde el 2026-09-17 (`afc0bf1`) · **Sustituye a:** DECISIONS §45 (en parte: el modelo, «Replace, not add», «A press during a flight is ignored» y las cuestiones abiertas); las filas de «Superseded» «The services district is a projected in-world display…» (§34), «The services district is engaged through a building, and a floating card shows that service» (§32) y «"Servicios" is one district, picked as a cluster…» (§20)

## Decisión

1. **La sección de servicios es el campus** que trae el GLB de la ciudad: un edificio, su parque y un lago (nodos en `campusConfig.ts`). `MurciaExperience` solo guarda un objeto, el de `createServicesCampus.ts`. La pantalla proyectada del distrito (§34) se borró entera; no queda como alternativa conmutable.
2. **Tres estados** (`section/campusState.ts`): vista general, intro y un servicio. Las paradas forman un anillo: la intro y una por servicio, en el orden de la sección en Sanity. El anillo no tiene fin en ningún sentido: `position` cuenta pasos y no se envuelve.
3. **Se entra solo desde la vista general, y solo si nadie más tiene la cámara** (`enter()` devuelve `false` si no):
   - con un tap en el lago o en un edificio del campus (`CAMPUS_BUILDING_NODE_NAMES`). Del agua solo cuenta lo que queda a `LAKE_REACH` del centro del lago, porque el mismo nodo lleva las piscinas de la entrada (`campusInteraction.ts`). Las tolerancias de tap están en [picking por coordenadas](../interfaz/picking-por-coordenadas.md);
   - con el atajo Servicios de la cabecera (ver [Blog y Servicios](../interfaz/atajos-blog-y-servicios.md));
   - con el botón de teclado de `district/ui/districtA11y.ts`.

   El hover sobre el lago o un edificio ilumina los edificios y pide el cursor de mano, solo en la vista general y nunca en táctil. El punto de interés de Servicios entra igual: [edificios interactivos](../murcia/edificios-interactivos.md). Con la sección abierta, los puntos se ocultan.
4. **Dentro se avanza:**
   - con un arrastre horizontal, un paso por gesto (`SWIPE_COMMIT_PX`): hacia la izquierda, el siguiente, como un carrusel. Un arrastre más vertical que horizontal no cuenta;
   - con ← y → del teclado, y con las dos flechas de la placa;
   - nunca mientras vuela la cámara o dura el morph del paso (`settled()` en `attachServicesCampus.ts`). La pulsación se ignora; no detiene el vuelo. El giro del símbolo a la figura no bloquea el paso.
5. **Se sale a la vista general desde cualquier parada:** la flecha de vuelta de la placa, Escape, el botón «volver» del teclado o un pellizco hacia dentro (`releaseFocusedDistrict`, que la navegación ofrece como `releaseFocus`). El pellizco sale de la sección, no de Murcia. Salir no espera a que termine un vuelo. Hay un solo nivel: el «[+]» que abría el detalle se quitó con su acercamiento de cámara.
6. **Con la sección abierta** (`isEngaged`, que es `hasFocusedDistrict`), la navegación entre mundos se retira y el logo no vuelve a casa (`isCityOverview`). Con Murcia congelada (Earth en pantalla, aproximación del blog), el campus no escucha (`setEnabled`).
7. **Teclado y lector de pantalla:** `districtA11y.ts` ofrece entrar, anterior, siguiente y volver con el patrón recortado de `.nav-control`, y una región viva que anuncia la etiqueta de la sección con el número de parada, el título y el subtítulo. La descripción no se anuncia.
8. **Si algo falla, el campus se queda como escenario** y lo dice una vez en la consola: sin nodos, sin documento válido, sin símbolos rasterizados o si el montaje lanza (`createServicesCampus.ts`). La ciudad sigue funcionando.

## Por qué

- Sustituir y no añadir lo decidió el cliente al portar el laboratorio (§45).
- La pulsación durante un vuelo se ignora porque los vuelos del campus no se pueden cancelar a medio camino, y son cortos (`campusInteraction.ts`). Invierte a propósito lo que hacía la pantalla de §34.
- La flecha visible existe porque un móvil no tiene Escape (§45, `campusOverlay.ts`).
- Los edificios son objetivo porque lo que se ilumina es lo que responde al tap (`campusInteraction.ts`).
- El pellizco: en un móvil, el gesto que significa «fuera» tiene que seguir significándolo sin apuntar a un botón (`App.tsx`, `e2e/mobile.spec.ts`).
- Una ciudad cuyos servicios no abren es una ciudad más quieta, no una ciudad rota (`createServicesCampus.ts`).
- El «[+]» se quitó al poner todo el texto junto a las partículas (`c050313`); el commit no da otro motivo.

## Qué se descartó

- La pantalla proyectada dueña de todos los controles (§34); antes, un edificio por servicio con una tarjeta flotante (§32), y antes aún, un distrito único con un acordeón (§20).
- Que una pulsación durante el vuelo lo detenga.
- El «[+]», su nivel de detalle y su acercamiento de cámara.
- El lago como único objetivo (cuestión abierta de §45): hoy también entran los edificios, el atajo y el teclado.

## Se ha roto si…

- Falla `campusInteraction.test.ts`: «enters on a tap on the lake», «does not enter from a pool the water node also holds», «steps once per horizontal swipe, left for the next service», «pages with the arrow keys and goes back one level with Escape», el bloque «the buildings» o «do not light inside the section».
- Falla `section/campusState.test.ts` («walks round the ring and comes back to the intro one lap on», «walks backwards past the intro onto the last service»).
- Falla `district/ui/districtA11y.test.ts`.
- Falla `src/app/navigation/pinchInput.test.ts` («releases on a close in Murcia, once, and navigates nothing»).
- Solo si se pide e2e: `e2e/mobile.spec.ts` («a finger opens the services section, closes it, and opens it again», «a touch user can leave the services section two ways…») y `e2e/navigation.spec.ts` («city logo returns to Earth at viewport width…», que entra por el control accesible y sale con Escape).
- Que el paso espere al vuelo y que salir no espere: sin test.

## Afecta a

`src/experiences/murcia/campus/createServicesCampus.ts`, `src/experiences/murcia/campus/attachServicesCampus.ts`, `src/experiences/murcia/campus/campusInteraction.ts`, `src/experiences/murcia/campus/section/campusState.ts`, `src/experiences/murcia/campus/campusConfig.ts`, `src/experiences/murcia/campus/gatherCampus.ts`, `src/experiences/murcia/district/ui/districtA11y.ts`, `src/experiences/murcia/MurciaExperience.ts` (`setupCampus`, `hasFocusedDistrict`, `releaseFocusedDistrict`, `isCityOverview`), `src/App.tsx` (`releaseFocus`), `src/app/navigation/createNavigationInput.ts`
