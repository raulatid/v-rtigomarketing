# La cámara de Earth: una cadena de dueños, el rig de foco y el desplazamiento de la auditoría

**Estado:** vigente · **Desde:** 2026-08; vista general actual desde 2026-09-17 (`8846187`) · **Sustituye a:** DECISIONS §9 (cadena de Earth) y §26.15

## Decisión

1. **Un solo escritor de la pose por fotograma.**
   - Antes de `site`, `CameraController` fija la pose de reposo o vuela el warp de la intro.
   - Desde `site` deja de mover la cámara y solo escribe el overlay.
   - Desde `site`, `InteractionLayer` activa el rig de foco mientras Earth está activa y lo desactiva cuando se ve Murcia.
   - Durante un warp confirmado el rig no se actualiza (ver [trampas de transición](../../trampas/transicion.md)).
2. **El rig de foco (`createFocusCameraRig`) tiene un único mecanismo de suavizado:** un lerp exponencial de objetivo a actual.
   - El arrastre escribe solo el objetivo, como ángulos esféricos sin acotar que se suavizan como ángulos.
   - La elevación del arrastre se limita con `phiMin`/`phiMax`.
   - Modos: `overview`, `focusing`, `focused`.
   - No hay `OrbitControls`.
3. **`activate()` siempre parte de la pose general conocida, al radio del zoom actual**, nunca de la cámara viva. Por eso Earth vuelve a la vista general (ver [ciclo de vida](../transicion/ciclo-de-vida.md)).
4. **La vista general** es `overviewRestPosition()`, con radio `overviewRadiusForViewport` (uno para móvil y otro, más cercano, para escritorio) y ángulos `overviewThetaDegrees`/`overviewPhiDegrees`.
5. **Entrada:**
   - En táctil, la órbita empieza solo tras `touchDragThresholdPx`; ratón y lápiz no tienen umbral.
   - La tolerancia de tap depende del tipo de puntero.
   - Un segundo dedo es un pasajero que anula el tap.
6. **Primer plano de un satélite:**
   - La cámara se aparta por el radio según `closeUp`, escalado con el satélite.
   - El punto de mira se desplaza una fracción del semiancho de pantalla (`CLOSE_UP_OFFSET_FRACTION`), salvo en móvil.
   - Al volver a la vista general se toma el camino corto (`nearestEquivalentAngle`).
   - Seleccionar un satélite congela los seis y desactiva el arrastre de órbita.
7. **La sección de auditoría es un desplazamiento de proyección, no un movimiento de cámara.** `AuditCameraShift` solo usa `setViewOffset` y lo deshace con `clearViewOffset`. `auditView.open` tiene un único escritor (`shiftsFor()` en `src/app/auditView.ts`), y Earth lo lee como `AuditComposition` de solo lectura.

## Por qué

- Dos escritores por fotograma se pelean: por eso se quitó `OrbitControls`.
- Un lerp cartesiano gira hacia atrás cuando el suavizado se retrasa más de media vuelta.
- El desplazamiento de proyección mantiene el comportamiento del dueño de la cámara y se deshace exactamente.
- Un desplazamiento fijo en el mundo es un ángulo fijo, y en vertical sacaba al satélite del encuadre.

## Qué se descartó

`OrbitControls`, el lerp cartesiano de la órbita, sembrar `activate()` desde la cámara viva y un tercer escritor de la pose para la auditoría.

## Se ha roto si…

- `npm run check:earth` falla (§1–§7: invariantes del arrastre de órbita sobre el rig real).
- Fallan `closeUpFraming.test.ts`, `overviewPose.test.ts`, `focusRigViewport.test.ts` o `auditView.test.ts`.
- `AuditCameraShift` no tiene test.

## Afecta a

`src/experiences/earth/camera/CameraController.tsx`, `src/experiences/earth/camera/createFocusCameraRig.ts`, `src/experiences/earth/camera/overviewPose.ts`, `src/experiences/earth/camera/closeUpFraming.ts`, `src/experiences/earth/camera/AuditCameraShift.tsx`, `src/experiences/earth/interaction/InteractionLayer.tsx`, `src/experiences/earth/interaction/interactionConfig.ts`, `src/experiences/earth/interaction/createSatelliteFocus.ts`, `src/app/auditView.ts`, `src/interaction/auditComposition.ts`
