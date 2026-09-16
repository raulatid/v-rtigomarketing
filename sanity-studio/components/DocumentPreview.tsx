import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useClient } from 'sanity'
import { LegalBlock } from '../../src/components/LegalBlock'
import { ContactSection } from '../../src/components/ContactSection'
import { AuditSection } from '../../src/components/AuditSection'
import { CasePanel } from '../../src/components/CasePanel'
import { PostBody } from '../../src/blog/PostBody'
import { BlogFigure } from '../../src/blog/BlogFigure'
import { ogImageUrl } from '../../src/blog/sanityImage'
import { readingMinutes } from '../../content/lib/readingTime'
import { BLOG_META_DESCRIPTION_FALLBACK_MAX } from '../../src/content/blogPolicy'
import { object, previewBody, previewCase, previewImage, rows, text, type RecordValue } from './previewModel'
import { previewStyles } from './previewStyles'
import './editorial.css'

type Mode = 'content' | 'card' | 'social'
type SettingsView = 'contact' | 'contact-success' | 'audit' | 'audit-success'
const noop = () => {}
// Mirrors the production metadata fallback: custom descriptions remain untrimmed.
function fallbackDescription(excerpt: string) {
  if (excerpt.length <= BLOG_META_DESCRIPTION_FALLBACK_MAX) return excerpt
  const clipped = excerpt.slice(0, BLOG_META_DESCRIPTION_FALLBACK_MAX)
  const lastSpace = clipped.lastIndexOf(' ')
  return (lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).replace(/[\s,;:.\u2013-]+$/, '') + '…'
}
const frameDocument = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${previewStyles}</style></head><body></body></html>`

/** Pure rendering also used by the local visual QA harness. */
export function PreviewContent({doc, projectId, dataset, mode = 'content', category = '', settingsView = 'contact'}: {
  doc: RecordValue; projectId: string; dataset: string; mode?: Mode; category?: string; settingsView?: SettingsView
}) {
  const type = text(doc._type)
  const cover = previewImage(doc.cover, projectId, dataset)
  const {body, incomplete} = previewBody(doc.body, projectId, dataset)
  if (type === 'caseStudy') {
    const data = previewCase(doc)
    const isotype = previewImage(doc.isotype, projectId, dataset)
    const logo = previewImage(doc.logo, projectId, dataset)
    return <div className="preview-content preview-scene">
      <p className="preview-note">Imágenes de marca sobre fondo oscuro. Comprueba que no tengan un rectángulo de fondo.</p>
      <div className="brand-samples">
        {isotype ? <img src={isotype.src} alt="Isotipo" /> : <p>Sin isotipo: la web usa la inicial de la marca.</p>}
        {logo ? <img src={logo.src} alt="Logotipo completo" /> : <p>Sin logotipo completo.</p>}
      </div>
      <CasePanel data={data} onClose={noop} onRequestAudit={noop} />
      {!data.chart.values.length && <p className="preview-note">Añade datos para ver el gráfico.</p>}
      {data.chart.values.length !== rows(object(doc.chart).points).length && <p className="preview-note">Hay puntos sin un número válido que todavía no se muestran. Complétalos antes de publicar.</p>}
    </div>
  }
  if (type === 'blogPost' && mode === 'social') {
    const image = previewImage(doc.ogImage, projectId, dataset) ?? cover
    const title = text(doc.seoTitle) || text(doc.title)
    const description = text(doc.metaDescription) || fallbackDescription(text(doc.excerpt))
    return <div className="preview-content">
      <p className="preview-note">Simulación orientativa: cada buscador y red puede modificar el texto o su recorte.</p>
      <section className="search-result" aria-label="Resultado de búsqueda"><small>/blog/{text(object(doc.slug).current)}</small><h2>{title}</h2><p>{description}</p></section>
      <section className="social-result" aria-label="Tarjeta para redes">
        {image ? <img src={ogImageUrl(image, 'https://vertigomkt.com')} alt={image.alt} /> : <p>Sin imagen propia. La web utilizará su imagen general para compartir.</p>}
        <div><h2>{title}</h2><p>{description}</p></div>
      </section>
    </div>
  }
  if (type === 'legalDoc') return <div className="preview-scene preview-settings">
    <div className="modal-scrim"><section className="modal-panel legal-panel">
      <button type="button" className="modal-close" aria-label="Cerrar">✕</button>
      <h2 className="modal-title">{text(doc.title)}</h2>
      <div className="legal-panel__body">{body.map((block, i) => block.kind === 'paragraph' || block.kind === 'heading' || block.kind === 'list' ? <LegalBlock key={i} block={block} /> : null)}</div>
      {incomplete && <p className="preview-note">Hay bloques incompletos que todavía no se pueden mostrar.</p>}
    </section></div>
  </div>
  if (type === 'blogPost') {
    const date = text(doc.publishedAt)
    const dateLabel = date && Number.isFinite(Date.parse(date)) ? new Date(date).toLocaleDateString('es-ES', {day: 'numeric', month: 'long', year: 'numeric'}) : ''
    const meta = <span className="blog-meta"><time dateTime={date}>{dateLabel}</time><span className="blog-meta__dot" aria-hidden="true" />{readingMinutes(body)} min de lectura</span>
    return <div className="preview-content"><div className="blog-root">
      {mode === 'card' ? <div className="blog-card">
        {cover ? <BlogFigure image={cover} slot="card" className="blog-figure--card" /> : <span className="blog-card__placeholder" />}
        <div className="blog-card__text"><span className="blog-card__eyebrow">{category}</span><span className="blog-card__title">{text(doc.title)}</span><span className="blog-card__excerpt">{text(doc.excerpt)}</span>{meta}</div>
      </div> : <article className="blog-article">
        {category && <span className="blog-eyebrow">{category}</span>}
        <h1 className="blog-article__title">{text(doc.title)}</h1>
        <p className="blog-article__standfirst">{text(doc.excerpt)}</p>
        {type === 'blogPost' && <div className="blog-article__meta">{meta}</div>}
        <div className="blog-tags">{rows(doc.tags).map((tag, i) => <span className="blog-tag" key={i}>{text(tag)}</span>)}</div>
        {cover && <BlogFigure image={cover} slot="cover" priority />}
        <PostBody body={body} />
        {incomplete && <p role="status">Hay bloques incompletos o no compatibles que todavía no se pueden mostrar. Revisa los avisos del editor.</p>}
        {!rows(doc.body).length && <p>Escribe el texto para verlo aquí.</p>}
      </article>}
    </div></div>
  }
  if (type === 'siteSettings') {
    const success = settingsView.endsWith('-success')
    return <div className="preview-scene preview-settings">
      {settingsView.startsWith('audit') ? <AuditSection
        ready={false} recomposesScene={false} onOpenChange={noop} onOpenLegal={noop}
        preview={{state: success ? 'success' : 'form', revenueRanges: rows(doc.revenueRanges).map(text),
          successTitle: text(doc.auditSuccessTitle), successBody: text(doc.auditSuccessBody)}}
      /> : <ContactSection
        ready={false} suppressed={false} onOpenChange={noop} onOpenLegal={noop}
        preview={{state: success ? 'success' : 'form', bookingUrl: text(doc.bookingUrl),
          bookingLabel: text(doc.bookingLabel) || 'Agenda una cita',
          phones: rows(doc.phones).map((value) => {const phone = object(value); return {label: text(phone.label), display: text(phone.display), tel: text(phone.tel)}}),
          successTitle: text(doc.contactSuccessTitle), successBody: text(doc.contactSuccessBody)}}
      />}
      <footer className="preview-copyright">{text(doc.copyright)}</footer>
    </div>
  }
  return <div className="preview-content preview-scene"><div className="preview-contact modal-panel">
    <h1>{text(doc.title) || text(doc.label)}</h1><p>{text(doc.summary)}</p>
    {text(doc.body).split(/\n\s*\n/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}
    <p>{text(doc.figureCaption)}</p>
    {rows(doc.measures).length > 0 && <><h2>Qué medimos</h2><ul>{rows(doc.measures).map((measure, i) => <li key={i}>{text(measure)}</li>)}</ul></>}
    <p className="preview-note">Vista de lectura del contenido. La escena, las partículas y las figuras se comprueban en la web.</p>
  </div></div>
}

export function PreviewFrame({children, width}: {children: React.ReactNode; width: number}) {
  const [body, setBody] = useState<HTMLElement | null>(null)
  return <iframe title="Vista previa del contenido" sandbox="allow-same-origin" srcDoc={frameDocument}
    className="editorial-preview-frame" style={{width}}
    onLoad={(event) => setBody(event.currentTarget.contentDocument?.body ?? null)}>
    {body && createPortal(<div onSubmitCapture={(event) => {event.preventDefault(); event.stopPropagation()}} onClickCapture={(event) => {
      if ((event.target as Element).closest('a,button')) {event.preventDefault(); event.stopPropagation()}
    }}>{children}</div>, body)}
  </iframe>
}

export function DocumentPreview({document}: {document: {displayed?: RecordValue}}) {
  const client = useClient({apiVersion: '2026-08-23'})
  const {projectId = '', dataset = ''} = client.config()
  const doc = document.displayed ?? {}
  const [width, setWidth] = useState(390)
  const [mode, setMode] = useState<Mode>('content')
  const [category, setCategory] = useState('')
  const [settingsView, setSettingsView] = useState<SettingsView>('contact')
  const categoryId = text(object(doc.category)._ref)
  useEffect(() => {
    let active = true
    setCategory('')
    if (categoryId) client.fetch<string | null>('*[_id == $id][0]{"label":select($short => coalesce(shortTitle,title),title)}.label', {id: categoryId, short: mode === 'card'}, {perspective: 'published'})
      .then((title) => {if (active) setCategory(title ?? 'Tema sin publicar')})
      .catch(() => {if (active) setCategory('No se pudo cargar el tema. Revisa la conexión.')})
    return () => {active = false}
  }, [client, categoryId, mode])
  return <section className="editorial-preview">
    <header className="editorial-toolbar">
      <p>Vista previa de tus cambios sin publicar. Los enlaces no navegan y no se envían formularios.</p>
      <p>Los paneles usan el diseño de la web sobre un fondo orientativo. La escena 3D se comprueba en la web.</p>
      <div className="editorial-controls">
        <label>Formato <select value={width} onChange={(event) => setWidth(Number(event.target.value))}><option value={390}>Móvil · 390 px</option><option value={960}>Escritorio · 960 px</option></select></label>
        {doc._type === 'siteSettings' && <label>Mostrar <select value={settingsView} onChange={(event) => setSettingsView(event.target.value as SettingsView)}><option value="contact">Contacto · formulario</option><option value="contact-success">Contacto · confirmación</option><option value="audit">Auditoría · formulario</option><option value="audit-success">Auditoría · confirmación</option></select></label>}
        {doc._type === 'blogPost' && <label>Mostrar <select value={mode} onChange={(event) => setMode(event.target.value as Mode)}><option value="content">Entrada</option><option value="card">Tarjeta del listado</option><option value="social">Buscadores y redes</option></select></label>}
      </div>
    </header>
    <div className="editorial-preview-scroll"><PreviewFrame width={width}><PreviewContent doc={doc} projectId={projectId} dataset={dataset} mode={mode} category={category} settingsView={settingsView} /></PreviewFrame></div>
  </section>
}
