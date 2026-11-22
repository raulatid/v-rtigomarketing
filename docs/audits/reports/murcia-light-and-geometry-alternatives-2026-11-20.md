# Murcia: alternativas a cómo se envían la luz y la geometría

**Fecha:** 2026-11-20 · **Base:** `fd36f6b`, entrega `murcia-v8` con el arreglo de ventanas, árbol limpio · **Continúa:** el [análisis de la cadena de v8](murcia-v8-export-pipeline-2026-11-20.md) y el [informe hacia 5 MB del 2026-11-18](murcia-weight-toward-5mb-2026-11-18.md)
**Guía:** ninguna; es un análisis a petición, no una pasada de `audits/website-performance-and-optimization.md`

Pregunta: ¿hay formas de traer la luz, las texturas, los shaders o la geometría de Murcia que pesen menos y que la cadena actual no esté considerando? Por ejemplo, AO en vez de lightmaps u otro formato. Se busca a propósito fuera de las líneas que ya han medido los informes anteriores.

**No se ha generado, medido ni visto nada nuevo.** Las cifras medidas son de los dos informes citados: las de r5 vienen del 2026-11-18 y las de v8, del 2026-11-20, sobre la pasada anterior al arreglo de las ventanas. Los ahorros de este informe son estimaciones. No se modificó ningún archivo de código, de `04_Assets` ni de Blender.

**Etiquetas.** *Medido*: cifra de un informe anterior, con su fuente. *Leído*: código. *Estimado*: aritmética o juicio sin generar el archivo.

---

## 1. Resumen

- La cadena responde a «qué luz tiene cada superficie» con una sola herramienta: **una isla de atlas por superficie, con su UV1 enviada y su luz horneada en Cycles y enviada.** Todas las propuestas anteriores mejoran ese método. Este informe cuestiona tres de sus suposiciones:
  1. que cada pieza necesita su propia luz;
  2. que la UV de luz hay que enviarla;
  3. que la luz hay que enviarla.
- **El AO solo no sustituye al lightmap,** pero es una pieza de la alternativa del apartado 6. La luz horneada es sombra solar, cielo y rebote, y lo que domina es la oclusión.
- **Hay cuatro ideas que los informes anteriores no recogen**, ordenadas de mejor a peor relación entre ahorro y riesgo:
  1. la herencia de luz;
  2. las ventanas como shader;
  3. la UV de luz implícita;
  4. la luz calculada en el cliente.

  Frente a los 4,05 MB de hoy (*estimado*, con los solapes del apartado 8 descontados):
  - **Las tres primeras, con el horneado de Cycles:** unos 2,7–3,0 MB. Herencia de luz ≈ −0,72 MB, ventanas como shader ≈ −0,08 MB más y UV implícita ≈ −0,3 a −0,6 MB.
  - **Las cuatro, con la variante híbrida del apartado 6:** unos 1,8–2,4 MB. El GLB queda en 1,3–1,6 MB y los lightmaps en 0,5–0,8 MB, que ya incluyen el ahorro de atlas de la herencia de luz.

  La segunda cifra depende de que la memoria de GPU del shadow map quepa en iOS, y hoy no cabe sin un pase propio (apartado 6, riesgos).
- **El primer paso propuesto es un prototipo acotado** de la herencia de luz y las ventanas como shader, revisado en la escena.

Nada de esto está aplicado.

---

## 2. Punto de partida

- **Entrega v8 instalada** (*medido*, `unifiedManifest.test.ts` y el GLB): GLB 1.983.652 B y lightmaps 2.052.451 B en los dos perfiles, unos 4,05 MB.
- **Qué pesa más** (*medido* en el informe del 2026-11-20, antes del arreglo de las ventanas): `CITY_B/C` 0,91 MB, ventanas ≈ 0,55 MB, pretiles de los procedurales 0,20 MB, props ≈ 0,06 MB.
- **La UV1 era la mitad del Draco en r5** (*medido* el 2026-11-18): `TEXCOORD_1` 906 KB de 1.824 KB; posición y conectividad, 829 KB. En v8 no se ha medido.
- **Ya no queda nada barato en el formato** (*medido* el 2026-11-18):
  - `NORMAL` solo va en las 7 primitivas sin hornear o de vidrio;
  - `COLOR_0` pesa 65 KB;
  - Brotli reduce el Draco solo un 11 %;
  - meshopt es 3,3 veces más grande.
