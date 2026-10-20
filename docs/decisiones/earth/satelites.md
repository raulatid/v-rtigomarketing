# Satélites: órbitas, modelo, tamaño, orientación e invitación

**Estado:** vigente · **Desde:** 2026-08; invitación y tamaño de escritorio desde 2026-09 · **Sustituye a:** DECISIONS §26.9 (parte del satélite), §26.10, §26.11 y §26.11a

## Decisión

1. **Seis órbitas fijas (`ORBIT_PRESETS`) en unidades de radio terrestre 1.** El grupo se monta escalado por `EARTH_CONFIG.radius`: la escala se concilia en el montaje, no en los datos.
2. **Qué caso va en qué órbita se deriva del contenido** (`orbitAssignments.ts`). Una asignación inválida es un fatal de `orbits:build`, a propósito. Studio limita los casos a seis.
3. **Modelo:**
   - La plantilla GLB se carga una vez; si falla, la promesa se limpia.
   - El mapa KTX2 horneado se aplica a la plantilla antes de clonar (ver [convenciones de render](convenciones-de-render.md)).
   - Si falla la textura queda un modelo sin textura.
4. **Tamaño:**
   - `modelSize` es el tamaño de móvil.
   - En pantallas anchas, `wideModelSize` se aplica como una sola escala de grupo (`satelliteAssemblyScale`), nunca como un segundo juego de constantes.
   - De `modelSize` dependen `baseSize`, `PANEL_HEIGHT`, `PANEL_OFFSET_Y`, `coneFootRadius`, `tutorial.cueRadius` y `closeUp.distance`/`lift`.
5. **La orientación del modelo nunca lee la cámara ni la selección.** Un `spinner` con semilla avanza solo con el delta. La zona de clic es una esfera invisible, no el modelo. El panel mira a cámara en el vertex shader.
6. **Hover:** un pequeño aumento de escala y el modelo brilla en el color del holograma. **Selección:** congela los seis, y al deseleccionar cada uno sigue desde donde se paró.
7. **Invitación y tutorial:** un satélite invitado «respira» y el tutorial lo pulsa cada pocos segundos hasta que se selecciona cualquier satélite. Solo se arma si está en pantalla. Con movimiento reducido es un único pulso más largo, sin partículas. Depuración: `?tutorial=1`.

Valores: `src/experiences/earth/orbit/orbitConfig.ts` y `satelliteScale.ts`.

## Por qué

- Los presets se mantienen comparables con el proyecto de origen.
- Las antiguas placas se reorientaban durante el vuelo, y hacer raycast sobre el GLB parpadeaba.
- Las constantes derivadas se hornean en la geometría y la construcción no se repite al redimensionar: una escala de grupo es lo único que sirve.

## Qué se descartó

Placas con `lookAt(camera)`, raycast sobre el modelo, un segundo juego de constantes para escritorio, reescribir los presets en unidades de radio 2 y que el hover retire el tutorial.

## Se ha roto si…

- Fallan `orbitConfig.test.ts` («keeps the panel clear of the satellite model at BOTH authored sizes», «makes the wide viewport smaller…»), `satelliteScale.test.ts`, `satelliteFocusExpansion.test.ts`, `satelliteVisibility.test.ts`, `resolveOrbitCases.test.ts` o `hoverTutorial.test.ts`.
- `e2e/degraded.spec.ts` («a blocked OPTIONAL asset still reaches ready») falla.

## Afecta a

`src/experiences/earth/orbit/` (`orbitConfig.ts`, `orbitAssignments.ts`, `createOrbitSystem.ts`, `createSatellite.ts`, `satelliteScale.ts`, `hoverTutorial.ts`, `satelliteVisibility.ts`, `OrbitSystemLayer.tsx`), `src/experiences/earth/interaction/createSatelliteFocus.ts`
