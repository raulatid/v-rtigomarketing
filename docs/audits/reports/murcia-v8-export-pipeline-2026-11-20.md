# Murcia v8: cómo se exportan pretiles, ventanas y props de tejado

**Fecha:** 2026-11-20 · **Base:** `81f1f6b` con la entrega `murcia-v8` instalada sin commit en el árbol (`public/models/murcia-v8.glb`, `public/textures/murcia/lightmaps-v8/` y cambios en `src/experiences/murcia/assets/`) · **Continúa:** el [plan 030](../../plans/030-murcia-v6/README.md) y el [informe hacia 5 MB del 2026-11-18](murcia-weight-toward-5mb-2026-11-18.md), cuyas cifras eran de r5
**Guía:** ninguna; es un análisis a petición, no una pasada de `audits/website-performance-and-optimization.md`

Pregunta: la última exportación de Murcia tuvo errores en los pretiles, las ventanas y los assets de los tejados. ¿Cómo se están exportando, son los mejores métodos, qué alternativas hay y qué aportarían? El criterio es la mejor relación calidad/peso para web.

Se leyó la cadena de `04_Assets/3D-assets/ciudad-de-murcia/murcia-v8/` (`prepare.py`, `common.py`, `bake.py`, `export.py`, `tools/post.cjs`, `compress.py`) y el material de runtime (`lightmapMaterial.ts`). Se midieron `export-raw.glb`, el GLB entregado y los másteres PNG de 1024.

