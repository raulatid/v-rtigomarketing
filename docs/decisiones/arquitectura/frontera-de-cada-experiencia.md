# Cada experiencia es una frontera que la aplicación monta

**Estado:** vigente · **Desde:** 2026-08-07 (`ebf6b47`, Murcia como clase dentro de R3F); Earth con una sola frontera desde el 2026-08-14 (`ebb92b3`); el adaptador de Murcia dentro de su experiencia desde el 2026-09-15 (`e8852ea`) · **Sustituye a:** ARCHITECTURE §4, §5, §6, §7 y §13; la línea de los adaptadores del mapa de propiedad de la cabecera

## Decisión

1. **La aplicación orquesta y ninguna experiencia decide sobre la otra.** `App` (`src/App.tsx`) es dueña del mundo activo, de la transición (`useExperienceTransition`), de la navegación entre mundos y de la interfaz DOM. No hay un `ExperienceController`: ese papel es de `App`. Las fases de la apertura son de la [máquina de apertura](../intro/maquina-de-apertura.md); qué se monta y qué se congela, del [ciclo de vida](../transicion/ciclo-de-vida.md).
2. **`SceneCanvas` monta una pieza por experiencia:** `EarthExperience` (`src/experiences/earth/EarthExperience.tsx`) y `MurciaLayer` (`src/experiences/murcia/MurciaLayer.tsx`). El logo de esquina (`corner-logo/CornerLogoLayer.tsx`) es interfaz de la aplicación, no de un mundo. Las capas de cada mundo, su orden y las refs entre ellas son de la experiencia.
3. **Las dos experiencias cumplen su ciclo de vida de forma distinta, a propósito:**
   - Earth es un árbol de R3F. Montarlo es renderizarlo; pausarlo es la prop `active`, con la que cada capa corta su propio trabajo por fotograma.
   - Murcia es una clase (`MurciaExperience`: `load`, `setActive`, `dispose`), y `MurciaLayer` es su adaptador a R3F: la construye cuando el planificador lo admite, le pasa el tamaño y la avanza desde `useFrame`.
4. **Qué cruza la frontera:**
   - hacia dentro, props: `active`, canales de solo lectura (ver [estado por fotograma](estado-por-fotograma.md)) y funciones de la aplicación (`scheduleWork`);
   - hacia fuera, callbacks de intención (`onSelectCase`, `onReady`, `onOpenBlog`, `onBlogApproachStart`, `onViewpointReached`). La experiencia no sabe qué hace la aplicación con ellos: Murcia no sabe que existe un blog;
   - además, la aplicación llama a Murcia por un ref (`murciaRef`: `lookBy`, `releaseFocusedDistrict`, `isCityOverview`…) y a Earth por los handles que publica (`orbitSystemRef`, `interactionRef`).
5. **Cada experiencia mueve su cámara y atiende su entrada.** La transición solo publica progreso (ver [warp](../transicion/warp.md)). Inactiva, una experiencia no acepta entrada: Murcia mantiene la reclamación `'inactive'` sobre su rig; las capas de Earth la ignoran por `active`.
6. **La regla es de dirección, no de profundidad.** `App` importa piezas internas de Earth para orquestar la apertura (`introConfig`, `sequenceState`, `useMasterTimeline`, `orbitConfig`). `check:architecture` solo vigila que las experiencias no suban hacia la aplicación.

## Por qué

- Murcia viene de un prototipo que tenía su propio renderer y su bucle; Earth está hecha de componentes de R3F. Envolver Earth en una clase para que se pareciera a Murcia sería un módulo que solo reenvía un booleano que React ya entrega: todas sus capas ya cortaban su trabajo con `active` (comprobado capa a capa en `ebb92b3`).
- Lo que le faltaba a Earth era una frontera: `SceneCanvas` montaba sus ocho capas en orden, con sus props, y guardaba dos refs que solo usaba Earth. La aplicación conocía su composición interna.
- Navegar entre los mundos es lo único que conoce a ambos (motivo de la regla en `checks/architecture.ts`); por eso la intención sale por callbacks y la decide `App`.

## Qué se descartó

- Una interfaz común `Experience` (`mount`/`start`/`pause`/`resume`/`destroy`) y un `ExperienceController`.
- `activate()`/`deactivate()` para Earth, como anticipaba el registro de la migración.
- Que `SceneCanvas` monte las capas de Earth una a una.

## Se ha roto si…

- `npm run check:architecture` falla en «earth does not import murcia», «murcia does not import earth», «neither experience imports the application layer», «no experience imports the blog» o «corner-logo/ does not import any experience».
- Fallan los tests del [ciclo de vida](../transicion/ciclo-de-vida.md) (reclamaciones de `CameraRig.test.ts`, `check:campus` §6b).
- Una capa de Earth sigue trabajando con `active` en falso: **sin test**.

## Afecta a

`src/App.tsx`, `src/components/SceneCanvas.tsx`, `src/experiences/earth/EarthExperience.tsx`, `src/experiences/murcia/MurciaLayer.tsx`, `src/experiences/murcia/MurciaExperience.ts`, `src/corner-logo/CornerLogoLayer.tsx`, `src/app/useExperienceTransition.ts`
