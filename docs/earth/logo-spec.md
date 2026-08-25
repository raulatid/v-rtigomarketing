# Marcas de clientes — especificación de entrega

Estos archivos se dibujan dentro del panel holográfico que flota sobre cada
satélite en la escena de la Tierra.

**Son dos archivos por caso de éxito, no uno**, porque el panel tiene dos
estados:

| Estado | Qué se ve | Cuándo |
|---|---|---|
| **Reposo** | El **isotipo** — solo el símbolo, sin el nombre. Panel cuadrado. | Siempre. Los seis satélites a la vez, durante toda la escena. |
| **Desplegado** | El **logotipo completo** — símbolo y nombre. El panel se despliega a 2:1. | Solo mientras alguien tiene abierta la ficha de ese caso. |

```
public/logos/satellite-01-isotipo.webp   →   isotype: '/logos/satellite-01-isotipo.webp'
public/logos/satellite-01.webp           →   logo:    '/logos/satellite-01.webp'
```

> **El isotipo es el archivo que más importa.** Es el que está en pantalla todo
> el rato y en seis sitios a la vez; el logotipo aparece de uno en uno y solo si
> alguien pincha. Si solo hay tiempo de cuidar un archivo, que sea el isotipo.

**Los dos van juntos o no va ninguno.** La compilación **rechaza** un caso que
tenga uno y no el otro, y lo dice nombrando el caso: el panel pasaría de una
marca real a un marcador de posición dibujado a mitad de la animación. Un caso
sin ninguno de los dos es válido — se queda con la placa generada, un círculo
con la inicial y el color de marca.

El código hace **contain-fit** en los dos: escala la imagen hasta que quepa
entera dentro de la celda respetando su proporción, y la centra. Nunca recorta y
nunca deforma. Cualquier proporción funciona — pero las que se acercan al ideal
se ven más grandes y más nítidas.

---

## Especificación — isotipo (símbolo)

| Punto | Requisito |
|---|---|
| **Formato** | **WebP** con canal alfa, calidad ≈ 90 o lossless. También se aceptan **PNG-24** y **SVG**, con las salvedades de más abajo. |
| **Dimensiones** | **512 × 512 px** ideal, cuadrado. Hasta 1024 × 1024 si el símbolo tiene mucho detalle. Por debajo de ~400 px se amplía y pierde nitidez en el primer plano. |
| **Proporción** | **1:1.** El panel en reposo es cuadrado. Un símbolo casi cuadrado (hasta 4:3 o 3:4) funciona; uno muy alargado se dibuja pequeño y se pierde. |
| **Contenido** | **Solo el símbolo.** Sin el nombre de la marca, sin claim, sin recuadro. Si la marca no tiene símbolo separable del nombre, ver abajo. |
| **Fondo** | **Totalmente transparente.** Sin caja blanca, sin tarjeta redondeada, sin sombra. |
| **Márgenes** | **Cero.** Recortar ajustado a la caja delimitadora. **El margen lo pone la aplicación.** |
| **Color** | **A todo color**, los colores originales de marca. |
| **Variante** | La versión **para fondo oscuro** ("reverse" / "knockout"). |

### Si la marca no tiene isotipo

Algunas marcas son solo un logotipo tipográfico y no tienen símbolo separable.
Tres salidas, en orden de preferencia:

1. **La inicial o el monograma** de la marca en su tipografía y color oficiales,
   recortada a cuadrado. Es lo que hacen sus propios perfiles sociales y su
   favicon — se puede pedir ese archivo por su nombre.
2. **El logotipo completo recortado a cuadrado**, si aguanta la proporción. Se
   verá pequeño, pero legible.
3. **No entregar ninguno de los dos** y dejar la placa generada. Es preferible a
   inventar un símbolo que la marca no tiene.

---

## Especificación — logotipo completo

| Punto | Requisito |
|---|---|
| **Formato** | **WebP** con canal alfa, calidad ≈ 90 o lossless. Pesa 10–40 KB frente a 60–150 KB del PNG equivalente, con calidad idéntica para arte plano. Se aceptan **PNG-24** y **SVG** como alternativa: el cargador es agnóstico al formato. |
| **Dimensiones** | **1600 × 800 px** ideal. Mínimo ~900 px de ancho. Por debajo de eso la imagen se amplía y pierde nitidez en el primer plano del panel de caso. Más grande no es problema. |
| **Proporción** | Entre **2:1 y 4:1** (lockup horizontal). El panel desplegado es 2:1, así que un lockup más alargado se dibuja más pequeño. Un lockup vertical no funciona bien. |
| **Fondo** | **Totalmente transparente.** Sin caja blanca, sin tarjeta redondeada, sin sombra, sin degradado de fondo. Un fondo blanco se renderiza literalmente como un rectángulo blanco — el shader no elimina fondos. |
| **Márgenes** | **Cero.** Recortar ajustado a la caja delimitadora del arte. **El margen lo pone la aplicación.** Un archivo entregado con un 30 % de espacio en blanco incorporado se verá un 30 % más pequeño que sus vecinos, y no hay forma de detectarlo automáticamente. Este es el punto que más se incumple. |
| **Color** | **A todo color**, los colores originales de marca — no una versión monocroma. |
| **Variante** | La versión **para fondo oscuro** ("reverse" / "knockout") que indiquen sus normas de marca. La misma que el isotipo. |

---

## Por qué la variante para fondo oscuro

