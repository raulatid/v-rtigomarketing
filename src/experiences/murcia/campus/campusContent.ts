import type { DistrictContent } from '../../../content/types';
import { splitServiceCopy } from '../district/serviceCopy';
import type { ServiceSymbolBinding } from '../scene/cityDistrictBindings';
import { campusLabel, DEFAULT_LOCALE } from './campusLabels';
import { parseServicesContent, type ServicesContent } from './content/servicesContent';

/**
 * The campus's content, built from what the CMS publishes. No Sanity change.
 *
 * The lab authored a document shaped for the campus — an intro and, per
 * service, a subtitle, a detail paragraph, a symbol and a figure. The CMS has
 * `DistrictContent` with `Service = { id, title, body }`, and this is the
 * mapping between them:
 *
 *   intro.title      DistrictContent.label            "Servicios"
 *   intro.subtitle   DistrictContent.summary          the district's one line
 *   intro.hint       campusLabels 'hint'              chrome, not copy
 *   subtitle         the body's opening               `splitServiceCopy`
 *   detail           the rest of the body             what [+] opens
 *   icon, figure     scene/cityDistrictBindings.ts    scene composition
 *
 * `DistrictContent.intro`, a 200-character paragraph, has no slot: the
 * overlay's hint is a single line of chrome. It stays unread, as it was under
 * the display district.
 *
 * ## Why detail is the REST of the body
 *
 * `splitServiceCopy.detail` is the whole body, because the display it was
 * written for replaced the summary with the body. The overlay does not: it
 * shows the subtitle and adds the detail under it, so the whole body would
 * print the opening line twice. A body that IS its opening — one sentence —
 * has no rest; then the detail is the whole body, because an empty detail
 * would fail the parser and take the entire section with it over one short
 * paragraph (`serviceCopy.ts` calls this "a copy problem, visible to the
 * editor who wrote it").
 *
 * Returns the parser's verdict: a whole document, or null. A service with no
 * symbol row, or a row naming a figure the particles cannot draw, rejects the
 * set, and the caller leaves the campus as scenery.
 */
export function buildServicesContent(
  content: DistrictContent,
  symbols: readonly ServiceSymbolBinding[],
  locale: string = DEFAULT_LOCALE,
): ServicesContent | null {
  const services = content.services.map((service) => {
    const symbol = symbols.find((row) => row.serviceId === service.id);
    const copy = splitServiceCopy(service.body);
    const rest = copy.detail.startsWith(copy.summary)
      ? copy.detail.slice(copy.summary.length).trim()
      : '';
    return {
      id: service.id,
      title: service.title,
      subtitle: copy.summary,
      detail: rest === '' ? copy.detail : rest,
      icon: symbol?.icon,
      figure: symbol?.figure,
      color: service.particleColor,
    };
  });

  return parseServicesContent({
    intro: {
      title: content.label,
      subtitle: content.summary,
      hint: campusLabel(locale, 'hint'),
      color: content.particleColor,
    },
    services,
  });
}
