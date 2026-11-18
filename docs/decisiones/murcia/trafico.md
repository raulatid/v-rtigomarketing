# Tráfico de Murcia

**Estado:** vigente · **Desde:** 2026-11-14 · **Sustituye a:** los barcos de ida y vuelta del primer prototipo (sin commitear)

## Decisión

1. **Rutas de un solo sentido.** Cada vehículo, barco o coche, aparece al inicio de una ruta, la recorre y desaparece al final. No vuelve, no gira en el sitio y no hay bucles ni grafo de calles.
2. **Los extremos de cada ruta se dibujan más allá de la niebla.** Aparecer y desaparecer es instantáneo, sin fundidos: un fundido obligaría a materiales transparentes por vehículo.
3. **Velocidad constante por tipo, sin frenadas, paradas ni semáforos.** Todos los vehículos de un tipo van a la misma velocidad y salen separados, así que en una ruta nunca se alcanzan. No hay lógica de colisiones: las rutas se dibujan para no cruzarse.
4. **Apariciones por ruta.** Cada ruta tiene su temporizador con un intervalo aleatorio dentro del rango del tipo, y el tipo tiene un máximo de vehículos a la vez. Si se ha llegado al máximo, la aparición se salta. La forma y el tono se eligen al azar, con igual probabilidad, entre los del tipo.
5. **En un dispositivo modesto, la mitad.** «Modesto» es el perfil `mobile` de los lightmaps (`deviceResolution() === 1024`), no un criterio nuevo. La proporción es `MODEST_DEVICE_SHARE` en `trafficConfig.ts`.
6. **Al aterrizar, el tráfico ya está en marcha.** El estado se simula al construir la escena (lo que tarda la ruta más larga) y el primer fotograma ya muestra vehículos repartidos. Con movimiento reducido, esa imagen se queda quieta.
7. **Sin actualización cuando Murcia no se dibuja.** Lo garantiza `setActive(false)`, que deja `update()` sin efecto.
8. **Solo decorado.** Sin raycast, hover ni efecto en los límites de cámara. Un modelo que no carga avisa y su tipo sigue con los demás; un tipo sin modelos o sin rutas no dibuja nada.
9. **Un `InstancedMesh` por forma, con todos sus tonos.** Una llamada de dibujo por forma, sea cual sea el número de tonos; los vehículos activos van al principio de las instancias y `count` dice cuántos se dibujan. No se crea ni se libera ninguna malla durante la sesión. `frustumCulled` está apagado porque las instancias abarcan media ciudad.
10. **El tono es un dato por instancia, no un modelo** (2026-11-17). Cada GLB es una forma; su atributo `_TONE` marca con 1 la carrocería o el casco. Cada instancia lleva su color (`instanceTone`) y el shader lo pone en lugar del color de vértice donde `_TONE` es 1; cristales, ruedas y cubierta conservan el suyo. Los tonos (azul, salvia, terracota) están en `TRAFFIC_KINDS`, en RGB lineal como el `COLOR_0` del GLB. Añadir un tono es una línea de configuración: ni archivos ni llamadas de dibujo.
11. **Material del GLB tal cual**, iluminado por las luces de la escena, sin lightmap ni sombras. Si el tono no encaja con la ciudad, se corrige en `TRAFFIC_KINDS`; el resto de colores, en Blender.
12. **Se oscurece con la ciudad en Conócenos.** `createCityMark` modifica también los materiales del tráfico (`alsoDarken`); por eso el tráfico se construye antes que `setupAbout`.
13. **La altura y el rumbo vienen de la ruta.** El vehículo solo gira en horizontal: en una cuesta, los vértices de la ruta deben seguir la calle.
14. **La única fuente de las rutas es Blender.** La colección `rutas-trafico` de la `.blend` se exporta con `scripts/blender/export-traffic-routes.py` a `trafficRoutes.json`, aparte del GLB de la ciudad, para que retocar una ruta no obligue a hacer una entrega de la ciudad. El JSON no se edita a mano. El contrato está en [`blender-export-contract.md` §8](../../murcia/blender-export-contract.md#8-rutas-de-tráfico).
15. **Se carga de forma diferida** (2026-11-17). `setupTraffic` importa `createTraffic.ts` (con las rutas) bajo demanda mientras la ciudad carga, durante la intro de la Tierra, y `isPreloadedOnIndex` en `vite.config.ts` lo excluye de los precargados de `/`. Las rutas de coches llevaron el JS inicial de `/` por encima de su presupuesto, que no se sube; el tráfico no hace falta para el primer dibujo. Un import estático del tráfico desde un chunk inicial vuelve a meterlo en `/`, y la build falla.

Los valores (velocidad, intervalo y máximo por tipo) son una primera aproximación y se ajustan a ojo; viven en `TRAFFIC_KINDS`, en `trafficConfig.ts`.

## Qué se descartó

- **Barcos de ida y vuelta** con giro de 180° en cada extremo (`boatMotion.ts`): con dos carriles dibujados, volver por el mismo era incorrecto, y el giro en el sitio sobraba.
- **Un circuito cerrado** que uniera los dos carriles: no hace falta que un vehículo vuelva.
- **Un grafo de calles con cruces**: a la distancia de la cámara no se nota y cuesta mucho dibujarlo y programarlo.
- **Una copia independiente por vehículo**: unas 30 llamadas de dibujo frente a una por modelo.
- **Crear y destruir objetos en cada aparición**: provoca tirones del recolector de memoria.
- **Un GLB por tono** (2026-11-17): 6 formas × 3 tonos eran 18 archivos, 18 `InstancedMesh` y hasta 18 llamadas de dibujo, con la geometría de cada forma repetida tres veces. Ahora son 6 archivos (~210 KB frente a ~570 KB; con Draco, desde el 2026-11-18, 20 KB) y como mucho 6 llamadas. Se descartó también `instanceColor` de three: multiplica todos los vértices y teñiría cristales y ruedas.
- **Ruedas que giran** (2026-11-16): se probaron como mallas aparte que giraban según la distancia recorrida. Desde la cámara una rueda ocupa unos pocos píxeles y el giro no se ve, y cada coche pasaba de una a tres llamadas de dibujo. Las ruedas van unidas a la carrocería en el GLB.

## Se ha roto si…

- Fallan `trafficSchedule.test.ts`, `readTrafficRoutes.test.ts` o `trafficModels.test.ts`. Los dos últimos leen lo versionado: el `trafficRoutes.json` (un prefijo desconocido o una ruta mal exportada) y cada GLB de `TRAFFIC_KINDS` (un modelo que no es una sola malla con un material, o sin colores de vértice o sin máscara `_TONE`).
- Se ve un vehículo aparecer o desaparecer a la vista, o un vehículo brillante sobre la ciudad oscurecida de Conócenos (inspección visual).
- Todos los vehículos de una forma salen del mismo color, o el tono tiñe cristales y ruedas (inspección visual: el parche de `tintByInstance` en `createTraffic.ts` no se aplicó).

## Afecta a

`src/experiences/murcia/traffic/`, `src/experiences/murcia/MurciaExperience.ts` (`setupTraffic`), `vite.config.ts` (`isPreloadedOnIndex`), `src/experiences/murcia/about/createCityMark.ts` (`alsoDarken`), `scripts/blender/export-traffic-routes.py`, `public/models/vehicles/`
