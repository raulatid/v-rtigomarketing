# Logos de clientes — especificación de entrega

Estos archivos se dibujan dentro del panel holográfico que flota sobre cada
satélite en la escena de la Tierra. Un archivo por caso de éxito, con el mismo
nombre que el `id` del caso (ver `content/fixtures/case_study.json`, o el CMS):

```
public/logos/satellite-01.webp   →   logo: '/logos/satellite-01.webp'
```

El código hace **contain-fit**: escala el logo hasta que quepa entero dentro de
la celda respetando su proporción, y lo centra. Nunca recorta y nunca deforma.
Cualquier proporción funciona — pero las que se acercan al ideal se ven más
grandes y más nítidas.

---

## Especificación

| Punto | Requisito |
|---|---|
| **Formato** | **WebP** con canal alfa, calidad ≈ 90 o lossless. Pesa 10–40 KB frente a 60–150 KB del PNG equivalente, con calidad idéntica para arte plano. Se aceptan **PNG-24** y **SVG** como alternativa: el cargador es agnóstico al formato. |
| **Dimensiones** | **1600 × 800 px** ideal. Mínimo ~900 px de ancho. Por debajo de eso la imagen se amplía y pierde nitidez en el primer plano del panel de caso. Más grande no es problema. |
| **Proporción** | Entre **2:1 y 4:1** (lockup horizontal). Un símbolo cuadrado funciona, pero se dibuja más pequeño. Un lockup vertical no funciona bien. |
| **Fondo** | **Totalmente transparente.** Sin caja blanca, sin tarjeta redondeada, sin sombra, sin degradado de fondo. Un fondo blanco se renderiza literalmente como un rectángulo blanco — el shader no elimina fondos. |
| **Márgenes** | **Cero.** Recortar ajustado a la caja delimitadora del arte. **El margen lo pone la aplicación.** Un archivo entregado con un 30 % de espacio en blanco incorporado se verá un 30 % más pequeño que sus vecinos, y no hay forma de detectarlo automáticamente. Este es el punto que más se incumple. |
| **Color** | **A todo color**, los colores originales de marca — no una versión monocroma. |
| **Variante** | La versión **para fondo oscuro** ("reverse" / "knockout") que indiquen sus normas de marca. |

---

## Por qué la variante para fondo oscuro

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

## Cuando esto venga de WordPress

**El archivo se sube a la biblioteca de medios de WordPress y nada más cambia en
la entrega.** Los requisitos de arriba —1600×800, WebP, fondo transparente,
recorte ajustado sin márgenes, variante clara— siguen siendo exactamente los
mismos, y el proceso de compilación los comprueba.

Lo que cambió es el camino que recorre el archivo. La aplicación **no descarga
nada del CMS en el navegador**: al compilar, el proceso descarga la imagen,
verifica el tipo y las dimensiones, la convierte a WebP y la escribe en
`public/logos/`. El campo `logo` acaba siendo siempre una ruta local
(`/logos/satellite-01.webp`), servida desde el mismo dominio que el resto del
sitio.

Consecuencias, todas favorables:

- **No hace falta `Access-Control-Allow-Origin`** en `wp-content/uploads/`. No
  hay petición desde el navegador al CMS, así que no hay CORS que resolver.
- **No hay que tocar la CSP** de `vercel.json`: la imagen es del propio origen.
- Un logo que falle no rompe nada: el caso se queda con la placa generada.

Una restricción nueva, y es del lado de WordPress: **no se aceptan SVG**. El
núcleo de WordPress los bloquea por defecto y así debe seguir, porque un SVG en
la biblioteca de medios se sirve en su propia URL y se convierte en un vector de
ataque para quien la abra. La sección anterior sobre SVG se mantiene por si el
archivo se coloca a mano en `public/logos/`, que sigue siendo posible.

Detalle técnico completo en `docs/adr/010-content-is-generated-at-build-time.md`
y en `docs/content/wordpress-field-contract.md`.

---

## Verificación rápida

1. Copiar el archivo en esta carpeta.
2. Poner la ruta en el campo `logo` del caso en `content/fixtures/case_study.json`
   (o en WordPress, si ya está conectado) y ejecutar `npm run content:build`.
3. `npm run dev`, dejar correr la intro hasta que aparezcan los satélites.

Si el logo no aparece, la consola dice por qué: tamaño intrínseco ausente, CORS,
o resolución baja.