No se modificó ningún archivo del repositorio, de `04_Assets` ni de Blender. Los scripts de medición vivieron en una carpeta temporal de la sesión, fuera del repositorio, y no se conservan; el método está en [Cómo se midió](#cómo-se-midió). **Nada se ha visto en la escena:** las cifras son bytes o métricas en espacio de atlas.

**Etiquetas.** *Medido*: bytes contados o métrica calculada sobre los archivos. *Leído*: código. *Estimado*: aritmética sin generar el archivo.

---

## 1. Resumen

- **Los tres errores tienen la misma causa.** La cadena usa un solo método para todo: cada superficie tiene su propia zona en un atlas de lightmap (las «islas»), leída con una segunda UV. Ese método falla cuando la pieza es más pequeña que un téxel, y pretiles, ventanas y props lo son. El cambio de margen de los props en la tercera sesión del plan 030 trató el síntoma.
- **Hay una regresión que sigue en la v8:** `Ventana-003`, unas 3.940 ventanas, lee negro en el 29 % de sus triángulos en el centro y en el 46 % en el anillo exterior. En r5 ese mismo atlas daba 0 %.
- **Por peso, el problema no son los props sino las ventanas y `CITY_B/C`** (tabla en §2).
- **Hay métodos con mejor calidad y menos peso.** Estimo unos −0,7 MB (Murcia en unos 3,3 MB frente a 3,98) y la desaparición de los negros. No está generado ni visto.

Nada de esto está aplicado.

---

## 2. Qué se entrega hoy (medido)

Entrega v8: GLB 1.983.132 B + lightmaps 2.000.812 B ≈ **3,98 MB**. r5 era 2,62 + 1,84 = 4,46 MB.

| Familia | GLB | Lightmaps | Total | Parte de Murcia |
|---|---:|---:|---:|---:|
| `CITY_B/C` (incluye sus pretiles) | 661 KB | 248 KB | **0,91 MB** | 23 % |
| Ventanas (prototipos, registros de fachada y su parte de los atlas `instances-*`) | 85 KB | ≈ 466 KB | **≈ 0,55 MB** | 14 % |
| Pretiles de los procedurales (`Rooftop_Parapets__Q`) | 82 KB | 117 KB | **0,20 MB** | 5 % |
| Props de tejado y de calle | 26 KB | ≈ 20 KB | ≈ 0,06 MB | 1,5 % |

Otros bytes del GLB: procedurales 143 KB, atributos de instancia 89 KB, JSON 141 KB. Los registros de fachada (8 float32 por registro) suman 83.168 B.

### Cómo se exporta cada familia (leído)

| Familia | UV1 | Atlas | Margen de horneado |
|---|---|---|---|
| Estáticos y suelo | `smart_project` a 66° y `pack` | por zona | `pad//2` escalado a `size/2048` |
| `static-NW`, `outer-buildings` (`CITY_C`), `outer-ring-b` (`CITY_B`) | `face_rect_layout`: un rectángulo por cara, mínimo 4 px a 2048, separación 4 px | propio | 2 px |
| Pretiles procedurales | etiquetados `Web_Parapet` en Geometry Nodes, separados a `Rooftop_Parapets__Q` | `rooftop-parapets`, máster 4096 | 2 px |
| Prototipos de ventana | `unwrap` con margen 0,04 | rejilla de instancias: centro 50×50, exterior 86×86 | 4 px (exterior 2) |
| Prototipos de props (15 formas con máscara `_TONE`) | `unwrap` con margen 0,01 | misma rejilla | igual |

Los másteres son de 4096 (catedral, `rooftop-parapets`, `static-NW`) o 2048, y se reducen a 1024 con `image.scale`. ETC1S a 1024 con un solo mip y el `qlevel` de r5 por atlas. Horneado con Cycles HIP, difusa directa e indirecta sin albedo, 64 muestras.

### Qué está bien y conviene conservar

- La cadena se rehace desde cero y comprueba con hashes que la `.blend` fuente no cambia (D12 del plan 030).
- Tras Draco se compara triángulo a triángulo y se detectan las juntas entre piezas.
- Las ventanas viajan como registros de fachada; los props comparten forma y llevan un tono por instancia.
- Las ventanas en niebla (≥ 0,8) se quitan por regla: 2.741 menos.
- Draco usa los bits mínimos por primitiva: paso de 4,8 mm, o ≤ 1 mm con al menos 18 bits en primitivas con juntas; UV1 a 1/8 de téxel.

Lo que falla es **cómo se reparte la luz**, no la exportación.

---

## 3. Qué falló y por qué (medido)

### 3.1 Pretiles de los procedurales

- **Todas las islas miden exactamente 1 px de lado corto a 1024** (unas 3.970). El pretil tiene unos 0,4 m de alto y de grueso y va a 2,5 téx/m: el atlas no guarda la luz del pretil, solo una línea de 1 px. Es el peor PSNR de los atlas centrales: 29,8 dB, y eso a q192.
- **Ocupación del 8,8 %.** La cara superior de cada pretil es un anillo hueco con la forma del tejado y el empaquetador la trata como su rectángulo envolvente: el 91 % del atlas queda vacío.
- El negro ya está en el 0,2 %, así que lo que se ve mal es la falta de resolución, no huecos de horneado.

### 3.2 Pretiles y cornisas de `CITY_B/C`

- `face_rect_layout` funciona: solo queda un 1,1 % (`B`) y un 0,8 % (`C`) de triángulos en negro.
- El precio es alto:
  - **El 91 % de las caras de `CITY_B` son finas** y se agrandan al mínimo de 2 px. **Se llevan el 69 % de los téxeles y cubren el 16,7 % de la superficie.** En `CITY_C`, 89 % de las caras, 64 % de los téxeles y 13,4 % de la superficie.
  - Un rectángulo por cara separa todos los vértices: **1,96 vértices por triángulo**. Draco no aprovecha la conectividad y sale a 5,9 B por triángulo (la catedral va a 1,03 vértices por triángulo). Por eso quitar las tapas de base apenas ahorró en `CITY_B/C`: unos 17 KB frente a r5.
  - Lo mismo en `static-NW`: Teatro Romea a 2,01 y `Edificios_Procedurales__NW` a 1,94 vértices por triángulo.
- Atlas: `outer-ring-b` 145 KB a q128 (30,8 dB); `outer-buildings` 103 KB a q32 (25,7 dB).

### 3.3 Ventanas

- **`Ventana-003` en negro.** Los props pasaron a margen 0,01, pero las ventanas siguen con 0,04 (`prepare.py`, llamada a `unwrap` de prototipos). La v8 dejó de promediar la escala de islas (`average_islands_scale`), así que los marcos finos se quedan con islas diminutas: **mediana de 0,05 px** dentro de una celda de 15 px. El horneado no las rasteriza y el runtime lee fondo negro.
  - Afecta al 29 % de sus triángulos en `instances-main` y al 46 % en `instances-outer`, siempre en triángulos de menos de un téxel. `Ventana-001/002` están en el 1–5 %.
  - Por atlas: `instances-outer-1` lee negro en el 13,5 % del área (6 % en r5) y `instances-main-1` en el 6,6 % (0 % en r5).
- **`Ventana-001/002` tampoco tienen luz útil propia.** Entre el 67 y el 93 % de sus triángulos caen en menos de un téxel; la ocupación del prototipo en su celda es del 10–27 %.
- **Las celdas repiten el mismo patrón.** Cada celda es el dibujo del prototipo con un brillo por fachada. Se guardan 10–15 px de luz por ventana, y en reposo una ventana mide 5–8 px en pantalla.
- **Coste de su luz:** unos 466 KB de los atlas de instancias (`instances-outer-0/1` 178 KB; `instances-main-0` ≈ 96 % ventanas, `instances-main-1` ≈ 90 %).

### 3.4 Props de tejado

- Con el margen 0,01 ya no salen negros enteros, pero **entre el 64 y el 100 % de sus islas siguen por debajo de 1 px** en su celda de 15,5 px.
- Triángulos que leen negro: `extractor_caja` 17,7 %, `chimenea_obra` 8,6 %, `conducto` 8 %, `condensadora` 6,1 %, el resto 1–5 %. Parte son bases apoyadas que no se ven. La luz que reciben es un promedio ruidoso.
- **Están bien apoyados.** Ninguno de los 419 props de tejado tiene un vértice de pretil a menos de 0,6 m: el más cercano está a 1,29 m (mediana 3,81 m) y siempre a la misma altura. El snap no los deja sobre los bordes.

---

## 4. Alternativas por familia

Regla general: **si el lado corto de una pieza mide menos de unos 2 téxeles al tamaño entregado, no debe ir en un atlas.** Para esas piezas, guardar la luz en los vértices cuesta menos que su `TEXCOORD_1`, que en r5 era la mitad de todo el Draco, y no deja negros. Cycles hornea directamente a un atributo de color (`target='VERTEX_COLORS'`), sin UV, sin empaquetar, sin márgenes y sin reescalar.

### 4.1 Ventanas: luz factorizada en lugar de una celda por ventana (mayor ahorro)

Se midió si «un patrón común por prototipo × k valores por ventana» reproduce los másteres. PSNR en espacio de atlas, 12×12 muestras por celda (penaliza márgenes y fase, así que es pesimista):

| Atlas / prototipo | k=1 | k=2 | k=3 | k=4 | KTX2 entregado |
|---|---:|---:|---:|---:|---:|
| centro `Ventana-001` | 27,1 | 28,5 | 29,9 | 30,8 | 34,1 |
| centro `Ventana-002` | 22,9 | 24,6 | 25,9 | 27,5 | — |
| centro `Ventana-003` | 19,9 | 22,5 | 24,4 | 25,5 | — |
| exterior `Ventana-001` | 25,4 | 26,9 | 28,2 | 29,5 | 26,4 |
| exterior `Ventana-002` | 24,9 | 26,1 | 27,7 | 28,9 | 25,9 |
| exterior `Ventana-003` | 22,3 | 24,9 | 26,6 | 28,2 | — |

- Un color RGB por ventana no mejora nada (+0,1 dB): la luz es monocroma, así que basta **un byte por coeficiente**. La media plana de la celda da 18–23 dB.
- En el anillo exterior, k=2 ya iguala lo entregado.
- **Cómo:** hornear a color por vértice el lote de instancias que ya monta `instance_mesh.py`; factorizar por prototipo con SVD (k atributos por vértice en el prototipo y k bytes por ventana); sumar en el vertex shader, como hoy el tono.
- **Ahorro estimado:** desaparecen 3–4 atlas (unos 487 KB) y se añaden unos 50 KB de coeficientes: **≈ −0,4 MB**. El patrón sale de los vértices de un prototipo hecho una vez, así que **también arregla `Ventana-003`**, y en el zoom máximo se verá mejor que hoy.
- **Alternativa más barata de implementar:** muestrear en el shader el lightmap de la fachada que contiene la ventana, a través del registro de fachada. Pierde la luz propia del marco, pero no necesita atlas.
- **Extras:**
  - Cuantizar los registros de fachada (hoy float32, 83 KB) a unos 25 KB: **≈ −58 KB**.
  - Bajar el umbral de niebla `window_fog_cull` de 0,8 a 0,5 quitaría unas 5.000 ventanas de `CITY_C`. Es un parámetro, pero hay que mirarlo en la web.

### 4.2 Props

Lo mismo con k=1–2: un patrón por vértice por forma (15 formas) × el valor de cada instancia, conservando el tono por instancia. El ahorro en bytes es pequeño; lo que se gana es **calidad y robustez**.

### 4.3 Pretiles de los procedurales, de menos a más trabajo

1. **Arreglo inmediato** (solo `prepare.py`): cortar los anillos superiores por las esquinas o pasarlos por `face_rect_layout`. La ocupación pasaría del 8,8 % a más del 50 %, con islas de 3 px o más a 1024, o a 512 con la densidad actual (**≈ −80 KB**, estimado).
2. **Luz por vértice** (recomendado): sin atlas y sin `TEXCOORD_1`, **≈ −0,14 MB**. Se pierden las sombras a lo largo del pretil, salvo que se subdivida cada 2–3 m.
3. **Heredar la UV del edificio:** la cara exterior del pretil continúa la isla de la fachada; la interior y la superior, la del tejado. No añade téxeles ni deja junta de luz entre pretil y edificio, pero exige rehacer la UV de los procedurales o generarla en Geometry Nodes.

### 4.4 `CITY_B/C`: separar por tamaño de pieza

- **Las caras finas** (90 % de las caras, unos 15 % de la superficie) pasan a luz por vértice.
- **Las grandes** (fachadas y tejados) siguen en el atlas. Con un tercio de los téxeles pueden bajar a unos 512 (**≈ −0,15–0,2 MB**) o mantener 1024 con 1,7 veces más densidad. Además vuelven a compartir vértices, y Draco recupera la conectividad.
- Los procedurales NE y SW sufren lo mismo: un 43 % y un 31 % de islas por debajo de 1 px y un 15–18 % de triángulos negros (parte son medianeras que no se ven).
- A largo plazo sigue en pie la ciudad paramétrica del informe del 2026-11-18 (−470 KB).

### 4.5 Resumen de ahorros

| Cambio | Ahorro estimado | Efecto en calidad | Esfuerzo |
|---|---:|---|---|
| Margen de ventanas y control de islas (§5.1) | ~0 | arregla `Ventana-003` | bajo |
| Ventanas factorizadas | ≈ −0,40 MB | mejor; sin negros | medio |
| Registros de fachada cuantizados | ≈ −0,06 MB | ninguno si el error es sub-mm | bajo |
| Pretiles procedurales a luz por vértice | ≈ −0,14 MB | más limpio; sin sombra longitudinal | medio |
| `CITY_B/C` separados por tamaño | ≈ −0,15–0,2 MB | igual o mejor en fachadas | medio-alto |
| Props factorizados | pequeño | mejor; sin negros | medio |

---

## 5. Cambios en el proceso

1. **Un control automático dentro de la cadena.** Fallar si hay islas por debajo de unos 1,5 téxeles al tamaño entregado (contando la escala de celda de las instancias) y medir los triángulos que leen negro en cada nodo. Habría parado `Ventana-003`, los props y los pretiles antes de llegar a la web.
2. **Reducir pesando por cobertura,** o hornear directamente a 1024 los atlas de islas diminutas. Hoy los márgenes van justos: 4 px en un máster de 4096 son 1 px a 1024.
3. **Volver a medir los KTX2 tras el horneado final a 512 muestras.** El ruido de 64 muestras infla ETC1S, así que los 2,00 MB de lightmaps de esta pasada son pesimistas (no medido). Los atlas a q32 se quedan en 25,7–26,4 dB.

### Orden propuesto

1. Control automático y margen de las ventanas: arregla `Ventana-003` ya.
2. Ventanas factorizadas: el mayor ahorro y además mejora la calidad.
3. Pretiles procedurales con luz por vértice.
4. Separación por tamaño en `CITY_B/C`.

**Riesgos.** La luz por vértice depende de la densidad de malla: en caras grandes y planas se pierde la sombra, por eso solo se propone para piezas finas. La factorización exige un atributo y unas líneas nuevas en el vertex shader de `lightmapMaterial.ts`, y cambia el contrato del GLB (`decisiones/build/contrato-del-glb.md`).

---

## 6. Hallazgos de paso, sin verificar en la escena

- **Torre Vértigo y campus:** el 57 % del área mapeada lee negro, con `ARCH_Window_Frames` al 83 % y `ARCH_Metal_Graphite` al 62 % de triángulos. En r5 ya era del 28 % (`vertigo-blog`) y del 61 % (`campus`), así que no está claro que sea una regresión. Como es el edificio del cliente, conviene mirarlo.
- **Otros negros en triángulos pequeños:** `Puente-Piedra-Web` 74 %, `RF_Wall` 50 %, árbol `P3_Plane_009` 27 %.

---

## Cómo se midió

- **Islas y negros.** Se leyó `export-raw.glb` y se rasterizó la UV1 de cada primitiva, con el `_LIGHTMAP_ST` de cada instancia, sobre los másteres PNG de 1024. «Negro» es una muestra bilineal en el centro del triángulo por debajo del umbral de fondo. En `CITY_*` reproduce el 1,2–1,6 % que da el plan 030. Los prototipos de ventana se identificaron por malla (`Areas.022` es `Ventana-002`, `Plane.024` es `Ventana-001`, `Plane.025` es `Ventana-003`).
- **El «negro» incluye caras que nunca se ven** (bases, medianeras), así que en los estáticos es una cota alta. En `Ventana-003` no lo es: todos sus triángulos negros caen en islas de menos de un téxel, y en r5 ese atlas daba 0 %.
- **Bytes por familia.** Del GLB entregado, sumando las vistas de buffer de cada primitiva y accesor. Las cifras por atlas son los tamaños de los KTX2.
- **Factorización.** Cada celda de ventana del máster se muestreó en 12×12, se agruparon por prototipo y se hizo SVD de rango k; PSNR contra el máster.
- **Props sobre pretiles.** Distancia de la base de cada prop de tejado al vértice de pretil más cercano en `export-raw.glb`.

No se ejecutaron tests ni harnesses del repositorio durante el análisis, ni se miró la escena en el navegador.
