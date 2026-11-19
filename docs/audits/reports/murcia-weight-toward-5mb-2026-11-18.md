# Murcia hacia un proyecto de menos de 5 MB: análisis

**Fecha:** 2026-11-18 · **Base:** `9bd74a4`, entrega `murcia-v5.2-lightmaps-r5`, árbol limpio · **Continúa:** el [informe de peso del proyecto del 2026-11-18](project-resource-budget-2026-11-18.md), que dejó la visita completa en 9,83 MB
**Guía:** ninguna; es un análisis a petición, no una pasada de `audits/website-performance-and-optimization.md`

Pregunta: el objetivo pasa a ser **todo el proyecto por debajo de 5 MB sin perder calidad visual**. ¿Dónde puede ceder la experiencia de Murcia, sabiendo que ya no basta con comprimir más y que puede hacer falta cambiar representaciones, métodos o formatos? Solo se analiza Murcia; la Tierra y lo compartido quedan fuera.

Se repartió en cuatro frentes: geometría del GLB, luz horneada, visibilidad desde las cámaras permitidas, y entrega y runtime.

No se modificó ningún archivo del repositorio, de `04_Assets` ni de Blender. Los scripts y datos de medición vivieron en una carpeta temporal de la sesión, fuera del repositorio, y no se conservan; el método de cada frente está en [Cómo se midió](#cómo-se-midió). **Ninguna variante se ha visto en la escena:** las cifras son de bytes o de métricas en espacio de atlas.

**Etiquetas.** *Medido*: archivo recodificado, bytes contados o navegador. *Leído*: código. *Estimado*: aritmética sin generar el archivo.

**Unidades.** MB son millones de bytes. «Resources» es `decodedBodySize`, como en el informe anterior: la compresión HTTP no la reduce. Cuando importa se da también la transferencia con Brotli q11, calculada sin servidor (*estimado*; no se comprobó contra la CDN de producción).

---

## 1. Resumen

- **Murcia sola no lleva el proyecto a 5 MB.** De los 9,835 MB de la visita completa, Murcia paga 5,23 y el resto unos 4,6. Para bajar de 5 MB en «resources», Murcia tendría que quedarse en unos 0,4 MB o la Tierra y lo compartido tendrían que recortar también.
- **Con todo lo encontrado, Murcia puede bajar a unos 2,0–2,8 MB.** El proyecto quedaría en 6,6–7,4 MB en «resources» y en torno a 5 MB en transferencia.
- **Sin cambio visible y sin rehornear hay unos −0,84 MB** (*medido* por partes). El grueso son las ventanas guardadas como registros de fachada.
- **Las ventanas son el mayor coste de la escena.** 21.870 instancias ocupan 612 KB en atributos (el 23 % del GLB), más su luz en los atlas `instances-*`, y dibujan 1,04 M triángulos por fotograma. En reposo miden 5–8 px: se ven como un patrón.
- **La mitad del Draco es la UV del lightmap** (`TEXCOORD_1`, 906 de 1.824 KB).
- **`CITY_B/C/D` son huellas extruidas** casi en su totalidad: candidatas a generarse en runtime.
- **Los lightmaps son casi monocromos**, pero ningún atlas admite 512 sin que se note.
- **Meshopt en lugar de Draco queda descartado con datos:** 3,3 veces más grande.

Nada de esto está aplicado.

---

## 2. Qué paga Murcia hoy (medido)

Recorrido del informe anterior: Chrome con Playwright, caché fría, escritorio 1600×900, 25 s en la Tierra, rechazar cookies, viajar con `.nav-control` y esperar 20 s. Dio 9.835.230 B en la visita completa, 9.405.176 B sin viajar y 8.598.048 B en móvil emulado, sin `pageerror`. Reproduce las cifras del informe anterior.

| Recurso | «Resources» (B) | Brotli q11 (B) | Cuándo se pide | ¿Lo paga quien no viaja? |
|---|---:|---:|---|---|
| GLB r5 | 2.615.876 | 1.767.634 | 3,5 s, en la Tierra | Sí |
| 20 lightmaps KTX2 a 1024 | 1.837.076 | 1.837.172 | 3,5 s | Sí |
| `lightmaps.json` | 23.597 | 4.588 | 3,5 s | Sí |
| Chunk `MurciaExperience` | 215.751 | 64.978 | 0,1 s, precargado en `/` | Sí |
| Chunk `createTraffic` | 8.470 | 3.382 | 13,6 s | Sí |
| Código de Murcia en otros chunks | ~4.500 | ~1.500 | 0,1 s | Sí |
| CSS de Murcia (dentro de `SceneCanvas-*.css`) | ~19.500 | ~3.800 | 0,5 s | Sí |
| Vehículos (6 GLB) | 19.920 | 13.525 | 13,6 s | Sí |
| Imagen de la torre (WebP) | 28.534 | 26.598 | 13,8 s | Sí |
| Efecto `district` | 18.816 | 15.214 | al abrirse el sonido | Sí |
| Música de Murcia (AAC-LC 81 kbps, 41,6 s) | 430.054 | 410.599 | tras viajar | **No** |
| **Total** | **≈ 5,23 MB** | **≈ 4,16 MB** | | 4,80 MB |

- **Los decodificadores no son coste de Murcia.** La Tierra pide Basis a 1,0 s y Draco a 1,4 s; la ciudad empieza a 3,5 s.
- **El cielo de Murcia es procedural** (`createSkyDome`, *leído*). Las `sky-panorama*` son de la Tierra.
- **Sin duplicados en Murcia.** Draco y Basis se piden una vez, ningún perfil baja las variantes de 2048 y los isotipos de Conócenos reutilizan las URL de los logos de la Tierra.
- **Sin depuración en producción:** ni `debug/` ni `observerDebug` aparecen en el chunk.
- **Composición del chunk `MurciaExperience`** (sourcemap de un build fuera del repositorio), en KB: `campus` 44,2, `landmark` 24,7, `blogDisplay` 21,8, `MurciaExperience.ts` 21,3, `assets` 19,7, `about` 17,8, `water` 10,8, GLSL 17,5, contenido generado 10,3. Ninguna dependencia pesada propia.

---

## 3. Geometría del GLB (medido)

### Anatomía

| Bloque | Bytes | % | Triángulos | B/tri |
|---|---:|---:|---:|---:|
| Instancias de ventanas (21.870 × TRS + ST) | 612.360 | 23,4 | — | — |
| `CITY_B_SIMPLIFIED` | 355.592 | 13,6 | 69.404 | 5,12 |
| `CITY_C_SIMPLIFIED` | 322.674 | 12,3 | 62.032 | 5,20 |
| Torre Vértigo + blog (24 primitivas) | 153.995 | 5,9 | 37.130 | 4,15 |
| `Edificios_Procedurales` (4 cuadrantes) | 145.615 | 5,6 | 19.403 | 7,50 |
| Teatro Romea | 137.041 | 5,2 | 33.296 | 4,12 |
| `CITY_D_SIMPLIFIED` | 133.798 | 5,1 | 20.092 | 6,66 |
| Catedral (estructura + fachada) | 127.674 | 4,9 | 35.560 | 3,59 |
| JSON | 115.344 | 4,4 | | |
| Pretiles (4) | 96.410 | 3,7 | 17.094 | 5,64 |
| Campus | 83.856 | 3,2 | 23.127 | 3,63 |
| Puentes | 56.432 | 2,2 | 12.288 | 4,59 |
| Estadios | 55.668 | 2,1 | 9.044 | 6,16 |
| Suelo (5 chunks con calles) | 52.000 | 2,0 | 7.914 | ~6,6 |
| Plaza de toros | 47.307 | 1,8 | 9.975 | 4,74 |
| Instancias de árboles (1.356) | 45.260 | 1,7 | | |
| Escultura, torres JMC | 45.220 | 1,7 | 14.109 | |
| PNG del trim, que el runtime descarta | 15.959 | 0,6 | | |
| Prototipos de ventana (3) | 1.793 | 0,1 | 166 | |

- **Draco:** 1.824.006 B en 99 primitivas, 371.720 triángulos y 613.096 vértices.
- **Draco por atributo** (recodificado quitando uno cada vez): `TEXCOORD_1` 906 KB (50 %), posición y conectividad 829 KB (46 %), `COLOR_0` 65 KB, `TEXCOORD_0` colapsado 13 KB.
- **Instancias por atributo:** `TRANSLATION` 279.636 B, `_LIGHTMAP_ST` 186.424 B, `ROTATION` 182.832 B, `SCALE` 11.484 B.
- **Precisión sobrante:** las 50 primitivas que siguen a 18 bits pesan 1,23 MB, con pasos reales de 0,2 a 4,6 mm (los cuadrantes A2 a 0,83 mm). El criterio de r5 es 4,8 mm.
- **Brotli** reduce el Draco solo un 11 % (1.824 → 1.624 KB) y las instancias a 128 KB. Las mejoras en instancias cambian poco la transferencia.

### Redundancia encontrada

- **Ventanas generadas por regla.** 2.499 fachadas, 9 ventanas de mediana, 3 filas en el 94 % de los casos. El 96 % son rejillas completas. Las 1.907 fachadas exteriores encajan en una pared de `CITY_*` con márgenes simétricos y la primera fila a 8,00 m de la base. Las celdas ST forman una rejilla exacta por atlas (error de 0,012 téxel).
- **Edificios exteriores paramétricos.** `CITY_B/C/D` son 2.325 edificios con 27.636 puntos de huella. El 64 % son prismas puros (en D, 747 de 780). Casi todos los demás son huella, altura y una cornisa constante (niveles a −0,50, −0,32 y −0,15 m de la cubierta). Solo 108 no siguen el patrón. En `CITY_*` no hay piezas repetidas: cada edificio es único.
- **Caras que nunca se ven.** Tapas de base en `CITY_*`: 24.151 triángulos. Cara inferior de los pretiles: el 25 % de sus triángulos. El material principal es `doubleSided`, así que hoy también se rasterizan.
- **Repeticiones sin instanciar en hitos.** Teatro Romea: 1.658 piezas con 184 formas, el 75 % de sus triángulos son repeticiones. Puente de piedra: 89 %. Fachada de la catedral: 51 %.
- **Atributos.** `NORMAL` solo está en las 7 primitivas sin hornear o de vidrio. `COLOR_0` tiene de 1 a 20 valores distintos por malla. Quitar del JSON las cifras sobrantes de los floats y los `extras` que nadie lee (`lm_prototype`, `source_prototype`, `contract`) ahorra 9.931 B.
- **El suelo y las calles suman ~52 KB.** Generarlos desde una red vectorial no compensa: su peso está en los atlas.

### Meshopt frente a Draco

Con la misma precisión que r5 y el códec v0, el único que decodifica three 0.174: **5,98 MB frente a 1,82 MB de Draco** (3,3 veces), y 2,87 MB incluso con Brotli. Solo `TEXCOORD_1` ocupa 1,78 MB en meshopt. Ahorraría unos 225 KB de decodificador y añadiría unos 4,1 MB.

---

## 4. Luz horneada (medido)

PSNR siempre **solo sobre los téxeles que pisa algún triángulo**, en sRGB de 8 bits, contra el máster PNG 1024 de r1. La recodificación q128 reproduce los bytes publicados (static-NW: 119.144 B).

| Atlas | B | Mapeado / anillo / vacío % | Negro dentro de lo mapeado % | téx/m | dB publicado | dB luminancia + tinte global | ETC1S 512: B / dB | AVIF crf32: B / dB |
|---|---:|---|---:|---:|---:|---:|---|---|
| static-NW | 119k | 61/32/7 | 20 | 1,6 | 35,5 | 41,0 | 40k / 27,6 | 78k / 36,9 |
| static-NE | 110k | 30/17/52 | 7 | 1,2 | 35,7 | 39,1 | 41k / 30,1 | 63k / 36,7 |
| static-SE | 87k | 51/11/38 | 3 | 2,9 | 35,4 | 38,9 | 40k / 30,9 | 42k / 39,3 |
| static-SW | 96k | 39/13/49 | 5 | 1,9 | 37,2 | 40,8 | 39k / 31,3 | 46k / 38,3 |
| ground-NE | 77k | 73/1/27 | 36 | 4,0 | 39,2 | 46,7 | 31k / 31,9 | 22k / 40,7 |
| ground-NW | 68k | 66/1/33 | 49 | 3,7 | 38,7 | 48,9 | 31k / 30,5 | 25k / 40,1 |
| ground-SE | 64k | 44/3/52 | 42 | 2,8 | 37,6 | 45,9 | 31k / 27,7 | 24k / 39,7 |
| ground-SW | 56k | 30/3/67 | 37 | 2,3 | 36,3 | 45,0 | 32k / 26,6 | 24k / 38,1 |
| ground-Outer | 69k | 37/3/60 | 16 | 0,5 | 33,0 | 40,8 | 33k / 25,9 | 38k / 35,9 |
| outer-ring-b | 127k | 47/49/3 | 11 | 0,7 | 29,3 | 40,3 | 40k / 20,5 | 163k / 33,1 |
| outer-buildings | 90k | 41/56/3 | 12 | 0,4 | 25,0 | 39,8 | 39k / 19,4 | 190k / 32,8 |
| instances-main-0 | 153k | 29/19/53 | 4 | 2,3 | 31,7 | 37,8 | 41k / 24,3 | 101k / 32,8 |
| instances-main-1 | 134k | 30/19/51 | 0 | 4,1 | 32,8 | 38,5 | 41k / 26,0 | 86k / 33,6 |
| instances-main-2 | 105k | 21/12/67 | 4 | 3,1 | 32,7 | 39,2 | 31k / 24,0 | 71k / 32,9 |
| instances-outer-0 | 96k | 39/38/22 | 6 | 2,2 | 30,4 | 41,7 | 38k / 25,4 | 142k / 32,3 |
| instances-outer-1 | 83k | 37/31/33 | 6 | 1,8 | 28,9 | 42,2 | 35k / 24,9 | 134k / 32,1 |
| rooftop-parapets | 89k | 24/30/46 | 13 | 3,7 | 37,5 | 36,5 | 28k / 25,9 | 75k / 35,5 |
| landmark-cathedral | 97k | 32/16/52 | 26 | 5,4 | 37,0 | 39,2 | 39k / 31,6 | 51k / 38,7 |
| landmark-vertigo-blog | 61k | 4/6/90 | 28 | 1,5 | 37,4 | 40,2 | 34k / 29,9 | 22k / 35,3 |
| landmark-campus | 46k | 8/4/88 | 61 | 1,2 | 38,3 | 47,1 | 29k / 27,1 | 15k / 37,5 |

«Anillo» es lo mapeado dilatado 3×3, lo que el filtrado bilineal llega a leer.

- **Qué cubre cada atlas.** Cada chunk central de suelo es un quad de 2 triángulos. `static-*`: los procedurales de su cuadrante, el Romea, el estadio y los puentes. `outer-*`: `CITY_B/C/D`. `instances-main-0`: 678 árboles, el mobiliario de Belluga, el muro del río y 871 ventanas. El resto de `instances-*`: solo ventanas.
- **Ocupación.** De 20,97 M téxeles, 7,79 M están mapeados y 3,82 M son anillo; solo 6,26 M son mapeados y no negros. En el suelo central, entre el 36 y el 49 % de lo mapeado queda bajo los edificios. En `outer-ring-b`, `outer-buildings` e `instances-outer-*` las islas miden 1–3 téxeles y el anillo pesa casi tanto como la isla: reempaquetarlos no da nada.
- **Ventanas.** Main: celda de 16,3×16,3 téxeles, 4,2 téx/m. Outer: celda de 8,7×8,7, 1,5–2,2 téx/m.
- **Crominancia.** Casi monocromo cálido: luminancia más un tinte global por atlas da 36,5–48,9 dB, por encima del error del códec actual salvo en los pretiles. Un tinte por nodo apenas suma (+0–0,6 dB).
- **Frecuencia.** Entre el 74 y el 94 % de la varianza de luminancia está a escalas de 4 téxeles o más en suelo, estáticos y catedral. Los atlas outer, de instancias y de pretiles son de alta frecuencia (40–56 % por debajo).
- **Luz analítica no la reconstruye.** Sol, hemisférica y una luz puntual ajustada explican solo el 2–9 % de las medias por cara (R² 0,02–0,09). Un valor constante por cara explica el 70–91 % de la varianza en log.
- **Mips.** Un nivel es correcto: en reposo casi todo queda entre 0,4 y 1,25 téxeles por píxel. La cadena completa costaría un 29–42 % más de bytes y reabriría el sangrado entre islas.
- **Referencia perceptiva.** El paso 2048 → 1024 que se aprobó sin ver diferencia equivale a 26–36 dB. El paso 1024 → 512 da cifras parecidas en suelo, estáticos y catedral, y 5–6 dB peores en outer y pretiles.

---

## 5. Visibilidad desde las cámaras permitidas (medido)

Las cámaras salen de la matemática del repositorio (`applyPoseToCamera`, `scalePoseDistance`, `murciaZoomPose`, `resolveCameraPose`, `resolveZoomFar`, `murciaArrivalPose`, `solveAboutStops`, `campusMobileFraming`): 4.904 generadas, 1.604 rasterizadas con un z-buffer por software y 750 de control.

- **Navegación:** FOV 35°. Escritorio de 198 m a 42° (cerca) a 600 m a 60° (lejos), reposo a 440 m. Móvil: reposo a 570 m, lejos a 700 m. Distancia mínima al foco: 138,6 m en escritorio y 179,6 m en móvil.
- **Secciones:** campus a 54,7 m (escritorio) y 87,6 m (móvil) del lago; Conócenos entre 34 y 99 m; blog a unos 30 m del panel.
- **Móvil:** `SceneCanvas` limita el `dpr` a 2, así que se rasteriza a 824×1830.

### Por atlas

| Atlas | Distancia mínima nav / global (m) | px por téxel p50, escritorio DPR 1 | p50 / p99, móvil DPR 2 | Contraste medio tras niebla |
|---|---|---:|---|---:|
| ground-NE / NW | 90 / 90 | 3,5 / 3,7 | 5,5 / 5,9 | 1,0 |
| ground-SE / SW | 89/37 · 90/55 | 4,9 / 6,0 | 7,7 / 9,4 | 1,0 |
| ground-Outer | 90 / 49 | 27 | 42 / 42 | 0,68 |
| static-NE / NW / SE / SW | 66–70 / 15–67 | 5,1–12 | 7,1–16 / 9,9–23 | 0,93–1,0 |
| rooftop-parapets | 66 / 12 | 3,7 | 5,0 / 14 | 1,0 |
| landmark-vertigo-blog | 38 / 30 | 8,2 | 12 / 29 | 1,0 |
| landmark-cathedral | 56 / 56 | 2,4 | 2,8 / 5,1 | 1,0 |
| landmark-campus | 92 / 32 | 11 | 16 / 19 | 1,0 |
| outer-ring-b | 61 / 9 | 18 | 22 / 45 | 0,91 |
| outer-buildings | 82 / 82 | 7,6 | 11 / 33 | 0,47 |
| instances-main-0 / 1 / 2 | 73–76 | 3,0–3,9 | 3,8–5,2 / 6,5–16 | 1,0 |
| instances-outer-0 / 1 | 73 | 2,7 / 3,8 | 3,5–4,7 / 11–16 | 0,55–0,58 |

**Ningún atlas baja de 0,25 px por téxel: todos se ven ampliados.** Bajar a 512 solo se justificaría por contenido suave o por niebla: `ground-Outer` (16 % de su UV con contraste < 0,1), `outer-buildings` e `instances-outer-*`, donde la niebla de altura quita la mitad del contraste.

### Por familia de geometría

| Familia | Distancia mínima nav (m) | mm por px en esa distancia: escritorio DPR 1 / móvil DPR 2 | % tris que nunca ganan un píxel |
|---|---:|---|---:|
| `CITY_B` | 61 | 43 / 33 | 15 |
| `CITY_C` | 82 | 57 / 54 | 16 |
| `CITY_D` | 315 | 221 / 139 | 36 |
| Torre Vértigo | 38 | 27 / 27 | 17 |
| Catedral + fachada | 56 | 39 / 33 | 28 |
| Teatro Romea | 71 | 50 / 36 | 52 |
| Árboles | 96 | 67 / 44 | 8–19 |
| Ventanas, centro | 73 | 51 / 36 | 9–11 |
| Ventanas, anillo exterior | 72 | 51 / 36 | 17–19 |

- **Solo el 0,24 % de los triángulos está oculto con seguridad.** El 18 % nunca gana un píxel en las muestras: es una cota superior que aún no converge (pasó del 21,4 al 18,0 % al doblar los giros). Son sobre todo medianeras y astillas: en los procedurales, el 37 % de los triángulos pero el 2,8 % del área.
- **Ventanas.** En reposo una ventana mide unos 5 px en escritorio DPR 1 y unos 8 px en móvil; lejos, 4–7 px. Solo en el acercamiento máximo sube a 17–26 px de mediana (43–106 px de máximo). Con 30, 56 u 80 triángulos por ventana, el relieve real (0,12–0,47 m) sale a 2–10 px como mucho.
- **`CITY_D`** nunca está a menos de 315 m y además tiene niebla: candidata a volumen simple o silueta. `CITY_B` y `CITY_C` no, porque están junto a la placa.
- **Cuantización tolerable** (*estimado*, medio píxel en la distancia mínima en móvil DPR 2): instancias 7–8 bits, hitos 12–13, placa 14, `CITY_*` 15–16. Las poses del campus suben esto 2–3 bits porque la cámara pasa a 9–15 m de azoteas.
- **Cada triángulo de los tres prototipos de ventana se ve en alguna instancia:** no hay recorte posible ahí.

**Discrepancia con el apartado 4.** Aquí el suelo central sale con un 0–1,9 % de UV que nunca se muestra; allí, un 36–49 % de lo mapeado queda negro bajo los edificios. La visibilidad se mide por triángulo (un quad visible cuenta entero) y la luz por téxel. Vale la cifra por téxel; ETC1S ya comprime casi gratis esas zonas negras, así que el ahorro de recortarlas es pequeño.

---

## 6. Oportunidades

### A. Sin cambio visible y sin rehornear: ≈ −0,84 MB (medido)

| Cambio | Ahorro | Dónde se hace |
|---|---:|---|
| Ventanas como registros de fachada (22 B por fachada), 730 ventanas explícitas y celda ST de 2 B; el runtime reconstruye las matrices con error ≤ 1,7 mm y 0,003° | −507 KB (106 frente a 612 KB) | entrega y runtime, con un accesor nuevo en `extras` como `instance_st_accessor` |
| Quitar las tapas de base de `CITY_*` y la cara inferior de los pretiles y de los cuadrantes A2 | −154 KB | entrega |
| Reempaquetar islas en los atlas estáticos y de landmarks (campus y blog en uno) | −99 KB (−1,5 dB a q128) | atlas más UV1 o ST por malla |
| Rejilla de cuantización común con juntas cerradas: 1 cm en `CITY_*`, 5 mm en A2 y pretiles | −44 KB sobre lo anterior | entrega (`SetAttributeExplicitQuantization`) |
| Sin PNG del trim, JSON recortado y `lightmaps.json` minificado | −33 KB | entrega; revisar `IMAGE_CEILING` y `dropEmbeddedTrim` |

La rejilla común se infirió de rejillas por primitiva; no se ha codificado. Las ventanas como registros exigen una entrega con nombre nuevo y código de runtime.

### B. Cambio de formato o de representación, con revisión en escena: ≈ −1,0 a −1,3 MB adicionales

| Cambio | Ahorro | Riesgo |
|---|---:|---|
| Lightmaps en AVIF de luminancia, subidos como textura R8 más un tinte | −533 KB (*medido*) | Bajo en píxel. **GPU:** 1 MiB por atlas frente a unos 0,5 en ETC2; en móvil de unos 10 a unos 16 MiB, contra el límite de memoria de iOS ya documentado. Falta el tiempo de decodificación en móvil |
| Ventanas exteriores con un color por instancia (`_COLOR_0`, que three convierte en `instanceColor`) y el patrón del prototipo en su `COLOR_0`, en lugar de la celda de atlas | ≈ −250 KB; unos −0,2 MB netos sobre A | Medio-bajo: 26,6–27,0 dB frente a 28,9–30,4 |
| Luz por vértice en `CITY_C` y `CITY_D`, sin UV1 | −132 KB (Draco −42, atlas −90) | Medio: 21,1 dB frente a 25,0, más suave y sin bloques de ETC1S |
| Música de Murcia: bucle de ~21 s, o reutilizar la de la Tierra | −215 KB / −430 KB | Decisión creativa; solo la paga quien viaja con sonido |

Variante de AVIF en RGBA 4:4:4 en los 15 atlas donde iguala o mejora el PSNR publicado: −611 KB, pero 4 MiB de GPU por atlas.

### C. Rehornear y ciudad exterior paramétrica: ≈ −0,7 a −1,2 MB adicionales (estimado)

| Cambio | Ahorro |
|---|---:|
| `CITY_*` paramétrica: huellas, altura, tipo de cornisa y paleta, generada en un worker, con UV de lightmap determinista y rehorneado sobre esa misma geometría | −470 KB (653 → ~180 KB) |
| Ventanas por regla de pared y paso, sin registros (la regla exacta hay que leerla en la `.blend`) | −60 a −100 KB |
| Instanciar las repeticiones del Romea, el puente y la fachada de la catedral | −60 a −110 KB |
| AVIF de luminancia más agresivo (crf40) en los atlas suaves | hasta −0,5 MB, riesgo medio |
| Rehorneado a densidad fija en téx/m, suelo recortado bajo los edificios, fachadas de `CITY_B` en tiras | −10 a −20 % de la luz |

Coste en CPU (*estimado*): reconstruir 21.870 matrices son unos pocos milisegundos; triangular 2.325 huellas, 20–50 ms en un worker.

### Fuera del GLB y los lightmaps

| Cambio | Ahorro | Decisión que requiere |
|---|---:|---|
| Transcodificador Basis mínimo, solo ETC1S (los 47 KTX2 publicados lo son) | −0,2 a −0,38 MB, compartido con la Tierra (*estimado*) | Cambiar la regla de copia exacta de three ([compresión y decodificadores](../../decisiones/build/compresion-y-decodificadores.md), punto 3) por un build documentado con test de hash |
| Cargar la ciudad por intención de viaje | −4,80 MB para quien no viaja; **0 en la visita completa** | Revocar la precarga en la apertura; el primer viaje espera unos 2–4 s a 10–20 Mbps (*estimado*) |
| Retrasar efectos, vehículos, tráfico y torre hasta el aterrizaje | −0,08 a −0,15 MB solo para quien no viaja | — |
| Música en Opus con fallback | VBR 64: sin ganancia; VBR 48: −118 KB, sin escuchar | Sería la tercera generación con pérdida; el soporte en iOS hay que verificarlo |
| No publicar `draco_decoder.js` (512 KB, nunca se pide) | 0 en la visita; solo despliegue | Excepción a la copia exacta |
| Partir el chunk de Murcia | 0 en la visita completa | No recomendado: tirones al construir |

**Para las instancias que se van a añadir:** hoy cuesta 28 B cada una (12 + 8 + 8). Con traslación cuantizada, guiñada en u16 y celda en u8×2 serían unos 12 B (*estimado*); si siguen una regla o una rejilla, lo que compensa son parámetros.

### Descartado con datos

| Opción | Por qué |
|---|---|
| Meshopt en lugar de Draco | 3,3 veces más grande (apartado 3) |
| Lightmaps de fondo a 512 | −280 KB, pero 19–26 dB: las ventanas pierden la forma. El color por instancia y la luz por vértice (nivel B) ahorran parecido con menos pérdida |
| UASTC con RDO y Zstd | 264–525 KB por atlas |
| WebP para lightmaps | Siempre peor que AVIF |
| ETC1S solo de luminancia | −8 % |
| Dos o tres atlas monocromos en los canales de un ETC1S | Sin ahorro: un solo endpoint por bloque |
| AVIF en los atlas de islas diminutas | 134–190 KB a crf32, más que el ETC1S actual |
| Luz analítica en el shader | Explica el 2–9 % de la iluminación |
| ETC1S q64 en todo | −255 KB, pero −1,5 a −4,5 dB |

---

## 7. Hasta dónde baja Murcia

| Escenario | GLB | Luz | Resto | Murcia | Proyecto («resources») |
|---|---:|---:|---:|---:|---:|
| Hoy | 2,62 | 1,84 | 0,78 | 5,23 | 9,83 |
| A | 1,88 | 1,74 | 0,77 | ≈ 4,4 | ≈ 9,0 |
| A + B | ≈ 1,7 | ≈ 0,95 | ≈ 0,35–0,55 | ≈ 3,0–3,2 | ≈ 7,6–7,8 |
| A + B + C | 1,1–1,3 | 0,6–0,7 | ≈ 0,35 | ≈ 2,0–2,4 | ≈ 6,6–7,0 |

Se descontaron los solapes: los registros de fachada ya compactan la celda ST, la ciudad paramétrica absorbe la luz por vértice de `CITY_C/D`, y el color por instancia de las ventanas se cuenta neto sobre A. En transferencia, A + B + C deja el proyecto en torno a 5 MB; en «resources», no.

## 8. Decisiones abiertas

1. **Qué cifra mide el objetivo de 5 MB:** «resources» o transferencia, y si cuenta la visita completa o la que se queda en la Tierra. Cambia qué es alcanzable.
2. **Si se acepta más memoria de GPU a cambio de AVIF** en los lightmaps.
3. **Las decisiones creativas:** la música de Murcia y si el primer viaje puede esperar a que cargue la ciudad.
4. **Si se reabre la entrega de Blender** para la ciudad paramétrica y el rehorneado.

El primer paso con mejor relación entre ahorro y riesgo es el nivel A.

---

## Hallazgos de paso, sin corregir

- **Un build con `--outDir` puede escribir en el `dist/` del repositorio.** `blogRoutes()` (`vertigo-blog-routes`) usa `outDir = 'dist'` fijo y lee `dist/blog.html`. En esta pasada falló antes de escribir, así que el build fuera del repositorio no tiene las páginas del blog ni `generated/blog-preview.json`.
- **Campus en móvil.** En varios azimuts (0°, 60°, 120°, 270–330°) la cámara a 87,6 m queda a 8–10 m de edificios de `CITY_B`, y en el render de profundidad los tejados tapan el lago. En escritorio, a 30°, la cámara pasa a 4 m de un pretil. No se verificó en el navegador.
- **Suelo de `murciaConfig`.** El GLB llega a X [−880, 380] y Z [−322, 933], pero `GROUND` declara [−1417, 752] × [−620, 1305] y `groundObjectName` es null. `check:footprint` podría estar razonando sobre suelo que ya no existe.
- **Nodos sueltos `Ventana-001/002/003`:** 166 triángulos, el 90 % oculto con seguridad.
- **Triángulos sobrantes en prototipos:** unos 20–24 en los troncos 01/02 y 17 en la silla Belluga no se ven en ninguna instancia.

## Cómo se midió

- **Geometría.** El GLB r5 se decodificó con el Draco de three 0.174 en Node. El coste por atributo sale de recodificar cada primitiva quitando un atributo cada vez, con la misma cuantización. Meshopt con meshoptimizer 0.18.1 de `node_modules`, códec v0. Las ventanas se agruparon por fachada a partir de las matrices y de la pared de `CITY_*` que las contiene, y el códec de registros se prototipó midiendo el error de reconstrucción. El encoder de Draco de three se cuelga si se le hace `await`, porque el módulo expone un `then`.
- **Luz.** Se rasterizó la UV1 de cada receptor, con el `_LIGHTMAP_ST` de cada instancia, sobre una rejilla de 1024 con 4×4 muestras por téxel. Las variantes (ETC1S, UASTC, AVIF y WebP) se codificaron desde los másteres de r1; las de menor resolución se reescalaron en bilineal antes de comparar. El ajuste de luz analítica es una regresión sobre las medias por cara.
- **Visibilidad.** La matemática de cámara del repositorio se empaquetó con esbuild para generar la envolvente. Cada cámara se rasterizó con un z-buffer por software a resolución real. «Oculto seguro» exige que ningún píxel de la caja ampliada 1 px esté más lejos que el triángulo; «gana píxel» se muestrea en el centro, así que subpíxeles y coplanares cuentan como no vistos. No se modelaron como oclusores el faldón, el tráfico, el panel del blog, el agua ni el vidrio; los materiales `doubleSided` no permiten descartar caras traseras. La niebla se evaluó en el vértice menos afectado de cada triángulo.
- **Entrega.** Build de producción fuera del repositorio con `VITE_VERCEL_ENV=production` en el shell, servido con `vite preview` y medido con Playwright y caché fría. La composición del chunk sale de un sourcemap generado solo en ese build. Brotli q11 calculado sin servidor. Se lanzó Chrome con `--autoplay-policy=no-user-gesture-required`, así que en «sin viajar» el sonido se abre a los 13,3 s, igual que en el informe anterior.

No se ejecutaron tests ni harnesses del repositorio durante el análisis, ni se probó en un Android o un iOS reales.
