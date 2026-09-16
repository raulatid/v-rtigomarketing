import type { DistrictContent } from '../../../content/types';
import { splitServiceCopy } from '../district/serviceCopy';
import type { ServiceSymbolBinding } from '../scene/cityDistrictBindings';
import { campusLabel, DEFAULT_LOCALE } from './campusLabels';
import { parseServicesContent, type ServicesContent } from './content/servicesContent';

/** Map CMS copy to the campus. An explicit line break preserves the editor's
 * two-line explanation; older prose uses its opening summary. Detail and the
 * legacy caption remain in the portable model but are not rendered by the site.
 * Highlights use the existing Sanity measures field, preserving published data.
 */
export function buildServicesContent(
  content: DistrictContent,
  symbols: readonly ServiceSymbolBinding[],
  locale: string = DEFAULT_LOCALE,
): ServicesContent | null {
  const services = content.services.map((service) => {
    const symbol = symbols.find((row) => row.serviceId === service.id);
    const copy = splitServiceCopy(service.body);
    const opening = service.body.trim().split(/\n\s*\n/)[0]!;
    const rest = copy.detail.startsWith(copy.summary)
      ? copy.detail.slice(copy.summary.length).trim()
      : '';
    return {
      id: service.id,
      title: service.title,
      subtitle: opening.includes('\n') ? opening : copy.summary,
      detail: rest === '' ? copy.detail : rest,
      icon: symbol?.icon,
      figure: symbol?.figure,
      color: service.particleColor,
      caption: service.figureCaption,
      measures: service.measures,
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
