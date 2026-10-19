# Sensación de la cámara de Murcia: muelle e inclinación hacia el cursor

**Estado:** vigente · **Desde:** 2026-09-10 · **Sustituye a:** DECISIONS §44 (amortiguación e inclinación)

## Decisión

1. **Cada eje es un muelle amortiguado**, resuelto en forma cerrada una vez por grupo y fotograma: independiente de la tasa de fotogramas de forma exacta, estable con cualquier `dt` y sin asignaciones.
2. **Giro y avance aterrizan:** su `dampingRatio` está por debajo de 1, así que la cámara rebasa una vez el objetivo y vuelve. Ese rebase es intencionado.
3. **El zoom es siempre críticamente amortiguado**, diga lo que diga `dampingRatio`. Un zoom que rebasara bajaría de `minRadius` y metería el plano cercano en el suelo.
4. **La elevación usa los coeficientes del zoom**, para que distancia e inclinación se asienten como un solo movimiento. Por eso la suavización del zoom vive en el rig y no en `MurciaExperience`.
5. **La cámara se inclina un poco hacia un cursor quieto** tras un rato de reposo. Es un adorno, no navegación: se suma al calcular la pose y nunca entra en los objetivos, así que los límites, un vuelo o una captura de pose no lo ven. Es de primer orden, no un muelle, para que no rebote justo cuando el ratón se para.
6. Con `prefers-reduced-motion` no hay inclinación hacia el cursor.

Valores: `rotationDamping`, `travelDamping`, `zoomDamping`, `dampingRatio` y `cursor*` en `src/experiences/murcia/camera/cameraTuning.ts`.

## Por qué

El retardo de primer orden anterior (`1 - exp(-k·dt)`) solo era aproximadamente independiente de los fotogramas y no tenía la sensación de «aterrizar».

## Se ha roto si…

`npm run check:navigation` falla en §3 (acota el rebase en lugar de prohibirlo), §4 (independencia exacta de los fotogramas) u §8 (la inclinación no entra en los objetivos).

## Afecta a

`src/experiences/murcia/camera/CameraRig.ts`, `src/experiences/murcia/camera/cameraTuning.ts`
