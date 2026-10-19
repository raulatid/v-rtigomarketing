# Modelo de entrada de la cámara de Murcia

**Estado:** vigente · **Desde:** 2026-09-10 (port de `vertigo-lab`, experimento `camera-navigation`); ganancias táctiles e inercia cerradas en 2026-10 · **Sustituye a:** DECISIONS §20, §21, §38, §39, §40 y §44 (modelo, signos, trackpad, ganancias)

## Decisión

1. **Un solo puntero mueve los dos ejes a la vez.** El movimiento horizontal gira, el vertical avanza o retrocede por el rumbo, y una diagonal hace ambas cosas. No hay clasificación de gestos ni vector de avance capturado al pulsar: el giro se aplica primero y el rumbo se recalcula con el valor recién escrito, por eso una diagonal dibuja una curva.
2. **El mundo sigue al dedo.** Arrastrar hacia abajo avanza (tiras del suelo hacia ti); arrastrar a la derecha gira la cámara a la izquierda. Las ganancias son positivas a propósito.
3. **El giro es una órbita alrededor del objetivo de navegación.** «El punto bajo el cursor se queda bajo el cursor» solo es cierto a la distancia del objetivo: lo que hay más allá sigue al dedo y lo que hay más cerca se mueve al revés. No es un bug.
4. **El deslizamiento horizontal del trackpad gira.** En Murcia, un evento de rueda con `deltaX` dominante gira exactamente como un arrastre horizontal y nunca llega a la banda de zoom. Es la única clasificación que existe: un trackpad nunca envía un eje puro.
5. **El dedo tiene su propia ganancia de giro** (`touchRotationGain`), separada por `pointerType === 'touch'` y no por proporción de pantalla, porque la proporción cambia si el móvil rota en mitad del gesto.
6. **El avance de un dedo continúa al levantarlo** (solo avance, no giro). Se cancela con una nueva pulsación, con cualquier escritor que coloque la cámara y con los límites. Un ratón no lanza.

Valores: `rotationGain`, `touchRotationGain`, `travelGain` y `touchInertia*` en `src/experiences/murcia/camera/cameraTuning.ts`. Los parámetros de depuración `?touchYaw=`, `?touchInertia=` y `?touchFlingMin=` sirven para probarlos en un dispositivo.

## Por qué

- El modelo con clasificación de gestos (§20) obligaba a elegir entre girar y avanzar; con un solo puntero el movimiento es continuo.
- El signo contrario (la cámara va hacia donde va el dedo) es coherente, se probó primero y se percibió como «navegación al revés».
- En móvil, normalizar el giro por el ancho hacía que un pulgar girase unas cuatro veces más por píxel que un ratón, y la deriva lateral de cada trazo torcía la trayectoria.
- Sin inercia, recorrer la ciudad con el dedo exigía muchos trazos cortos, cada uno con su deriva.

## Qué se descartó

- Clasificar arrastres por eje dominante (`if (|dx| > |dy|)`).
- La rotación con dos dedos: dos dedos solo significan pellizco (ver [banda de zoom y commit](../navegacion/banda-de-zoom-y-commit.md)).
- Atenuar el eje lateral en un trazo claramente vertical: sería una clasificación.

## Se ha roto si…

- `npm run check:navigation` falla (un puntero y dos ejes en §1, signos en §2, avance por el rumbo girado en §5, ganancia táctil separada en §11).
- Fallan los tests «the release throw» de `CameraRig.test.ts` o `createCameraInput.test.ts`.

## Afecta a

`src/experiences/murcia/camera/CameraRig.ts`, `src/experiences/murcia/camera/cameraTuning.ts`, `src/experiences/murcia/navigation/createCameraInput.ts`, `src/experiences/murcia/MurciaExperience.ts` (`lookBy`), `src/app/navigation/createNavigationInput.ts` (rama `deltaX` de `onWheel`), `checks/navigation-feel.ts`
