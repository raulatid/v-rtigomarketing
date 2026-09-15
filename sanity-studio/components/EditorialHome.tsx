import { useCallback, useEffect, useState } from 'react'
import { useClient } from 'sanity'
import { IntentLink } from 'sanity/router'
import './editorial.css'

interface PendingDocument {_id: string; _type: string; label: string; _updatedAt: string}
const TYPES = ['caseStudy', 'service', 'blogPost', 'siteSettings', 'legalDoc', 'district']
const pendingQuery = '*[_type in $types && _id in path("drafts.**")] | order(_updatedAt desc)[0...30]{_id,_type,_updatedAt,"label":coalesce(title,name,label,"Sin título")}'
export function EditorialHome() {
  const client = useClient({apiVersion: '2026-08-23'})
  const [pending, setPending] = useState<PendingDocument[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    let active = true
    setStatus('loading')
    client.fetch<PendingDocument[]>(pendingQuery, {types: TYPES}, {perspective: 'raw'})
      .then((documents) => {if(active) {setPending(documents); setStatus('ready')}})
      .catch(() => {if(active) setStatus('error')})
    const subscription = client.listen('*[_type in $types && _id in path("drafts.**")]', {types: TYPES}, {includeResult: false})
      .subscribe({next: refresh, error: () => {if(active) setStatus('error')}})
    return () => {active = false; subscription.unsubscribe()}
  }, [client, revision, refresh])
  return <main className="editorial-home">
    <h1>Editar la web</h1>
    <p>Elige lo que quieres cambiar. El contenido se guarda solo como borrador; abre «Vista previa» para comprobarlo antes de publicar.</p>
    <h2>Tareas frecuentes</h2>
    <ul>
      <li><IntentLink intent="edit" params={{id: 'siteSettings', type: 'siteSettings', path: 'phones'}}>Cambiar teléfonos y datos de contacto</IntentLink></li>
      <li><IntentLink intent="edit" params={{id: 'siteSettings', type: 'siteSettings', path: 'contactSuccessTitle'}}>Editar mensajes de los formularios</IntentLink></li>
      <li><IntentLink intent="edit" params={{id: 'siteSettings', type: 'siteSettings', path: 'revenueRanges'}}>Cambiar rangos de facturación</IntentLink></li>
      <li><IntentLink intent="create" params={{type: 'blogPost'}}>Escribir una entrada del blog</IntentLink></li>
    </ul>
    <h2>Cambios sin publicar</h2>
    <p>Los 30 borradores editados más recientemente, incluidos los de otras personas del equipo.</p>
    <button type="button" onClick={refresh} disabled={status === 'loading'}>Actualizar lista</button>
    {status === 'loading' && <p role="status">Cargando borradores…</p>}
    {status === 'error' && <p role="alert">No se pudo cargar la lista. Revisa la conexión y pulsa «Actualizar lista».</p>}
    {status === 'ready' && !pending.length && <p>No hay cambios guardados como borrador.</p>}
    {status === 'ready' && <ul className="editorial-pending">{pending.map((doc) => <li key={doc._id}>
      <IntentLink intent="edit" params={{id: doc._id.replace(/^drafts\./, ''), type: doc._type}}>{doc._type === 'siteSettings' ? 'Ajustes del sitio' : doc.label}</IntentLink>
      <time dateTime={doc._updatedAt}>Editado: {new Date(doc._updatedAt).toLocaleString('es-ES')}</time>
    </li>)}</ul>}
    <h2>Ayuda para editar</h2>
    <details open><summary>Guardar, comprobar y publicar</summary>
      <ol><li>Escribe los cambios. Se guardan automáticamente como borrador.</li><li>Abre «Vista previa». Puedes cambiar entre móvil y escritorio. Para escribir y ver el resultado a la vez, usa la vista dividida del documento.</li><li>Corrige los errores en rojo. Los avisos amarillos son recomendaciones y permiten publicar.</li><li>Pulsa «Publicar». Se inicia automáticamente la actualización de la web; puede tardar unos minutos.</li></ol>
      <p>Los borradores pueden verlos las personas autorizadas del proyecto. Publicar hace público el contenido, aunque la actualización de la web todavía no haya terminado. No guardes información confidencial en estos campos.</p>
    </details>
    <details><summary>Editar casos y servicios</summary>
      <p>El identificador de un caso o servicio nuevo se genera al escribir su nombre. El aviso al principio del documento indica si tiene una posición asignada en la escena. Crear y publicar contenido no le asigna una posición automáticamente.</p>
      <p>En «Servicios → Presentación y orden de los servicios» puedes arrastrar para reordenar. Para añadir o retirar servicios de la ciudad, contacta con el equipo técnico. Los servicios también se pueden usar como temas del blog.</p>
      <p>Los logotipos deben tener fondo transparente. La vista previa los muestra sobre fondo oscuro para que puedas comprobarlo. PNG o WebP no garantiza que el fondo sea transparente.</p>
    </details>
    <details><summary>Pedir una revisión</summary>
      <ol><li>Deja el documento en borrador.</li><li>Abre «Tareas» en la barra del Studio y crea una tarea.</li><li>Vincula el documento, asigna a la persona que debe revisarlo y añade la fecha límite.</li><li>La persona revisora comprueba la vista previa y resuelve la tarea. Publicar sigue siendo una acción independiente.</li></ol>
      <p>Si «Tareas» no aparece, el administrador debe comprobar el plan Growth y tus permisos. No escribas notas internas en los campos públicos del documento.</p>
    </details>
    <details><summary>Programar una entrada</summary>
      <p>«Fecha de publicación» es la fecha que leerá el visitante y determina el orden del blog. Poner una fecha futura no programa la entrada.</p>
      <ol><li>Completa el borrador y sus campos obligatorios.</li><li>En las acciones del documento, elige «Programar publicación» y comprueba la fecha, hora y zona horaria.</li><li>El contenido se publicará en Sanity a esa hora y después se actualizará la web.</li></ol>
      <p>Esta opción requiere el plan Growth y permisos adecuados. El tema principal debe estar publicado. Para modificar un borrador programado, cancela primero su programación.</p>
    </details>
    <details><summary>Corregir un error o recuperar un texto</summary>
      <p>Antes de publicar, revisa los cambios del documento. «Descartar cambios» elimina las modificaciones del borrador y conserva la versión publicada; úsalo solo si quieres perder esas modificaciones. El historial permite comparar versiones según la disponibilidad de tu plan.</p>
      <p>Las validaciones comprueban formato y estructura, pero no pueden saber si un teléfono, una cifra o una dirección son correctos. Compruébalos antes de publicar.</p>
      <p>Si tras publicar y esperar unos minutos no aparece el cambio, avisa al equipo técnico con el nombre del documento. Una actualización fallida conserva la versión anterior de la web.</p>
    </details>
  </main>
}
