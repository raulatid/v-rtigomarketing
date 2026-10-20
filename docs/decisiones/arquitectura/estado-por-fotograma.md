# Estado por fotograma: objetos mutables con dueño y vistas de solo lectura

**Estado:** vigente · **Desde:** 2026-08-07 (`adc5c6e`, `SequenceState` mutable); canal de navegación de la aplicación y contratos en `interaction/` desde el 2026-09-15 (`e8852ea`) · **Sustituye a:** el mapa de propiedad de la cabecera de ARCHITECTURE (canal de navegación, `sequenceState`, `auditView`); ARCHITECTURE §14 en lo que tenía de propio del proyecto

## Decisión

1. **Lo que cambia por fotograma o por evento de entrada no pasa por estado de React.** Vive en objetos mutables que se crean una vez y nunca se sustituyen ni se copian por fotograma. React guarda solo lo discreto: la fase de la apertura, `activeExperience`.
2. **Cada objeto tiene un dueño que lo crea, y quien lo recibe por props recibe una vista de solo lectura** (`Readonly<…>` o `Pick<…>`):
   - **Canal de navegación:** lo crea la aplicación (`createNavigationState` en `src/app/navigation/continuousState.ts`, una vez en `App`). Los campos de la transición los escribe `useExperienceTransition`; `zoomDepth`, el `onZoom` de la entrada de navegación. `SceneCanvas`, Earth y Murcia reciben `NavigationView`. Qué significa cada campo y quién lo posee está en `src/interaction/navigationSignals.ts`.
   - **Secuencia de la intro:** `SequenceState` (`src/experiences/earth/config/sequenceState.ts`) es de Earth. `App` crea la instancia; la escriben la cola de la intro y `CameraController`, y `App` solo al reconciliar un salto o un replay (ver [máquina de apertura](../intro/maquina-de-apertura.md)).
   - **Composición de la auditoría:** `auditView` (`src/app/auditView.ts`) es de la aplicación, con un solo escritor de `open`; Earth lo lee como `AuditComposition` (ver [cámara de Earth](../earth/camara-de-earth.md)).
   - **Permiso de las pistas:** `App` escribe `hintAllowed` en un objeto por mundo, y cada experiencia lo combina con su propio estado.
3. **Los tipos de esos contratos viven en `src/interaction/`** (`navigationSignals.ts`, `auditComposition.ts`) y no crean estado. Así una experiencia lee un canal de la aplicación sin importar nada de `src/app/`, ni siquiera un tipo.

## Por qué

- Una rueda produce más de cien eventos por segundo. Reflejarlos en estado de React sería un render de los dos mundos y de toda la interfaz por evento (comentario de `zoomDepth` en `navigationSignals.ts`).
- `auditView.open` llegó a tener tres escritores que no estaban de acuerdo, y el desplazamiento de la cámara se quedaba puesto el resto de la sesión (comentario de `shiftsFor` en `auditView.ts`).
- Con los contratos en `interaction/`, la regla «las experiencias no importan `src/app/`» se puede afirmar entera (ver [capas y dependencias](capas-y-dependencias.md)).

## Qué se descartó

- Pasar valores por fotograma como props o estado de React.
- Que una experiencia importe el estado de la aplicación (`app/navigation/`), aunque sea solo para leerlo.

## Se ha roto si…

- `npm run check:architecture` falla en «neither experience imports the application layer», «interaction/ does not import the application» o «interaction/ does not import any experience».
- Fallan `auditView.test.ts`, `sequenceState.test.ts` o `useExperienceTransition.test.tsx`.
- Un valor por fotograma pasa a estado de React, o un objeto del canal se sustituye en lugar de mutarse: **sin test**.

## Afecta a

`src/app/navigation/continuousState.ts`, `src/interaction/navigationSignals.ts`, `src/interaction/auditComposition.ts`, `src/app/auditView.ts`, `src/experiences/earth/config/sequenceState.ts`, `src/app/useExperienceTransition.ts`, `src/App.tsx`, `src/components/SceneCanvas.tsx`, `src/components/AuditSection.tsx`, `src/experiences/earth/EarthExperience.tsx`, `src/experiences/murcia/MurciaLayer.tsx`