- **El material es unlit** (*leído*, `lightmapMaterial.ts`): `MeshBasicMaterial` con el color de vértice como albedo y el atlas como única luz. El sol del horneado es fijo.
- **Escala de un píxel** (*estimado* a partir de las cámaras del informe del 2026-11-18: FOV 35°, 900 px de alto en escritorio): unos 0,31 m en reposo (440 m), 0,14 m en la navegación cercana (198 m) y 0,42 m en la lejana (600 m). Una ventana mide 5–8 px en reposo y llega a 106 px como máximo en las poses del campus.

### Datos de los informes que apoyan este análisis (medido)

- Un valor constante por cara explica el 70–91 % de la varianza de la luz en log.
- Sol, hemisférica y una luz puntual ajustada, sin visibilidad, explican solo el 2–9 % de las medias por cara (R² 0,02–0,09). Lo que falta es la oclusión.
- Entre el 74 y el 94 % de la varianza de luminancia del suelo, los estáticos y la catedral está a escalas de 4 téxeles o más.
- Las caras finas de `CITY_B` son el 91 % de sus caras y se llevan el 69 % de los téxeles para el 16,7 % de la superficie. En `CITY_C`: 89 %, 64 % y 13,4 %.
- Entre el 36 y el 49 % de lo mapeado en el suelo central queda negro bajo los edificios.
- El 64 % de los edificios de `CITY_B/C/D` son prismas puros.

---

## 3. Herencia de luz: el detalle toma la luz de lo que tiene detrás

**Qué es.** Ventanas, pretiles, cornisas y props de tejado no tienen isla propia: leen la luz de la superficie en la que están montados.

| Pieza | De dónde hereda la luz |
|---|---|
| Ventana | su pared, en el punto donde está |
| Pretil | la cara exterior, de lo alto de la fachada; la interior y la superior, del borde del tejado |
| Cornisa de `CITY_B/C` | la fachada que tiene debajo |
| Prop de tejado | el tejado bajo su base: una UV por instancia en el atlas del tejado, en lugar de una celda propia |

**La variación propia de la pieza se calcula en el shader.** Con el sol fijo, basta con la orientación de la cara respecto al sol y un término de oclusión constante por prototipo. La cara interior de un pretil, por ejemplo, toma la luz del tejado multiplicada por el cociente lambertiano entre su orientación y la del tejado.

**Por qué encaja aquí.**

- A 0,3 m por píxel, una pieza de 0,4 m no tiene luz propia distinguible de la de su soporte.
- La luz es casi constante por cara.
- Hoy las caras finas consumen dos tercios de los téxeles de `CITY_B/C`.

**Elimina la clase de error, no el síntoma:** sin islas menores de un téxel no puede haber negros. Ni `Ventana-003` ni los pretiles del informe del 2026-11-20 habrían fallado.

**Diferencia con lo ya propuesto.** La luz factorizada del informe del 2026-11-20 (§4.1) conserva un valor por instancia que sale de un atlas propio. Aquí ese atlas no existe: el valor se lee del atlas del soporte, que ya se envía. Sí se mantiene el patrón por vértice de cada prototipo.

**Ahorro estimado.**

| Familia | Ahorro |
|---|---:|
| Atlas de ventanas (su parte de `instances-*`) | ≈ −0,45 MB |
| Atlas `rooftop-parapets` | ≈ −0,12 MB |
| Dos tercios de los téxeles de `outer-ring-b` y `outer-buildings`, que permiten bajarlos a 512 | ≈ −0,15 MB |
| Props | pequeño |

**Riesgo.**

- Se pierde lo que solo el horneado de la propia pieza sabe: la sombra del marco dentro de la ventana o la luz que rebota entre el pretil y el tejado. Se aproxima con el término analítico.
- Exige que la cadena escriba, por pieza o por instancia, la UV del soporte. Eso cambia el contrato del GLB.
- La pieza tiene que estar realmente pegada a su soporte. Las que flotan o vuelan necesitan otra regla.

---

## 4. Ventanas como shader, no como geometría

**Qué es.** Cada registro de fachada se dibuja como un solo quad pegado a la pared. Un shader pinta en él la rejilla de ventanas: marco, vidrio y alféizar en los colores de la paleta. El hueco hundido se calcula de forma analítica: con el sol fijo y la profundidad conocida, la sombra del dintel y de las jambas es una cuenta exacta. La luz de fondo se hereda de la pared (apartado 3).

**Por qué encaja aquí.**

- Los registros de fachada (*leído*, `facadeRecords.ts`) ya guardan origen, giro, paso horizontal y vertical, columnas y filas. Son justo los parámetros que necesita el shader.
- La ciudad usa una paleta de colores planos, así que no hay textura de fachada que reproducir.

**Ahorro estimado.**

