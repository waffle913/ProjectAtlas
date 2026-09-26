import type { EntityKind } from '../types';

/** Explicit 2026-start classification overrides. The Natural Earth label is preserved separately. */
const explicitKinds: Record<string, EntityKind> = {
  ATA: 'other', ESH: 'disputed', PSX: 'disputed', SOL: 'disputed', CYN: 'disputed',
  ATC: 'dependency', FLK: 'dependency', GRL: 'dependency', GIB: 'dependency',
  PRI: 'dependency', GUM: 'dependency', VIR: 'dependency', SHN: 'dependency',
  SPM: 'dependency', GLP: 'dependency', MTQ: 'dependency', REU: 'dependency', MYT: 'dependency',
  NCL: 'dependency', PYF: 'dependency', WLF: 'dependency', COK: 'dependency', NIU: 'dependency'
};

export function normalizeEntityKind(externalCode: string | undefined, sourceClassification: string): EntityKind {
  if (externalCode && explicitKinds[externalCode]) return explicitKinds[externalCode];
  const source = sourceClassification.toLowerCase();
  if (source.includes('dependency') || source.includes('territory')) return 'dependency';
  if (source.includes('disputed') || source.includes('indeterminate')) return 'disputed';
  if (source.includes('sovereign country') || source.includes('country')) return 'sovereign';
  return 'other';
}
