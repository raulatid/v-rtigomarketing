# La pantalla de la torre se edita en Sanity con una plantilla fija

**Estado:** vigente · **Desde:** 2026-09-22 (`90361a6`) · **Sustituye a:** DECISIONS §55; el «banner editorial» de §36, retirado el 2026-09-15 (`1ad78f5`)

## Decisión

1. **Un singleton `towerScreen`** en Sanity, por el mismo pipeline que el resto: validado en `content/collections/towerScreen.collection.ts`, emitido como `TOWER_SCREEN`, leído por `src/content/tower.ts` (`TOWER_SCREEN_CONTENT`) y entregado a la fachada por `MurciaExperience` con `layoutTowerSlides()`.
2. **Huecos, no bloques.** Cada diapositiva tiene titular, unas pocas líneas, una cifra con signo y unidad, pies y una imagen con su ajuste (`cover` o `contain`); la forma exacta está en el [contrato de campos](../../content/sanity-field-contract.md#towerscreen--singleton). Nada en el CMS es una posición: `layoutTowerSlides.ts` coloca cada hueco en la cuadrícula de las dos diapositivas originales. Un hueco vacío no se dibuja.
3. **La imagen se replica, como una marca**, en `/media/tower/` (ver [medios replicados](medios-replicados.md)).
4. **Los límites de caracteres son la capacidad medida del muro** (`EDITORIAL_BOUNDS.towerScreen` en `src/content/editorialBounds.ts`). Por encima, el build rechaza el documento; el Studio avisa un poco antes. Lo cosmético (foto apaisada con `cover`, imagen pequeña, una sola diapositiva, rotación larga) es aviso amarillo (`sanity-studio/schemas/lib/towerAdvice.ts`).
5. **Cero diapositivas hace fallar el build**: una pantalla apagada en el hito parece una avería.
6. **Se deriva, no se pregunta:** el polvo depende del ajuste de la imagen y los ids de diapositiva salen de su posición.
7. **La fachada no importa contenido generado**: recibe el documento. Lo vigila `check:architecture`.

## Por qué

La pantalla dibujaba un documento empaquetado en TypeScript, con una imagen de stock con marca de agua que no podía publicarse, y el cliente necesita cambiar palabras, cifras e imagen sin desplegar código. Los editores no tienen perfil técnico, así que no pueden recibir posiciones.

## Qué se descartó

- Bloques posicionables en el CMS.
- Una vista previa propia en el Studio, aplazada: la forma del documento permite añadirla sin migrar. Hoy el documento cae en la vista de lectura genérica (ver [vista previa del Studio](vista-previa-del-studio.md)).

## Se ha roto si…

- `layoutTowerSlides.test.ts` falla: la cuadrícula ya no coincide con la de las diapositivas originales.
- `src/content/tower.test.ts` falla: no hay exactamente un registro o no hay diapositivas.
- `content/collections/collections.test.ts` deja de fallar con cero o dos documentos («accepts exactly one document, and fails on zero or two»).
- Un texto se sale del muro sin que el build lo rechace (inspección visual; en ejecución solo lo registra `warnIfOverflowing`).

## Afecta a

`content/collections/towerScreen.collection.ts`, `src/content/tower.ts`, `src/content/editorialBounds.ts` (`towerScreen`), `src/experiences/murcia/landmark/towerScreen/content/layoutTowerSlides.ts`, `src/experiences/murcia/MurciaExperience.ts`, `sanity-studio/schemas/towerScreen.ts`, `sanity-studio/schemas/lib/towerAdvice.ts`, `sanity-studio/schemas/lib/towerImage.ts`