- **Bytes:** prototipos y celdas de atlas desaparecen; quedan los registros. Cuantizados serían unos 25 KB (informe del 2026-11-20, §4.1). Se suma a la herencia de luz.
- **Rendimiento:** de 1,04 M triángulos por fotograma (*medido* en r5, antes del recorte por niebla) a unas 5.200 (2 por registro). Es la mayor mejora de GPU posible en móvil.

**Riesgo.**

- Las ventanas con relieve real (0,12–0,47 m) pierden la silueta en las esquinas. En el acercamiento máximo, a 17–106 px por ventana, se puede notar.
- Propuesta: geometría real en los edificios que quedan cerca de las secciones (campus, blog, Conócenos) y shader en el resto.
- Hay que filtrar el patrón en el shader (antialiasing con `fwidth`) para que no parpadee a 5 px.

---

## 5. UV de luz implícita: calcularla en lugar de enviarla

**Qué es.** Si el runtime puede calcular la UV1, no hace falta enviarla. Tres casos:

1. **Proyección cenital para el suelo y los tejados.** Un mapa de luz visto desde arriba con UV igual a la posición `xz` del mundo. No hay islas ni juntas.
   - La cámara mira desde 42–60° de elevación, así que las superficies horizontales son la mayoría de los píxeles.
   - El espacio que hoy queda negro bajo los edificios (36–49 % del suelo central) pasa a guardar la luz de los tejados.
   - El suelo central se hornea hoy a unos 4 téx/m. Para cubrir la placa (~420 m) a esa densidad haría falta un mapa de unos 1.600 téxeles de lado.
2. **Fachadas de prismas** (64 % de `CITY_B/C/D`): la UV es la distancia a lo largo del perímetro y la altura, calculables a partir de la huella. Por edificio solo se envía una ST.
3. **Todo lo demás:** un empaquetador determinista en JavaScript, el mismo en la cadena y en el runtime. Blender ya no decide la UV1: hornea sobre la que le da ese empaquetador, y el runtime la vuelve a calcular a partir de la malla decodificada. La cadena ya hace una vuelta por Draco para verificar (`tools/post.cjs`), así que el empaquetador puede trabajar sobre la malla cuantizada que recibirá el navegador.

**Ahorro estimado.** Una parte grande de la UV1, que en r5 era el 50 % del Draco: **≈ −0,3 a −0,6 MB**, sin renunciar a Cycles. Si la geometría deja de tener juntas de UV, además comparte vértices y Draco recupera la conectividad. Eso no está cuantificado.

**Riesgo.**

- Las superficies superpuestas en vertical (puentes, voladizos, aleros) no caben en una proyección cenital y siguen por la vía actual.
- Para que la cadena y el runtime den exactamente la misma UV hace falta una disciplina estricta de orden canónico de caras y de redondeo.
- La UV cenital tiene la densidad fija del mapa: no se puede dar más resolución a un tejado concreto.

---

## 6. Luz calculada en el cliente, y dónde entra el AO

**Qué es.** El horneado es la suma de tres términos, y cada uno se puede obtener de otra forma:

| Término | Hoy | Alternativa | Bytes |
|---|---|---|---:|
| Sombra solar (alta frecuencia, bordes nítidos) | dentro del lightmap | shadow map estático renderizado una vez en el cliente | 0 |
| Cielo y AO (baja frecuencia) | dentro del lightmap | render cenital de alturas en el cliente y AO por barrido de horizonte, como en un terreno: la ciudad es casi 2.5D | 0 |
| Rebote | dentro del lightmap | término constante, o indirecta horneada a 256–512 | 0 o pocos |

**Por qué encaja aquí.** La luz analítica sin visibilidad explica solo el 2–9 %: lo que falta es la oclusión, que se calcula con la geometría que ya se descarga.

**Variantes.**

- **Híbrida, la más prudente:** sombra solar calculada en el cliente e indirecta horneada a 256–512. Esto último es posible porque el 74–94 % de la varianza es de baja frecuencia. Lightmaps de 2,05 MB a unos **0,5–0,8 MB** (*estimado*).
- **Radical:** solo los hitos (catedral, torre Vértigo, campus) conservan el horneado de Cycles. Lightmaps a unos **0,3 MB** (*estimado*).

**Riesgo.**

