import type { SimulationState } from '../types';
import { hasGovernmentInformationAccess } from '../simulation/information/runtime';

export interface CampaignSummaryItem {
  id: string;
  date?: string;
  title: string;
  detail: string;
}
export interface CampaignSummary {
  asOfDate?: string;
  events: CampaignSummaryItem[];
  decisions: CampaignSummaryItem[];
  situations: CampaignSummaryItem[];
  error?: string;
}
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const date = (value: unknown): value is string => text(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const recent = (items: CampaignSummaryItem[]) => items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id)).slice(0, 4);

/** Whitelisted presentation projection of saved JSON, never a restored/second engine state.
 * No migration, simulation command, write, raw crisis state or proposal analysis is used.
 * Loading still goes through restoreSimulationState and its full invariant validation.
 */
export function readCampaignSummary(serialized: string | null): CampaignSummary {
  const empty: CampaignSummary = { events: [], decisions: [], situations: [] };
  if (!serialized) return { ...empty, error: 'Cette sauvegarde ne peut pas être lue.' };
  try {
    const raw: unknown = JSON.parse(serialized);
    const saved = object(raw);
    if (!saved || !date(saved.date)) return { ...empty, error: 'Le format du résumé de cette sauvegarde est indisponible.' };
    const asOfDate = saved.date;
    const validDate = (value: unknown): value is string => date(value) && value <= asOfDate;
    const governance = object(saved.governance);
    const player = object(governance?.player);
    const persons = object(governance?.persons);
    const personId = player?.controlledPersonId;
    const person = text(personId) ? object(persons?.[personId]) : undefined;
    if (!text(personId) || !person || !text(person.countryId)) return { ...empty, asOfDate };
    const countryId = person.countryId;
    // Validate the exact fields read by the existing access predicate. A malformed
    // office/cabinet cannot grant access; public briefings remain available.
    const office = object(person.office);
    const authority = object(office?.authorityProfile);
    const cabinet = object(object(governance?.cabinets)?.[countryId]);
    const portfolios = object(cabinet?.portfolios);
    const safeCabinet = !cabinet || (portfolios && Object.values(portfolios).every(value => object(value)));
    const canInspect = Boolean(office && Array.isArray(authority?.capabilities) && safeCabinet
      && hasGovernmentInformationAccess(raw as SimulationState, personId, countryId));
    const information = object(saved.information);
    const events: CampaignSummaryItem[] = [];
    for (const value of Array.isArray(information?.briefings) ? information.briefings : []) {
      const briefing = object(value);
      const fact = object(briefing?.fact);
      if (!briefing || briefing.countryId !== countryId || !text(briefing.id) || !text(briefing.headline)
        || !validDate(briefing.createdOn) || !fact || !text(fact.evidenceStatus)
        || !['sourced','derived','modelled','partial','unavailable'].includes(fact.evidenceStatus)
        || !(briefing.access === 'public' || (briefing.access === 'government' && canInspect))) continue;
      events.push({ id: briefing.id, date: briefing.createdOn, title: briefing.headline,
        detail: `${briefing.access === 'public' ? 'Information publique' : 'Information gouvernementale'} · ${fact.evidenceStatus}` });
    }
    const decisions: CampaignSummaryItem[] = [];
    const situations: CampaignSummaryItem[] = [];
    const kinds: Record<string, string> = { fiscal_reform: 'Réforme fiscale', constitutional_amendment: 'Amendement constitutionnel' };
    const statuses: Record<string, string> = { enacted: 'Adoptée', rejected: 'Rejetée', withdrawn: 'Retirée', submitted: 'Soumise — en attente' };
    for (const value of Object.values(object(governance?.proposals) ?? {})) {
      const proposal = object(value);
      if (!proposal || proposal.proposerPersonId !== personId || proposal.countryId !== countryId
        || !text(proposal.id) || !text(proposal.kind) || !Object.hasOwn(kinds, proposal.kind)
        || !text(proposal.status) || !Object.hasOwn(statuses, proposal.status)
        || [proposal.createdOn, proposal.submittedOn, proposal.resolvedOn]
          .some(value => value !== undefined && !validDate(value))) continue;
      // A status is the saved outcome, not a reconstruction of who voted or why.
      const when = proposal.status === 'submitted' ? proposal.submittedOn : proposal.resolvedOn;
      const item = { id: proposal.id, date: validDate(when) ? when : undefined,
        title: kinds[proposal.kind], detail: `${statuses[proposal.status]} · ${proposal.id}` };
      (proposal.status === 'submitted' ? situations : decisions).push(item);
    }
    return { asOfDate, events: recent(events), decisions: recent(decisions), situations: recent(situations) };
  } catch {
    return { ...empty, error: 'Le résumé de cette sauvegarde est illisible. Le chargement reste soumis aux validations habituelles.' };
  }
}
