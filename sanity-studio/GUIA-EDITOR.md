# Guía para editar la web de Vertigo

Esta guía es para quien va a cambiar textos, casos de éxito, servicios, entradas del blog o datos de contacto de la web. No hace falta saber programar.

## Entrar

1. Abre la dirección del editor que te ha dado el equipo técnico.
2. Inicia sesión con tu cuenta (Google o correo, según cómo te dieran de alta).
3. A la izquierda verás el menú **Contenido de la web**.

## Qué hay en el menú

| Sección | Qué es |
|---|---|
| **Inicio y ayuda** | Accesos a tareas frecuentes, borradores recientes y ayuda para editar, revisar y programar. |
| **Casos de éxito** | Las marcas que giran alrededor del planeta, cada una sobre un satélite. Cada caso tiene su ficha, sus textos y su gráfico, que se leen al pinchar el satélite. |
| **Servicios** → **Presentación y orden de los servicios** | La sección de servicios de la ciudad, la que se abre al pulsar el lago: su título, su subtítulo y el orden de los servicios. Hay una sola. |
| **Servicios** → **Todos los servicios** | Cada servicio de la agencia, con su nombre y su descripción. Cada servicio es además un tema del blog. |
| **Blog** | Las entradas del blog, de la más reciente a la más antigua. |
| **Ajustes del sitio** | Teléfonos, correo que recibe los mensajes, botón de reservar cita, mensajes de «enviado» de los formularios, rangos de facturación del formulario de Auditoría y línea de copyright. |
| **Textos legales** | Los tres documentos legales: «Términos y privacidad», «Aviso legal» y «Política de cookies». |

## Guardar y publicar

- Todo lo que escribes **se guarda solo**, al momento. No hay botón de guardar.
- Lo que escribes **no está en la web hasta que pulsas «Publicar»** (abajo a la derecha). Hasta entonces es un borrador que pueden ver las personas autorizadas del proyecto.
- Si un campo tiene un error **en rojo**, el botón de publicar no se activa y el campo te dice qué falta. Corrígelo y vuelve a publicar. Un aviso **en amarillo** no bloquea: es un consejo.
- **Publicar inicia automáticamente la actualización de la web.** El webhook de Sanity avisa a Vercel. Espera unos minutos para comprobar el resultado. Si no aparece, avisa al equipo técnico con el nombre del documento.

## Publicar es hacerlo público

Pulsar «Publicar» deja el documento accesible para cualquiera en internet, aunque todavía no se vea en la web. Que no se vea **no** quiere decir que sea privado.

- **Todo lo publicado es información pública.** También los campos que la web no muestra: si está publicado, alguien puede leerlo aunque no aparezca en ninguna pantalla.
- **Los borradores no.** Lo que escribes y no publicas pueden verlo las personas autorizadas con acceso al proyecto. La diferencia entre privado y público es exactamente el botón «Publicar».
- **Una entrada del blog con fecha futura no se programa.** Si la publicas, sale en cuanto se actualice la web, con esa fecha. Si no quieres que se lea aún, déjala en borrador.
- **No escribas aquí nada que no pueda leerse fuera:** notas internas, datos personales de nadie, contraseñas, teléfonos particulares o cualquier cosa confidencial. No hay ningún campo de este editor pensado para eso.

Si dudas de si algo puede publicarse, déjalo en borrador y pregunta al equipo técnico.

## Ayudas del editor

- **Cada campo te dice dónde se ve en la web** y, si es opcional, empieza por «Opcional.». El texto en gris dentro de un campo vacío es solo un ejemplo: no se publica.
- **Los campos con límite de longitud llevan un contador** debajo, como `123 / 400`. Los límites obligatorios se ponen en rojo si te pasas. Las recomendaciones se indican en amarillo y dicen «puedes publicar».
- **El color de marca** tiene un selector de color al lado. Puedes pegar el código (`#e0b33c`) o elegirlo con el selector; «Quitar color» lo deja vacío.

## Cosas que conviene saber

**Un caso de éxito nuevo no aparece solo.** Hay seis órbitas alrededor del planeta. Puedes crear un caso y rellenarlo entero, pero solo sale en la web cuando el equipo técnico le asigna una. Avísales cuando esté listo.

**Al crear un caso o un servicio nuevo, el identificador se genera automáticamente al escribir el nombre.** Después queda protegido para evitar cambios accidentales. En las entradas del blog, pulsa «Generar» en «Dirección de la entrada», dentro de «Publicación»: es la dirección que compartirás.

**El orden de los servicios se cambia arrastrándolos** en «Presentación y orden de los servicios». Es el orden en que el visitante los recorre alrededor del lago. **Para añadir o quitar un servicio de esa lista, avisa antes al equipo técnico:** cada servicio necesita su propio símbolo en la ciudad, y sin él la web no se actualiza. Crear un servicio nuevo en «Todos los servicios» sí puedes hacerlo; sirve, por ejemplo, como tema del blog.

**La descripción de un servicio se lee en dos tiempos.** El principio se ve siempre, debajo del nombre, y el resto desarrolla el detalle. Lo más claro es escribir dos párrafos: el primero, una sola frase que resuma el servicio; el segundo, el detalle.

**El gráfico de un caso** se rellena punto a punto: pulsa el botón de añadir y escribe el valor. Si el gráfico es de barras o donut, cada punto lleva también un nombre (lo que se lee bajo la barra, o en la leyenda del donut). El gráfico dibuja la forma de los datos; los números en sí no se ven, salvo los porcentajes del donut.

**Cada caso puede llevar dos imágenes de marca**, en PNG o WebP con fondo transparente:

