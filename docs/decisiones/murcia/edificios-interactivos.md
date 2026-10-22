# Edificios interactivos: tinte y puntos de interés

**Estado:** vigente · **Desde:** 2026-09-24, por indicación del cliente; parpadeo y geotags sustituidos por los puntos de interés el 2026-10-21 (`5201df9`); Anuncios retirado el mismo día; Conócenos con destino desde el 2026-10-22 (plan 027) · **Sustituye a:** DECISIONS §44 (enmiendas del 2026-09-22 y 2026-09-24)

## Decisión

1. **El hover tiñe el lugar con el azul de marca**, con la misma subida y bajada que los satélites (`buildingHighlight.ts`). El color se mezcla en `outgoingLight` (mezcla, no suma): sin luz nueva ni bloom. Lo tienen el campus de servicios, el conjunto del blog y la base de la torre Vértigo.
2. **Tres puntos de interés marcan lo que responde a un clic:** Blog, Servicios y Conócenos (la base de la torre) (`pointsOfInterest/poiConfig.ts`).
   - Son DOM en `.murcia-ui`, proyectados cada fotograma después de quien movió la cámara. Por eso quedan siempre encima y con tamaño constante en pantalla (`poiMarkers.ts`).
   - Un punto azul de marca (`--accent`) con un anillo que late cada 2 s. Con movimiento reducido, el anillo se queda quieto.
   - Se ven solo en la vista general: ninguna cinemática, vuelo ni sección tiene la cámara.
3. **El nombre sale en una etiqueta de vidrio ahumado, densidad A**, en tres casos:
   - durante 5 s en cada llegada a la ciudad (desde Earth o de vuelta del blog), los tres en cascada;
   - con el ratón sobre el punto;
   - con el ratón sobre el propio lugar.

   En táctil solo aparece en la llegada.
4. **Los puntos no reciben eventos** (`pointer-events: none`). El picking es por distancia en pantalla, dentro del listener del canvas `PoiInteraction` (`poiInteraction.ts`), que funciona como `CampusInteraction`: ledger de pulsación por tipo de puntero y hover resuelto una vez por fotograma.
   - Un tap en Blog, Servicios o Conócenos entra por la vía de ese lugar (`flyToBlog`, `campus.enter`, `about.enter`). Esa vía rechaza una cámara ocupada, así que el tap arranca un solo vuelo aunque lo oigan dos listeners.
5. **Conócenos lleva a su sección** ([sección Conócenos](seccion-conocenos.md)): con el hover se tiñe la malla inferior de `ARCH_Glass_Lobby`, sale la etiqueta y el cursor es la mano, sobre el punto y sobre la base. Un tap en cualquiera de los dos entra (`about.enter`). Sin documento de Conócenos en Sanity, el punto no es pulsable (`clickable` en `poiInteraction.ts`) y la base se tiñe pero no lleva a ninguna parte.

Valores: `BUILDING_HIGHLIGHT` en `src/experiences/murcia/interaction/buildingHighlight.ts`; `POI` en `pointsOfInterest/poiConfig.ts`. El color se repite a mano en el shader porque un shader no puede leer una variable CSS: si cambia `--accent`, cambia también aquí.

## Por qué

- Los visitantes seguían sin saber qué edificios se podían tocar. El hover solo le habla a un puntero que ya está encima.
- El parpadeo y los geotags se leían como decoración. Un punto siempre visible dice «este» sin que haya que buscarlo.
- En DOM, «siempre encima», tamaño constante, tipografía del sitio y vidrio ahumado salen gratis. Con mallas habría que construirlos.

## Qué se descartó

- El parpadeo periódico de los edificios y los geotags 3D que lo seguían (2026-09-22 a 2026-10-21).
- Puntos con eventos de puntero propios: interceptarían los taps que el canvas y los e2e necesitan.
- Teñir la torre entera para Conócenos: la única pieza que es solo base es el vidrio del lobby.
- Un cuarto punto, Anuncios, en la pantalla LED de la torre, con un vuelo de cámara delante de ella (2026-10-21, `5201df9` y `8057303`). Se retiró el mismo día, con su tinte y su reclamación de cámara `'tower'`: la pantalla vuelve a ser solo escenario.

## Se ha roto si…

- Fallan `pointsOfInterest/poiMarkers.test.ts`, `pointsOfInterest/poiInteraction.test.ts`, `landmark/towerTargets.test.ts` o `interaction/buildingHighlight.test.ts`.
- Un punto tapa o desplaza a otro elemento de la escena, o una etiqueta no se lee sobre la ciudad. Solo visual.

## Afecta a

`src/experiences/murcia/interaction/buildingHighlight.ts`, `src/experiences/murcia/pointsOfInterest/`, `src/experiences/murcia/about/createAboutSection.ts` (`enter`), `src/experiences/murcia/landmark/towerTargets.ts`, `src/experiences/murcia/landmark/vertigoBuildingConfig.ts` (`baseNodeName`), `src/experiences/murcia/campus/createServicesCampus.ts` y `src/experiences/murcia/blogDisplay/createBlogDisplayEntry.ts` (`hovered`), `src/experiences/murcia/MurciaExperience.ts`, `src/experiences/murcia/styles/murcia.css` (`.murcia-poi`)
