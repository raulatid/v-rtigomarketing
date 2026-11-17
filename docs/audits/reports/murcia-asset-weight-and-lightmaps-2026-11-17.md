# Peso de la ciudad y lightmaps de Murcia: análisis

**Fecha:** 2026-11-17 · **Sobre:** la entrega `murcia-v5.2-lightmaps-r1` tal como está en `1c9cd58` (GLB y carpeta de lightmaps sin modificar)
**Guía:** ninguna; es un análisis a petición, no una pasada de `audits/website-performance-and-optimization.md`

Dos preguntas:

1. ¿Qué es el corte entre texturas que se ve en el suelo junto al río, y cómo se arregla?
2. ¿Cómo bajar los MB totales de la ciudad (GLB y lightmaps) sin perder calidad visual, con el planteamiento actual o con otro?

No se modificó ningún archivo del repositorio. Los scripts de medición vivieron fuera, en una carpeta temporal de la sesión, y no se conservan: el método de cada cifra está descrito en [Cómo se midió](#cómo-se-midió) para poder repetirla.

**Etiquetas.** *Medido*: observado sobre los archivos publicados. *Leído*: leído en el código o en una fuente externa. *Inferido*: aritmética o razonamiento, no observado. *Estimado*: orden de magnitud sin medición directa.

**Unidades.** MB son millones de bytes, como en `LIGHTMAP_BUDGET_BYTES`.

---

## 1. Resumen

- **El corte es la unión entre el suelo central y el suelo exterior.** No es un fallo de UV. El suelo central va a 12,5–21,3 cm por téxel y `ground-Outer` a 194 cm por téxel, en ETC1S, así que sus bloques de 4×4 miden 7,7 m. En la línea la luz salta además un 13–16 % de mediana.
- **El Draco del GLB pesa casi el doble de lo necesario.** Está codificado a nivel de compresión 3–4. A nivel 6, con los mismos datos y la misma cuantización, pasa de 7,28 MB a 4,03 MB.
- **Las superficies horneadas llevan atributos que nadie lee.** `NORMAL`, `TEXCOORD_0` y `TEXCOORD_2` suman otros 1,82 MB de Draco.
- **Sumando las dos cosas el GLB baja de 8,73 MB a unos 3,65 MB sin ningún cambio visual.** El total pasa de 15,2 a 10,1 MB en escritorio y de 13,2 a 8,1 MB en móvil.
- **Los dos atlas UASTC son 2,37 MB de los 6,49 MB de lightmaps de escritorio.** En ETC1S a calidad alta ocupan un 30 %; falta validarlo a ojo contra los masters.
- **Los atlas están muy vacíos:** en el perfil de escritorio solo se usa el 34 % de los téxeles.

Nada de esto está aplicado. El orden propuesto está en el [apartado 7](#7-orden-propuesto).

---

## 2. El corte del suelo

### Qué es

El suelo horneado son cinco chunks. Los cuatro centrales cubren un cuadrado de 420 × 440 m (x de −470 a −50, z de 60 a 500, en coordenadas glTF); `ground-Outer` cubre todo lo demás, 1,42 km².

| Atlas | Área (m²) | Téxeles/m a 2048 | Resolución (escritorio / móvil) | cm por téxel | Atlas ocupado |
|---|---|---|---|---|---|
| `ground-NE` | 47.383 | 8,01 | 2048 / 2048 | 12,5 | 72,6 % |
| `ground-NW` | 49.578 | 7,45 | 2048 / 2048 | 13,4 | 65,6 % |
| `ground-SE` | 56.176 | 5,69 | 2048 / 2048 | 17,6 | 43,3 % |
| `ground-SW` | 55.635 | 4,69 | 2048 / 2048 | 21,3 | 29,1 % |
| `ground-Outer` | 1.419.732 | 1,03 | 1024 / 1024 | **193,6** | 36,1 % |

*(medido)*

Al cruzar el borde del cuadrado central la resolución cae entre 9 y 15 veces de golpe. Con téxeles de casi 2 m, el filtrado bilineal y los bloques de ETC1S (4×4 téxeles, 7,7 m) quedan a la vista, con manchas de color incluidas.

La captura que motivó el análisis muestra exactamente eso: a un lado del corte la luz es suave y al otro hay bloques. Se reprodujo renderizando el suelo desde arriba en los dos puntos donde el paseo del río (`caminata-rio__*`) cruza el borde, x = −50 y x = −470, y el resultado coincide.

En la propia línea, comparando una franja de 1 a 3 m a cada lado:

| Borde | Salto relativo de luminancia, mediana | p90 |
|---|---|---|
| Este (x = −50) | 13,5 % | 35,6 % |
| Oeste (x = −470) | 16,3 % | 50,3 % |

*(medido)*

Contribuyen también, en menor medida: `ground-Outer` usa `linearScale` 2 y los centrales 4, y cada atlas se codifica con su propio libro de códigos ETC1S.

Los cuatro chunks centrales tampoco son iguales entre sí: de `ground-NE` a `ground-SW` hay 1,7 veces de diferencia. Esas uniones se notan menos, pero existen.

### Cómo arreglarlo

De menos a más:

1. **Reempaquetar `ground-Outer` y servirlo a 2048 en escritorio.** Ocupa el 36 % de su atlas: las dos mitades de la placa llenan un tercio y el resto son tiras de calle sueltas. Con un empaquetado al 70 % y la variante 2048 (259 KB frente a 69 KB) quedaría en unos 70 cm por téxel *(inferido)*. El salto seguiría siendo de 3 a 5 veces.
2. **Anillo de transición (recomendado).** Cortar una banda de 80–100 m alrededor del cuadrado central y hornearla en un atlas propio a unos 25 cm por téxel. Una banda de 80 m son 163.200 m², que a 4 téxeles/m ocupan el 62 % de un 2048 *(inferido)*. Por comparación con `ground-NE` y `ground-NW` costaría 250–300 KB *(estimado)*. El suelo basto quedaría a 80 m de donde puede situarse el objetivo de la cámara, que según [límites de la cámara](../../decisiones/murcia/limites-de-camara.md) no sale del anillo A2. No se comprobó en la escena cuánto se ve desde ahí.
3. **Hornear los bordes compartidos igual en los dos lados:** misma `linearScale`, téxeles alineados a la arista y, si se usa reducción de ruido, aplicada al suelo entero antes de partirlo.
4. **Igualar la densidad de los cuatro chunks centrales.**
5. **Filtrado bicúbico del lightmap en el suelo** (cambio de shader en `lightmapMaterial.ts`). Suaviza el dibujo del bilineal ampliado; no corrige los errores de bloque del códec. Opcional, y solo tiene sentido si queda suelo ampliado a la vista.

---

## 3. Dónde están los bytes

### Totales

| | Escritorio | Móvil |
|---|---|---|
| GLB | 8,73 MB | 8,73 MB |
| Lightmaps | 6,49 MB | 4,49 MB |
| **Total** | **15,22 MB** | **13,22 MB** |

*(medido; los lightmaps son los totales de `lightmaps.json`)*

### GLB (`public/models/murcia-v5.2-lightmaps-r1.glb`, 8.730.832 bytes)

| Parte | Bytes | |
|---|---|---|
| Geometría Draco (99 primitivas, 749.806 vértices, 371.973 triángulos) | 7.284.567 | 83,4 % |
| Instancias: `ROTATION` | 372.848 | |
| Instancias: `_LIGHTMAP_ST` | 372.848 | |
| Instancias: `TRANSLATION` | 279.636 | |
| Instancias: `SCALE` | 279.636 | |
| JSON | 125.168 | |
| Imagen embebida (trim neutro) | 15.959 | |

*(medido)*

Las mallas que más pesan:

| Malla | KB | Vértices | Atlas |
|---|---|---|---|
| `CITY_B_SIMPLIFIED` | 1.278 | 134.228 | `outer-ring-b` |
| `CITY_C_SIMPLIFIED` | 1.146 | 120.216 | `outer-buildings` |
| `Fachada_Murcia_15k` | 401 | 40.544 | `landmark-cathedral` |
| `Cathedral_Structure` | 367 | 39.836 | `landmark-cathedral` |
| `Teatro_Romea` | 357 | 66.984 | `static-NW` |
| `Sculpted_head` | 329 | 24.621 | `static-SW` |
| `CITY_D_SIMPLIFIED` | 309 | 35.028 | `outer-buildings` |
| `ARCH_Porcelain_White` | 286 | 21.798 | `landmark-campus` |

Los tres anillos exteriores simplificados (`CITY_B/C/D`) son 2,73 MB, el 38 % del Draco.

### Lightmaps

Los archivos más grandes del perfil de escritorio:

| Atlas | Bytes | Códec |
|---|---|---|
| `landmark-cathedral-2048` | 1.386.832 | UASTC + Zstd |
| `rooftop-parapets-2048` | 979.827 | UASTC + Zstd |
| `outer-ring-b-2048` | 567.257 | ETC1S |
| `static-NW-2048` | 492.727 | ETC1S |

`landmark-cathedral-2048` va también en el perfil móvil, donde es el 31 % del presupuesto.

---

## 4. Ahorros sin cambio visual

### 4.1 Nivel de compresión Draco

El GLB está codificado a **nivel 3–4**. Se comprobó recodificando dos mallas con todos sus atributos y la cuantización original a cada nivel:

| Nivel | Bytes respecto al original |
|---|---|
| 0–2 | 109 % |
| 3–4 | 100 % (285.869 y 285.828 frente a 285.684) |
| 5 | 54 % |
| 6 | 54 % |
| 7–10 | 54–55 % |

*(medido)*

El nivel solo cambia los esquemas de predicción y la codificación de entropía: la geometría decodificada es la misma. El exportador de Blender usa 6 por defecto. Recodificado el archivo entero a nivel 6:

**7.284.567 → 4.029.673 bytes (−3,25 MB).** *(medido)*

Queda sin medir el tiempo de decodificación, que sube algo con el nivel. Se hace una vez, en un worker.

### 4.2 Atributos que nadie lee

Todas las mallas llevan `POSITION`, `NORMAL`, `TEXCOORD_0`, `TEXCOORD_1` y `COLOR_0`; 19 llevan además `TEXCOORD_2`. Para una superficie horneada opaca:

- **`NORMAL` no se usa.** El material es `MeshBasicMaterial`, sin luz (`lightmapMaterial.ts`). El único lector de normales de la ciudad es `meanHorizontalNormal` (`landmark/towerTargets.ts`), sobre la pantalla, que no está horneada *(leído)*.
- **`TEXCOORD_0` no se usa.** Era la UV del trim, retirado; `dropEmbeddedTrim` quita la textura antes de los lightmaps *(leído)*. `buildSceneReport` (`loadCity.ts`) avisa de mallas sin `uv`, pero solo informa.
- **`TEXCOORD_2` no se usa.** El runtime lee solo `uv1`.

El vidrio transparente (`MURCIA_Vertigo_Base_Cristal`) conserva su material con luz y necesita normales. Los nodos sin hornear (`LED_Main`, el logo, `rio`, `PARK_Water`, `CAMPUS_SCREEN_Continuous`) conservan todo.

Recodificado a nivel 6, acumulando:

| Variante | Draco (bytes) | Ahorro acumulado |
|---|---|---|
| Original | 7.284.567 | |
| Nivel 6, mismos datos | 4.029.673 | −3,25 MB |
| + sin `NORMAL` en lo horneado opaco | 3.467.465 | −3,82 MB |
| + sin `TEXCOORD_0` ni `TEXCOORD_2` | 2.206.247 | −5,08 MB |
| + color a 8 bits | 2.204.176 | −5,08 MB |

*(medido)*

El color no pesa: va sin cuantizar (uint16, cuatro componentes), pero hay muy pocos valores distintos por malla (17 en `CITY_B_SIMPLIFIED`, 1 en los pretiles) y Draco lo comprime casi a cero.

Con esto el GLB queda en unos **3,65 MB** *(inferido: 2,21 de Draco más instancias, JSON e imagen)*.

**Cómo aplicarlo.** El exportador de Blender escribe las capas UV en orden, así que no puede emitir `TEXCOORD_1` sin `TEXCOORD_0`: quitar la primera capa convertiría la UV de lightmap en `TEXCOORD_0` y rompería `uvChannel: 1`. Hay dos caminos:

- quitar los atributos en la preparación de la entrega, que ya escribe accesores propios (`_LIGHTMAP_ST`, `instance_st_accessor`);
- o dejarlos con valor constante en la `.blend` (una UV colapsada, una normal fija), que Draco reduce a casi nada. No está medido.

**Sin comprobar:** si `checks/city-asset.ts` exige `TEXCOORD_0` o `NORMAL` en los receptores, y cómo queda la ciudad sin normales cuando los lightmaps no se aplican (`[lightmaps] not applied`) y vuelve el material con luz.

### 4.3 Cuantización

El archivo usa posición a 18 bits, normales octaédricas a 12, UV a 16 y color sin cuantizar *(medido)*. Blender usa por defecto 14, 10, 12 y 10.

Sobre cinco mallas grandes (un tercio del Draco), ya sin los atributos muertos:

| Cuantización | Bytes | |
|---|---|---|
| Posición 18, UV 16 | 777.620 | 100 % |
| Posición 16, UV 14, color 8 | 656.963 | 84 % |
| Posición 14, UV 12, color 8 | 549.547 | 71 % |
| Solo posición a 18 | 300.428 | |
| Posición 18 + `TEXCOORD_1` a 16 | 758.491 | |

*(medido)*

Tras la limpieza, **la UV de lightmap es el 60 % de lo que queda.** Bajar a posición 16 y UV 14 ahorraría unos 0,34 MB más en el archivo entero *(inferido por extrapolación)*. A diferencia de 4.1 y 4.2, esto sí cambia datos: 14 bits de UV son 1/8 de téxel en un atlas 2048, y hay que mirar los márgenes entre islas antes de darlo por bueno.

### 4.4 Datos de instancias

Son 23.303 instancias en 19 grupos y 1.304.968 bytes en floats sin comprimir.

| Atributo | Bytes | Con Brotli | Observación |
|---|---|---|---|
| `TRANSLATION` | 279.636 | 85.710 | |
| `ROTATION` | 372.848 | 33.788 | las 23.303 son giro solo en Y; 3.858 valores distintos |
| `SCALE` | 279.636 | 6.589 | 21.897 son exactamente 1; 23.253 son uniformes |
| `_LIGHTMAP_ST` | 372.848 | 19.765 | solo 19 pares de escala distintos |

*(medido)*

Comprimidas en tránsito serían 0,15 MB en vez de 1,3 MB. El GLB entero, tal como está hoy, baja de 8,73 a 6,71 MB con Brotli *(medido)*.

**Vercel probablemente no lo comprime.** La lista de tipos que su CDN comprime no incluye `model/gltf-binary` (documentación de compresión de Vercel, consultada el 2026-11-17; la lista se declara no exhaustiva) *(leído)*. **No se comprobó en el despliegue:** hay que mirar la cabecera `Content-Encoding` de la respuesta del GLB. `vercel.json` no fija nada para `.glb`.

Si no llega comprimido, la alternativa es compactar en el archivo: `ROTATION` como int16 normalizado (lo permite `EXT_mesh_gpu_instancing`), `_LIGHTMAP_ST` como uint16 normalizado, y omitir `SCALE` en los grupos donde todo es 1.

---

## 5. Lightmaps

### 5.1 Los dos atlas UASTC

Se recodificó el nivel 0 de cada uno en ETC1S, tomando como referencia el propio UASTC entregado:

| Atlas | Códec | Bytes (nivel 0) | PSNR frente al UASTC |
|---|---|---|---|
| `landmark-cathedral-2048` | UASTC entregado | 1.022.647 | referencia |
| | ETC1S q128 | 271.032 | 40,84 dB |
| | ETC1S q192 | 304.970 | 41,64 dB |
| | ETC1S q255 | 322.722 | 41,70 dB |
| | WebP q90 | 430.966 | 42,51 dB |
| `rooftop-parapets-2048` | UASTC entregado | 979.527 | referencia |
| | ETC1S q128 | 246.765 | 38,56 dB |
| | ETC1S q192 | 279.251 | 39,02 dB |
| | ETC1S q255 | 281.654 | 39,02 dB |
| | WebP q90 | 445.820 | 42,19 dB |

*(medido)*

ETC1S a q192 ocupa un 30 % del UASTC. Pasar los dos a ETC1S ahorraría unos 1,6 MB en escritorio y 1,2 MB en móvil *(estimado, contando el segundo mip de la catedral)*.

**Dos reservas que impiden darlo por hecho:**

- La referencia es el UASTC entregado, no el master. Los masters no estaban en el disco de la sesión.
- El PSNR es de la imagen entera, incluido el 73–77 % de atlas vacío, que sale perfecto y sube la media. ETC1S falla en bloques concretos (bordes con contraste y color), y eso la media lo esconde.

La entrega mantiene UASTC en estos dos a propósito (lo dice su [registro](../../murcia/lightmaps-v5.2-r1-integration.md)); el resto de atlas va en ETC1S a q32–192 con `--clevel 2`. El motivo no está escrito. La prueba pendiente es ETC1S a q192–255 **mirado** contra los masters.

### 5.2 Ocupación de los atlas

| Atlas | Ocupado | | Atlas | Ocupado |
|---|---|---|---|---|
| `landmark-vertigo-blog` | **2,6 %** | | `static-NE` | 24,7 % |
| `landmark-campus` | **6,6 %** | | `landmark-cathedral` | 26,6 % |
| `instances-main-2` | 11,1 % | | `static-SW` | 34,8 % |
| `instances-outer-1` | 17,2 % | | `outer-buildings` | 36,4 % |
| `instances-main-0` | 17,7 % | | `outer-ring-b` | 42,2 % |
| `instances-main-1` | 17,9 % | | `static-SE` | 46,8 % |
| `instances-outer-0` | 20,2 % | | `static-NW` | 48,3 % |
| `rooftop-parapets` | 22,8 % | | | |

*(medido, como suma de áreas de triángulos en UV; los del suelo están en el apartado 2)*

En el perfil de escritorio hay 61,9 millones de téxeles y se usan 21,2 millones, el 34 % *(inferido)*.

- `landmark-vertigo-blog` y `landmark-campus` caben juntos en un solo 1024 a la misma densidad *(inferido: 109.000 y 277.000 téxeles útiles)*. Hoy son dos 2048.
- `rooftop-parapets` tiene la mitad superior del atlas en negro.
- En `outer-buildings` cada cara de cada caja es una isla diminuta. Desplegar las cuatro paredes de un edificio como una sola tira dejaría dos islas por edificio en vez de cinco y mucho menos margen perdido.

El espacio vacío cuesta pocos bytes en ETC1S, pero ocupa memoria de GPU entera y, sobre todo, es densidad que no se está aprovechando.

### 5.3 Densidad desigual

| Atlas | Téxeles/m a 2048 | cm por téxel (escritorio / móvil) |
|---|---|---|
| `landmark-cathedral` | 11,23 | 8,9 / 8,9 |
| `rooftop-parapets` | 6,11 | 16,4 / 32,8 |
| `static-SE` | 5,72 | 17,5 / 34,9 |
| `static-SW` | 3,89 | 25,7 / 51,4 |
| `static-NW` | 2,68 | 37,3 / 74,6 |
| `static-NE` | 2,48 | 40,3 / 80,5 |
| `landmark-campus` | 2,46 | 40,7 / 81,3 |
| `landmark-vertigo-blog` | 3,27 | 30,6 / 61,2 |
| `outer-ring-b` | 1,26 | 79,3 / 79,3 |
| `outer-buildings` | 0,70 | 284,1 / 284,1 |
| `instances-*` | 3,0–8,4 | 23,7–66,5 (a 1024 en los dos perfiles) |

*(medido; mediana ponderada por área)*

Los mismos edificios procedurales van a 5,7 téxeles/m en el SE y a 2,5 en el NE, porque cada cuadrante recibe un 2048 tenga el área que tenga (58.759 m² frente a 167.830 m²). Empaquetar por densidad fija —téxeles por metro como dato de entrada, margen en píxeles— iguala la calidad entre cuadrantes y libera téxeles donde hoy sobran.

---

## 6. Otros planteamientos

### 6.1 Luz por instancia en las ventanas

22.870 de las 23.303 instancias son ventanas. Cada una tiene su celda de atlas, de 3 a 6 téxeles de ancho al 1024 que se sirve en los dos perfiles.

La alternativa es un color de luz por instancia (3–4 bytes, unos 70–90 KB en total) y, si hace falta, la oclusión del prototipo en su color de vértice. Sustituiría `_LIGHTMAP_ST` (373 KB) y la mayor parte de los cinco atlas `instances-*` (573 KB en cada perfil).

Ahorro: unos 0,8 MB y hasta cinco texturas menos en GPU *(estimado)*. Se pierde el degradado dentro de cada ventana. Los árboles, las sillas y el muro del río (`instances-main-0`) podrían quedarse en atlas.

### 6.2 Luz por vértice en los anillos C y D

`outer-buildings` va a 2,84 m por téxel. Con 24,9 m² de media por triángulo, salen unos 3 téxeles por triángulo: el atlas apenas lleva más información que los vértices.

Hornear la luz en `COLOR_0` (multiplicada por el albedo, con un factor de escala para el rango) eliminaría el atlas y la `TEXCOORD_1` de 155.000 vértices. Medido sobre los tres anillos a la vez, quitarles la UV de lightmap baja el Draco de 2,21 a 1,66 MB. Para C y D solos, que son el 54 % de esos vértices, serían 0,3–0,4 MB contando el atlas *(estimado)*.

`CITY_B_SIMPLIFIED` va a 79 cm por téxel y está más cerca: se queda en lightmap.

### 6.3 Descartados con datos

- **Más esfuerzo del codificador ETC1S (`--clevel`).** De 1 a 5, la catedral pasa de 40,51 a 40,84 dB con un 3 % más de bytes. No compensa.
- **WebP en lugar de KTX2.** A igual PSNR pesa más que ETC1S (tabla de 5.1), y en GPU se queda sin comprimir.
- **Empaquetar solo luminancia, tres atlas por textura.** La luz tiene color: la relación R/G va de 1,17 a 1,37 según el atlas, con una desviación de 0,09–0,17 dentro de cada uno. Haría falta una croma aparte.
- **`EXT_meshopt_compression`.** No se midió. Con el Draco a nivel 6 la geometría ya queda compacta, y lo único que meshopt comprimiría mejor son las instancias, que tienen las salidas de 4.4.

---

## 7. Orden propuesto

| | Cambio | Ahorro | Riesgo visual |
|---|---|---|---|
| 1 | Draco a nivel 6 | −3,25 MB | ninguno |
| 2 | Quitar `NORMAL`, `TEXCOORD_0` y `TEXCOORD_2` de lo horneado opaco | −1,82 MB | ninguno |
| 3 | Comprobar `Content-Encoding` del GLB; si no, compactar instancias | hasta −1,15 MB | ninguno |
| 4 | Probar ETC1S q192–255 en catedral y pretiles contra los masters | −1,6 / −1,2 MB | a validar |
| 5 | Anillo de transición del suelo | +0,25–0,3 MB | arregla el corte |
| 6 | Reempaquetar por densidad fija en el siguiente rehorneado | sobre todo calidad y GPU | bajo |
| 7 | Luz por instancia en ventanas; luz por vértice en C y D | −0,8 y −0,3 MB | medio |

Los pasos 1 y 2 no tocan el horneado: son una reexportación del mismo GLB. El 5 se paga de sobra con lo que liberan.

Cualquiera de ellos cambia archivos publicados, así que lleva nombre de entrega nuevo (ver [entrega de la ciudad](../../decisiones/build/entrega-de-la-ciudad.md) y [recursos publicados](../../decisiones/build/recursos-publicados.md)). Los que tocan atlas cambian además los totales exactos de `unifiedManifest.test.ts`.

---

## Cómo se midió

Todo sobre `public/models/murcia-v5.2-lightmaps-r1.glb` y `public/textures/murcia/lightmaps-v5.2-r1/`.

- **Desglose del GLB.** Lectura del bloque JSON y suma de `bufferViews` por uso: los de `KHR_draco_mesh_compression`, los accesores de `EXT_mesh_gpu_instancing` y las imágenes.
- **Geometría.** Decodificada con el decodificador Draco que trae three (`examples/jsm/libs/draco/draco_decoder.js`) en Node, con la matriz de mundo de cada nodo compuesta desde sus padres y, en las instancias, con la de cada instancia.
- **Densidad de téxel.** Por triángulo, raíz del cociente entre su área en `TEXCOORD_1` (por la escala de `_LIGHTMAP_ST` en las instancias) y su área en el mundo. Por atlas, mediana ponderada por área. En los grupos con muchas instancias se muestrean 200 y se extrapola.
- **Ocupación.** Suma de áreas de triángulos en UV. No descuenta solapes ni cuenta el margen de dilatación.
- **Corte del suelo.** Los atlas se transcodificaron a PNG con `ktx extract --transcode rgba8` (KTX-Software 4.4.2). Un rasterizador propio dibujó los triángulos de los nodos `ground-*` en planta, a 7 px por metro, muestreando cada atlas con bilineal a la resolución del perfil de escritorio y multiplicando por `threeLightMapIntensity / π`. El salto es la diferencia relativa de luminancia entre dos franjas de 2 m, a 1 m de la línea por cada lado, fila a fila, descartando las filas con sombra.
- **Recodificación Draco.** Con el codificador que trae three (`draco_encoder.js`), codificación *edgebreaker*, a partir de los atributos decodificados. La cuantización original se leyó decodificando con las transformaciones de atributo omitidas. El nivel se fijó con `SetSpeedOptions(10 − nivel, 10 − nivel)`, como hace el exportador de Blender. La variante «mismos datos» cuantiza el color a 10 bits; con el color sin cuantizar la diferencia es del 0,3 %.
- **Compresión en tránsito.** `zlib` de Node: gzip a nivel 9 y Brotli a calidad 9 sobre el archivo entero; Brotli por defecto sobre cada bloque de instancias.
- **Códecs de textura.** `toktx --encode etc1s --qlevel N --clevel 5` y `libwebp` de ffmpeg sobre el PNG del UASTC entregado. PSNR con el filtro `psnr` de ffmpeg, sobre la imagen entera en RGB.

## Lo que no se hizo

- **No se vio la `.blend`:** Blender no estaba conectado. Lo que se dice del empaquetado sale de los atlas y de las UV del GLB.
- **No había masters** (EXR o PNG) en el disco: las cifras de códec son relativas al UASTC entregado.
- **No se cargó el sitio.** La coincidencia con la captura es por el render en planta, no por localizar el edificio en la escena.
- **No se comprobó la respuesta del despliegue** (`Content-Encoding`, `Content-Type`).
- **No se midió tiempo de decodificación ni memoria de GPU.**
- **No se ejecutó ningún check del repositorio:** no hubo cambios que comprobar.
- **No se generó ningún GLB ni KTX2 nuevo:** todas las variantes son tamaños medidos, no archivos entregables.
