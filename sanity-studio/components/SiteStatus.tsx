import { useCallback, useEffect, useState } from 'react'
import { useClient } from 'sanity'
import { IntentLink } from 'sanity/router'
import { PUBLISHED_AFTER_QUERY, parseContentVersion, siteStatusFor, type PublishedAfter, type SiteStatus as Status } from './siteStatusModel'

/**
 * «Estado de la web», at the top of Inicio: has the site caught up with what
 * was published?
 *
 * Reads `/content-version.json` from the deployed site (vercel.json opens it to
 * any origin; it holds a timestamp and nothing else) and asks Sanity for the
 * published documents newer than it. See siteStatusModel.ts for the reading.
 *
 * The site's origin is a Studio variable, not a constant: preview deployments
 * and a future custom domain are not this file's business. A literal
 * `process.env.SANITY_STUDIO_…` read, as sanity.config.ts explains.
 */
const SITE_URL = (process.env.SANITY_STUDIO_SITE_URL ?? '').trim().replace(/\/+$/, '')
const TYPES = ['caseStudy', 'service', 'blogPost', 'siteSettings', 'legalDoc', 'district']
/** While a build may be running, look again this often. */
const POLL_MS = 30_000

const when = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
const typeName: Record<string, string> = {
  caseStudy: 'Caso de éxito', service: 'Servicio', blogPost: 'Entrada del blog', siteSettings: 'Ajustes del sitio', legalDoc: 'Texto legal', district: 'Sección',
}

export function SiteStatus() {
  const client = useClient({ apiVersion: '2026-08-23' })
  const [status, setStatus] = useState<Status | 'loading'>('loading')
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    if (!SITE_URL) return
    let active = true
    setStatus('loading')
    ;(async () => {
      let version = null
      try {
        const response = await fetch(SITE_URL + '/content-version.json', { cache: 'no-store' })
        if (response.ok) version = parseContentVersion(await response.json())
      } catch {
        version = null
      }
      let newer: PublishedAfter[] = []
      if (version?.contentUpdatedAt) {
        newer = await client.fetch<PublishedAfter[]>(PUBLISHED_AFTER_QUERY, { types: TYPES, since: version.contentUpdatedAt }, { perspective: 'published' })
      }
      if (active) setStatus(siteStatusFor(version, newer, Date.now()))
    })().catch(() => { if (active) setStatus({ kind: 'unreachable' }) })
    // A publish anywhere is the moment the answer changes.
    const subscription = client.listen('*[_type in $types && !(_id in path("drafts.**"))]', { types: TYPES }, { includeResult: false })
      .subscribe({ next: refresh, error: () => {} })
    return () => { active = false; subscription.unsubscribe() }
  }, [client, revision, refresh])

  useEffect(() => {
    if (status === 'loading' || status.kind !== 'updating') return
    const timer = setTimeout(refresh, POLL_MS)
    return () => clearTimeout(timer)
  }, [status, refresh])

  if (!SITE_URL) {
    return <p className="site-status site-status--unknown">Para ver aquí si la web está al día, el equipo técnico tiene que definir <code>SANITY_STUDIO_SITE_URL</code> en <code>sanity-studio/.env</code> y volver a desplegar el Studio.</p>
  }
  if (status === 'loading') return <p className="site-status site-status--unknown" role="status">Comprobando la web…</p>

  const list = (docs: PublishedAfter[]) => <ul className="editorial-pending">{docs.map((doc) => <li key={doc._id}>
    <IntentLink intent="edit" params={{ id: doc._id, type: doc._type }}>{doc._type === 'siteSettings' ? 'Ajustes del sitio' : doc.label}</IntentLink>
    <time dateTime={doc._updatedAt}>{typeName[doc._type] ?? doc._type} · publicado el {when(doc._updatedAt)}</time>
  </li>)}</ul>

  switch (status.kind) {
    case 'unreachable':
      return <p className="site-status site-status--unknown" role="alert">No se ha podido consultar la web. Revisa la conexión y pulsa «Comprobar de nuevo». <button type="button" onClick={refresh}>Comprobar de nuevo</button></p>
    case 'not-from-cms':
      return <p className="site-status site-status--stale" role="alert">La web se publicó sin el contenido de este Studio (modo de emergencia). Lo que edites aquí no aparecerá hasta que el equipo técnico vuelva a publicar desde el CMS.</p>
    case 'live':
      return <p className="site-status site-status--live">✔ La web está al día con todo lo publicado. Última actualización: {when(status.builtAt)}.</p>
    case 'updating':
      return <div className="site-status site-status--updating" role="status">
        <p>⏳ La web se está actualizando con lo último publicado. Suele tardar entre 3 y 5 minutos; esta página se comprueba sola.</p>
        {list(status.docs)}
      </div>
    case 'stale':
      return <div className="site-status site-status--stale" role="alert">
        <p>⚠ La web no se ha actualizado con estas publicaciones, y ha pasado más tiempo del que tarda una actualización. Lo más probable es que uno de estos documentos haya fallado al publicarse en la web: la versión anterior sigue en línea. Avisa al equipo técnico con estos nombres.</p>
        {list(status.docs)}
        <p>Última actualización correcta de la web: {when(status.builtAt)}. <button type="button" onClick={refresh}>Comprobar de nuevo</button></p>
      </div>
  }
}
