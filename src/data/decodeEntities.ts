/** Decode HTML numeric (`&#231;`, `&#xE7;`) and common named character references
 *  in sourced display names (e.g. `Cura&#231;ao` → `Curaçao`). Presentation-only:
 *  permanent IDs, geometry and provenance are never derived from these names. */
export function decodeHtmlEntities(value: string): string;
export function decodeHtmlEntities(value: undefined): undefined;
export function decodeHtmlEntities(value: string | undefined): string | undefined;
export function decodeHtmlEntities(value: string | undefined): string | undefined {
  if (value === undefined || !value.includes('&')) return value;
  return value.replace(/&#(\d{1,7});|&#[xX]([0-9a-fA-F]{1,6});|&(amp|lt|gt|quot|apos|nbsp|copy|reg|hellip|ndash|mdash|rsquo|lsquo|ouml|uuml|eacute|ccedil|Aring|ocirc|Ouml);/g, (_match, dec: string | undefined, hex: string | undefined, named: string | undefined) => {
    if (dec !== undefined) {
      const code = Number(dec);
      return code >= 32 && code !== 0x7f ? String.fromCodePoint(code) : _match;
    }
    if (hex !== undefined) {
      const code = parseInt(hex, 16);
      return code >= 32 && code !== 0x7f ? String.fromCodePoint(code) : _match;
    }
    switch (named) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
      case 'nbsp': return '\u00a0';
      case 'copy': return '©';
      case 'reg': return '®';
      case 'hellip': return '…';
      case 'ndash': return '–';
      case 'mdash': return '—';
      case 'rsquo': return '\u2019';
      case 'lsquo': return '\u2018';
      case 'ouml': return 'ö';
      case 'uuml': return 'ü';
      case 'eacute': return 'é';
      case 'ccedil': return 'ç';
      case 'Aring': return 'Å';
      case 'ocirc': return 'ô';
      case 'Ouml': return 'Ö';
      default: return _match;
    }
  });
}
