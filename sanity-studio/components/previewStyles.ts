import site from '../../src/styles.css?raw'
import header from '../../src/components/siteHeader.css?raw'
import blog from '../../src/blog/blog.css?raw'
import contact from '../../src/components/contactSection.css?raw'
import audit from '../../src/components/auditSection.css?raw'
import legal from '../../src/components/legalPanel.css?raw'
import modal from '../../src/components/modal.css?raw'
import general from '../../public/fonts/general-sans-variable-49d3fbd2.woff2?url'
import gambetta from '../../public/fonts/gambetta-variable-f705e571.woff2?url'
import gambettaItalic from '../../public/fonts/gambetta-variable-italic-635900c5.woff2?url'
import switzer from '../../public/fonts/switzer-variable-d1bf801f.woff2?url'
import inter from '../../public/fonts/inter-latin-3100e775.woff2?url'
import interExt from '../../public/fonts/inter-latin-ext-34b9c504.woff2?url'
import serif from '../../public/fonts/source-serif-4-latin-f2ea9c12.woff2?url'
import serifExt from '../../public/fonts/source-serif-4-latin-ext-155f6e70.woff2?url'
import serifItalic from '../../public/fonts/source-serif-4-latin-italic-96e63932.woff2?url'
import serifExtItalic from '../../public/fonts/source-serif-4-latin-ext-italic-2078240c.woff2?url'

const fonts: Record<string, string> = {
  'general-sans-variable-49d3fbd2.woff2': general, 'gambetta-variable-f705e571.woff2': gambetta,
  'gambetta-variable-italic-635900c5.woff2': gambettaItalic, 'switzer-variable-d1bf801f.woff2': switzer,
  'inter-latin-3100e775.woff2': inter, 'inter-latin-ext-34b9c504.woff2': interExt,
  'source-serif-4-latin-f2ea9c12.woff2': serif, 'source-serif-4-latin-ext-155f6e70.woff2': serifExt,
  'source-serif-4-latin-italic-96e63932.woff2': serifItalic, 'source-serif-4-latin-ext-italic-2078240c.woff2': serifExtItalic,
}
export const previewStyles = [site, header, blog, modal, contact, audit, legal].join('\n').replace(/\/fonts\/([^'"\)]+)/g, (_, name: string) => fonts[name] ?? '') + `
html, body { color:#fff; margin:0; height:auto; min-height:100%; overflow:auto; background:#050507; }
*, *::before, *::after { animation:none!important; transition:none!important; }
.preview-content {padding:24px; overflow-wrap:anywhere;}
.preview-content .case-panel {position:relative; inset:auto; height:auto; max-height:none; margin:auto; transform:none; opacity:1; visibility:visible; pointer-events:auto;}
.preview-content .case-panel__body {max-height:none; overflow:visible;}

.preview-content .brand-samples {display:flex; align-items:center; gap:24px; padding:24px; max-width:440px; margin:auto;}
.preview-content .brand-samples img {object-fit:contain; width:calc(50% - 12px); height:120px;}
.preview-content .brand-samples p {font-size:15px;}
.preview-content .blog-root {position:relative; height:auto; min-height:100vh; overflow:visible; padding-top:0;}
.preview-content .blog-article {padding-top:32px;}
.preview-content .blog-card {max-width:360px; margin:24px auto;}
.preview-content .preview-contact {max-width:520px; margin:auto; max-height:none;}
.preview-content .preview-note {font:15px/1.5 system-ui; color:#fff; margin:0 0 20px;}
.preview-content .search-result {background:#fff;color:#202124;padding:24px;font:16px/1.5 Arial,sans-serif;max-width:640px;margin:24px auto;}
.preview-content .search-result h2 {font:22px/1.3 Arial,sans-serif;color:#1a0dab;margin:8px 0;}
.preview-content .social-result {max-width:600px;margin:24px auto;background:#f5f5f5;color:#111;font:16px/1.5 system-ui;}
.preview-content .social-result img {width:100%;aspect-ratio:1200/630;object-fit:cover;display:block;}
.preview-content .social-result div {padding:16px;}
/* Representative light behind the real translucent materials, not a live scene. */
.preview-scene {
  min-height:100vh; color:var(--text-primary); color-scheme:dark;
  background:radial-gradient(ellipse at 75% 30%, rgba(143,167,193,.7), transparent 55%),
    radial-gradient(ellipse at 20% 80%, rgba(37,74,104,.8), transparent 60%), #0b111b;
  background-attachment:fixed;
}
.preview-settings {position:relative; isolation:isolate;}
.preview-settings .modal-scrim {position:relative; min-height:100vh;}
.preview-settings .audit-overlay {position:relative; min-height:100vh; overflow:hidden;}
.preview-settings .audit-curtain {position:relative; min-height:100vh; transform:none;}
.preview-settings .audit-panel {position:relative; min-height:100vh;}
.preview-settings .audit-group {opacity:1; transform:none;}
.preview-settings .audit-success::before {transform:scaleX(1);}
.preview-copyright {position:relative; padding:16px; font-size:12px; color:var(--text-secondary);}
@media(max-width:450px){.preview-content {padding:12px}.preview-contact{padding:16px!important}}
`