- **Calidad:** no iguala a Cycles. Sin rebote real, las calles estrechas pueden quedar planas o demasiado oscuras.
- **Memoria de GPU,** el límite documentado de iOS. Pasar los 20 atlas ETC1S de 1024 a 512 libera unos 7,5 MB (*estimado*: 0,5 B por téxel transcodificado, de 10 MB a 2,5 MB). El shadow map cuesta bastante más que eso:
  - **El de three 0.174** (*leído*, `WebGLShadowMap.js:24,150` y `WebGLTextures.js`) guarda la profundidad empaquetada en un color RGBA8 y añade un renderbuffer `DEPTH_COMPONENT24`. A 2048 son 16 MB de color y unos 16 MB de profundidad, que los drivers suelen guardar en 4 B. En total ≈ 32 MB, y se redibuja en cada fotograma salvo con `autoUpdate = false`. El saldo frente a los 7,5 MB liberados es de unos +24 MB.
  - **Para dejarlo en 8 MB** hace falta un pase propio que se dibuje una vez sobre una `DepthTexture` de 16 bits sin color. Solo entonces el saldo es neutro.
  - **`MeshBasicMaterial` no recibe sombras:** el mapa se tiene que leer en el `onBeforeCompile` de `lightmapMaterial.ts`, igual que el atlas.
- **Tiempo de carga:** el AO por barrido y el shadow map cuestan GPU durante la carga. Está sin medir en móvil.
- **Acné y ajuste de sesgo** en las fachadas casi paralelas al sol. Con un sol fijo se ajusta una sola vez.

---

## 7. Descartado en este análisis

| Opción | Por qué |
|---|---|
| Impostores o fondo pintado para `CITY_D` | El paralaje con la cámara entre 198 y 600 m los delata, y la ciudad paramétrica del informe del 2026-11-18 ya deja `CITY_D` en casi nada |
| Mapa de alturas en lugar de huellas vectoriales para `CITY_*` | No pesa menos que las huellas cuantizadas; solo tiene sentido como dato de runtime (apartado 6) |
| Campos neuronales o armónicos esféricos para la luz | Requieren herramientas nuevas sin una ganancia clara frente a los apartados 3–6 |
| Gaussian splats | Pesan más que la geometría actual |
| Raymarching de toda la ciudad | Coste de GPU inasumible en móvil |
| JPEG XL | Apenas tiene soporte en navegadores |
| Brotli en el CDN, quitar normales | Ya medido el 2026-11-18: el 11 % sobre Draco, y las normales ya no se envían |

---

## 8. Solapes con los informes anteriores

- **Herencia de luz y el informe del 2026-11-20:** sustituye a la luz factorizada de ventanas y props (§4.1–4.2), a la luz por vértice de los pretiles (§4.3) y a la separación por tamaño de `CITY_B/C` (§4.4). No se suman.
- **Ventanas como shader y los registros de fachada:** los registros se quedan; desaparecen los prototipos y su luz.
- **UV implícita y la ciudad paramétrica del 2026-11-18:** la paramétrica ya genera la geometría de `CITY_*`. La UV implícita extiende la idea a la luz y al resto de mallas.
- **Luz en el cliente y AVIF:** si los atlas bajan a 256–512 y son de baja frecuencia, la ganancia de AVIF se reduce mucho.

---

## 9. Orden propuesto

1. **Prototipo acotado de herencia de luz y ventanas como shader:** una manzana de `CITY_B` con sus ventanas y pretiles, en el runtime, al lado de la versión actual. Es la idea con más bytes, menos riesgo y mejor rendimiento, y además elimina los negros por construcción. **Lo juzga el usuario en la escena.**
2. **UV cenital para suelo y tejados.** Ataca la mitad del Draco sin renunciar a Cycles.
3. **Luz calculada en el cliente,** como experimento aparte y comparado lado a lado con el horneado.

## Decisiones abiertas

1. Si se acepta una aproximación analítica para la luz de los detalles, a cambio de no tener negros ni atlas propios.
2. Si las ventanas de los anillos pueden perder el relieve geométrico.
3. Si la UV1 puede dejar de ser cosa de Blender y pasar a un empaquetador compartido entre la cadena y el runtime. Cambia el contrato del GLB.
4. Cuánta calidad de Cycles se está dispuesto a ceder en el fondo de la ciudad.

---

## Cómo se obtuvo

- Se leyeron los dos informes citados, `lightmapMaterial.ts` y `facadeRecords.ts`. Las cifras medidas son de esos informes, con su fecha y su entrega.
- La escala del píxel sale de la distancia, el FOV vertical de 35° y 900 px de alto: `2 · d · tan(17,5°) / 900`.
- Los ahorros se calcularon sobre el peso medido por familia y la fracción que cada idea retira. No se ha generado ningún archivo.
- La memoria de los atlas sale de `public/textures/murcia/lightmaps-v8/lightmaps.json`: 20 atlas ETC1S de 1024 sin mipmaps. La del shadow map, de leer `WebGLShadowMap.js` y `WebGLTextures.js` en three 0.174.

No se ejecutaron tests ni harnesses durante el análisis, ni se miró la escena en el navegador.