Aplica a los dos archivos por igual.

El panel es una superficie holográfica oscura sobre el espacio. Un logo negro o
azul marino muy oscuro desaparece: no se ve mal, no se ve en absoluto. Casi
todos los manuales de marca incluyen ya una versión para fondo oscuro (símbolo a
color + logotipo en blanco o claro) — es ese archivo el que hay que pedir, por su
nombre.

Si una marca solo dispone de versión oscura, hay tres salidas, y se eligen caso
por caso porque recolorear una marca registrada es una decisión de marca, no de
render:

1. Versión en blanco del símbolo (aplanar a `#fff` conservando el alfa). Casi
   siempre permitido como "monocromo reverse", y la opción más segura.
2. Mantener el color y añadir una placa clara detrás. No recomendado: pelea con
   el lenguaje holográfico y parece una pegatina.
3. Dejar la placa generada que ya existe, que es el comportamiento por defecto.

---

## Notas sobre SVG

Se acepta, pero conviene entregarlo además en WebP o PNG, porque un SVG dentro de
un `<canvas>` tiene tres trampas:

- Necesita atributos **`width` y `height` explícitos**. Solo con `viewBox` el
  navegador no le asigna tamaño intrínseco y no se dibuja nada. La aplicación
  detecta este caso, avisa por consola y conserva la placa generada.
- Un SVG cargado como imagen **no resuelve referencias externas**: ni CSS
  externo, ni `@font-face`, ni imágenes enlazadas. **Todo el texto debe estar
  convertido a trazados**, o se renderiza con otra tipografía o directamente no
  se renderiza. Es el fallo más habitual.
- El soporte de `filter` y `mask` varía entre navegadores.

---

## Cuando esto venga de Sanity

**Los archivos se suben a la biblioteca de medios de Sanity y nada más cambia en
la entrega.** Los requisitos de arriba —cuadrado para el isotipo, 1600×800 para
el logotipo, WebP, fondo transparente, recorte ajustado sin márgenes, variante
clara— siguen siendo exactamente los mismos, y el proceso de compilación los
comprueba.

En el Studio son dos campos contiguos dentro de **Marca**: *Isotipo (símbolo)* y
*Logotipo completo*. Rellenar uno y dejar el otro vacío marca un error en el
propio campo, además de fallar la compilación.

Lo que cambió es el camino que recorren los archivos. La aplicación **no descarga
nada del CMS en el navegador**: al compilar, `content/lib/mirror.ts` verifica el
origen, descarga las imágenes y las escribe en `public/logos/`. Los campos
`isotype` y `logo` acaban siendo siempre rutas locales, servidas desde el mismo
dominio que el resto del sitio.

El nombre del archivo lo pone Sanity, no nosotros: las URLs de sus assets
incluyen el hash del contenido, así que la misma imagen produce siempre el mismo
nombre. Eso es lo que mantiene el módulo generado byte a byte idéntico entre
compilaciones, y lo que permite no volver a descargar un archivo que ya está.

**El proceso no convierte formatos.** Sube el archivo ya en el formato final.

Consecuencias, todas favorables:

- **No hace falta `Access-Control-Allow-Origin`** en el CDN del CMS. No hay
  petición desde el navegador a Sanity, así que no hay CORS que resolver.
- **No hay que tocar la CSP** de `vercel.json`: la imagen es del propio origen.
- Una marca **ausente** no rompe nada: el caso se queda con la placa generada —
  siempre que falten **las dos**. Un archivo **declarado que no se puede
  descargar** sí falla la compilación: que el contenido y la biblioteca de medios
  no coincidan no es una decisión editorial.
- **Media pareja también falla**, aunque los dos archivos existan y se descarguen
  bien: si solo hay uno de los dos, la compilación rechaza el caso y lo nombra.

Una restricción que ahora impone la compilación: **no se aceptan SVG**. Sanity
los almacena sin problema, así que el rechazo está en `remoteMediaUrl` y no en
una opción del CMS que alguien pueda cambiar. Un SVG en la biblioteca de medios
se sirve en su propia URL y se convierte en un vector de ataque para quien la
abra; admitirlos más adelante debería ser un cambio revisado con un sanitizador
detrás, no una subida que nadie ve. La sección anterior sobre SVG se mantiene por
si el archivo se coloca a mano en `public/logos/`, que sigue siendo posible.

Detalle técnico completo en `docs/adr/010-content-is-generated-at-build-time.md`,
`docs/adr/011-the-cms-is-sanity.md` y `docs/content/sanity-media-contract.md`.

---

## Verificación rápida

1. Copiar **los dos archivos** en `public/logos/`.
2. Poner las rutas en los campos `isotype` y `logo` del caso en
   `content/fixtures/caseStudy.json` (o subir las imágenes en Sanity, si ya está
   conectado) y ejecutar `npm run content:build`. Si solo se rellena uno, la
   compilación falla nombrando el caso — es la comprobación funcionando, no un
   error de configuración.
3. `npm run dev`, dejar correr la intro hasta que aparezcan los satélites. Sobre
   cada uno debe verse el **isotipo**, en un panel cuadrado.
4. Pinchar un satélite: el panel se despliega a lo ancho y aparece el **logotipo
   completo**. Cerrar la ficha lo repliega.

Si una imagen no aparece, la consola dice por qué y de cuál de las dos se trata:
tamaño intrínseco ausente, CORS, o resolución baja.
