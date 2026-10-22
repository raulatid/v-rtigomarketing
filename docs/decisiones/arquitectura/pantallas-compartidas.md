# Las dos pantallas de Murcia comparten reproductor; cada adaptador pone su política

**Estado:** vigente · **Desde:** 2026-09-15 (`c5f0021`); listas de reproducción desde el 2026-10-22 (plan 027) · **Sustituye a:** ARCHITECTURE §15, «Shared response and screen lifetimes», punto de las pantallas

## Decisión

1. **`src/experiences/murcia/screens/screenPlayer.ts` es dueño de la reproducción y de la vida de los recursos:** crea las composiciones, el carrusel y la fachada; `ready` se resuelve cuando están las imágenes de la primera diapositiva; `dispose()` lo libera todo una sola vez. Sin composiciones devuelve `INERT_SCREEN` y no crea fachada.
2. **`screens/screenMesh.ts` es dueño de encontrar la malla y elegir su juego de UV** (`findScreen`, `selectScreenUv`).
3. **Cada adaptador conserva su política:** la torre (`landmark/towerScreen/attachTowerScreen.ts`) y el campus (`campus/campusScreen/attachCampusScreen.ts`) deciden sus valores por defecto, la paleta, el límite del tamaño de textura y si devuelven el material original al liberar.
4. **Los adaptadores no se importan entre sí;** los dos usan `screens/`. El motor de dibujo (`carousel`, `facadeRenderer`, `mediaFacade`) sigue en `landmark/towerScreen/`.
5. **Ninguno carga modelos ni tiene bucle propio:** quien lo monta llama a `update(dt)` con su delta y a `dispose()` con el resto de su mundo.
6. **El motor de la torre no importa contenido generado:** recibe el documento (ver [pantalla de la torre](../contenido/pantalla-de-la-torre.md)).
7. **Un reproductor cambia de lista, no de documento.** Las composiciones se construyen todas al crear el reproductor; `setPlaylist(ids)` decide cuáles rotan desde ese momento, empezando por la primera (el carrusel ignora la misma lista repetida y el reproductor, los ids que no tiene). La torre lleva así la diapositiva de la [sección Conócenos](../murcia/seccion-conocenos.md): `MurciaExperience` le pasa las suyas y la de Conócenos en un solo documento, rota las suyas y cambia de lista al entrar y salir de la sección (la de Conócenos es de una, y no rota). Construir una composición no descarga nada: sus imágenes se piden la primera vez que se muestra.

## Por qué

El adaptador del campus era una copia del de la torre: repetía la creación de composiciones, el carrusel, el estado inerte y la búsqueda de la malla, e importaba utilidades de UV del adaptador de la torre (`c5f0021`). Lo que de verdad comparten es la reproducción y la vida de los recursos; lo que difiere es la política de cada pantalla.

## Qué se descartó

- Que el campus importe el adaptador de la torre.
- Mover el motor de dibujo fuera de `landmark/towerScreen/` en el mismo cambio.
- Construir las composiciones de Conócenos al entrar y ponerlas con `facade.setComposition`: un parón detrás del vuelo, y el carrusel no podría rotarlas.

## Se ha roto si…

- `npm run check:architecture` falla en «campus screens do not import the tower adapter» o «the tower screen does not import generated content».
- Falla `screenPlayer.test.ts` («shared screen lifetime»: liberación única, `ready` tras liberar, documento vacío, movimiento reducido, cambio de lista) o `carousel.test.ts` («swaps to a new playlist…»).
- Fallan `attachTowerScreen.test.ts` o `attachCampusScreen.test.ts`.

## Afecta a

`src/experiences/murcia/screens/screenPlayer.ts`, `src/experiences/murcia/screens/screenMesh.ts`, `src/experiences/murcia/landmark/towerScreen/carousel.ts`, `src/experiences/murcia/landmark/towerScreen/attachTowerScreen.ts`, `src/experiences/murcia/campus/campusScreen/attachCampusScreen.ts`, `checks/architecture.ts`