- **Isotipo (símbolo):** solo el símbolo, sin el nombre. Cuadrado, 512×512. Es lo que flota sobre el satélite todo el rato, así que es el más importante de los dos.
- **Logotipo completo:** el símbolo junto al nombre. Apaisado, 1600×800. Solo aparece cuando alguien pincha el satélite y se abre el caso.

**No hace falta que te lo aprendas: el editor lo comprueba solo.** Al subir una imagen te dice al momento si algo no encaja, y hay dos niveles:

- **En rojo, y no te deja publicar** — el archivo no sirve: no es PNG ni WebP (un JPG no tiene transparencia y se vería como un rectángulo), es más pequeño que el mínimo (432×432 el isotipo, 900 de ancho el logotipo), o tiene una forma que no cabe (un isotipo alargado, un logotipo vertical).
- **En amarillo, y sí puedes publicar** — el archivo sirve pero no es el ideal: se queda algo corto de tamaño, es mucho más grande de lo necesario, o tiene una proporción rara. Se verá bien; se vería mejor con el tamaño recomendado.

En los dos casos el aviso te dice qué mide la imagen y qué debería medir, así que se arregla pidiendo el archivo correcto — no hay que retocar nada aquí.

**Van los dos o no va ninguno.** Si subes uno y dejas el otro vacío, el editor te lo marca en rojo y no te deja publicar. Un caso sin ninguno de los dos sí es válido: se muestra un anillo fino con la inicial de la marca, en su color — no pasa nada.

**Las imágenes del blog** llevan siempre una descripción en una frase (para quien no puede verlas). El editor no te dejará publicar sin ella.

**Los vídeos de YouTube o Vimeo** se añaden al texto de una entrada pegando su dirección. En la web se ven como una tarjeta que abre el vídeo en otra pestaña, no como un reproductor dentro de la página.

**Las etiquetas de una entrada** se muestran en la entrada y ayudan a encontrarla con el buscador del blog, pero no crean secciones. Lo que agrupa las entradas es el **tema principal**, que es uno de los servicios.

**Teléfonos:** el número se escribe dos veces. «Número tal como se ve» es con espacios, como en una tarjeta; «Número para llamar» es solo dígitos, seguidos, con el +34 delante. Si los dos no coinciden, el editor te avisa en amarillo — suele pasar al cambiar uno y olvidar el otro.

**La etiqueta del teléfono es opcional.** Es la palabra que aparece a la izquierda del número, normalmente la ciudad: `Madrid`. Escríbela **sin los dos puntos** — los pone la web sola, así todos salen iguales. Si la dejas vacía, ese número se muestra solo, sin nada delante. Puedes ponérsela a unos sí y a otros no.

**Los teléfonos y el botón de reservar** se ven en la ventana «Contacto» de la web. **El correo de «Ajustes del sitio» no se muestra:** es a donde llegan los mensajes de los dos formularios, Auditoría y Contacto.

**Los rangos de facturación** («Ajustes del sitio» → «Formulario de auditoría») son las opciones del desplegable «Rango de facturación de tu empresa» del panel Auditoría, en el mismo orden en que los pongas (arrastra para reordenar). Lo que escribas es exactamente lo que ve el visitante y lo que te llega en el correo. **Los cuatro que hay ahora son de ejemplo:** cámbialos por los tuyos. Tiene que haber al menos uno.

**Los textos legales** se abren en una ventana sobre la web cuando alguien pulsa su enlace. «Términos y privacidad» se enlaza desde los dos formularios; «Aviso legal», desde el panel de Auditoría; y «Política de cookies», desde el aviso de cookies.

## Si algo va mal

Las validaciones comprueban el formato y la estructura. No pueden saber si un teléfono, una cifra o un texto son correctos: revísalos antes de publicar. Si la actualización falla, se conserva la versión anterior de la web. Avisa al equipo técnico con el nombre del documento.

## Vista previa

Abre «Vista previa» junto a «Editar». Muestra los cambios del documento sin publicarlos. Elige móvil o escritorio; para escribir y mirar a la vez, usa la vista dividida del documento.

- **Casos:** ficha y gráfico con los componentes de la web; imágenes de marca sobre fondo oscuro. Comprueba la transparencia: el formato PNG o WebP por sí solo no la garantiza.
- **Blog:** entrada, tarjeta del listado y simulación de buscadores/redes. Los buscadores pueden cambiar lo que muestran.
- **Ajustes:** teléfonos, reserva, confirmaciones, rangos de facturación y copyright. El correo destinatario no aparece en la vista pública.
- **Servicios y legales:** vista de lectura para comprobar el contenido. La composición 3D se comprueba en la web.

Los enlaces de la vista previa no navegan y no se envían formularios. Una vista previa no sustituye los errores de validación. Las imágenes del blog usan el encuadre del archivo; la imagen para redes se recorta desde el centro.

## Revisión y programación

**Pedir revisión:** guarda el borrador, abre «Tareas», vincula el documento y asígnalo a la persona revisora. Puede añadir una fecha límite. Resolver la tarea no publica el contenido. No escribas notas internas en campos públicos.

**Programar:** completa el borrador y usa «Programar publicación» en las acciones del documento. Comprueba fecha, hora y zona horaria. El tema principal de la entrada debe estar publicado. Para editar un borrador programado, cancela primero la programación. El webhook existente actualizará la web después de que Sanity publique el contenido.

Tareas y programación requieren el plan Growth y permisos adecuados. Si no aparecen, consulta al administrador; poner una fecha futura en el campo «Fecha de publicación» no sustituye la programación.
