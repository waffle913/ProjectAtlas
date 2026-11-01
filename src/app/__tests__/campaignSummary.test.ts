import { describe, expect, it } from 'vitest';
import { readCampaignSummary } from '../campaignSummary';
function briefing(id: string, overrides = {}) { return { id, countryId: 'c', createdOn: '2026-01-02', access: 'public', headline: `Headline ${id}`, fact: { evidenceStatus: 'modelled' }, ...overrides }; }
function proposal(id: string, overrides = {}) { return { id, countryId: 'c', proposerPersonId: 'p', createdOn: '2026-01-01', submittedOn: '2026-01-02', resolvedOn: '2026-01-03', kind: 'fiscal_reform', status: 'enacted', ...overrides }; }
function saved(overrides: Record<string, unknown> = {}) { return {
  date: '2026-02-01', governance: { player: { controlledPersonId: 'p' }, persons: { p: { status: 'active', countryId: 'c' } }, proposals: { a: proposal('a'), b: proposal('b', { status: 'submitted' }) } },
  information: { briefings: [briefing('a')] }, ...overrides,
}; }
describe('read-only campaign summary projection', () => {
  it('projects saved facts and own proposal statuses without adding inferred history', () => {
    const input = saved(); const json = JSON.stringify(input); const summary = readCampaignSummary(json);
    expect(summary.events.map(e => e.title)).toEqual(['Headline a']);
    expect(summary.decisions).toEqual([{ id: 'a', date: '2026-01-03', title: 'Réforme fiscale', detail: 'Adoptée · a' }]);
    expect(summary.situations.map(e => e.id)).toEqual(['b']);
    expect(JSON.stringify(input)).toBe(json);
  });
  it('keeps honest empty categories for legacy/missing histories and never reads raw world/crisis analysis', () => {
    const summary = readCampaignSummary(JSON.stringify(saved({ information: undefined, crisis: { secret: 'crisis still active' }, wars: [{ secret: true }], governance: { player: { controlledPersonId: 'p' }, persons: { p: { countryId: 'c' } } } })));
    expect(summary).toEqual({ asOfDate: '2026-02-01', events: [], decisions: [], situations: [] });
  });
  it('filters other countries, confidential information, invalid access, future and malformed records', () => {
    const summary = readCampaignSummary(JSON.stringify(saved({ information: { briefings: [briefing('public'), briefing('secret', { access: 'government' }), briefing('foreign', { countryId: 'foreign' }), briefing('future', { createdOn: '2027-01-01' }), briefing('invalid', { createdOn: '2026-99-99' }), briefing('unknown-access', { access: 'unknown' }), briefing('missing-evidence', { fact: {} }), null] } })));
    expect(summary.events.map(e => e.id)).toEqual(['public']);
  });
  it('uses the existing office-access rule, including loss of office and malformed authority', () => {
    const input = saved({ information: { briefings: [briefing('secret', { access: 'government' })] } });
    const person = input.governance.persons.p as Record<string, unknown>;
    person.office = { countryId: 'c', role: 'head_of_government', authorityProfile: { capabilities: ['access_government_information'] } };
    expect(readCampaignSummary(JSON.stringify(input)).events.map(e => e.id)).toEqual(['secret']);
    person.status = 'removed'; expect(readCampaignSummary(JSON.stringify(input)).events).toEqual([]);
    person.status = 'active'; person.office = { countryId: 'c' }; expect(readCampaignSummary(JSON.stringify(input)).events).toEqual([]);
  });
  it('supports the canonical minister portfolio route and rejects a foreign office or malformed cabinet', () => {
    const input = saved({ information: { briefings: [briefing('secret', { access: 'government' })] } });
    const governance = input.governance as unknown as Record<string, unknown>;
    const person = input.governance.persons.p as Record<string, unknown>;
    person.office = { countryId: 'c', role: 'minister', authorityProfile: { capabilities: [] } };
    governance.cabinets = { c: { portfolios: { finance: { ministerPersonId: 'p' } } } };
    expect(readCampaignSummary(JSON.stringify(input)).events).toHaveLength(1);
    (person.office as Record<string, unknown>).countryId = 'foreign';
    expect(readCampaignSummary(JSON.stringify(input)).events).toEqual([]);
    (person.office as Record<string, unknown>).countryId = 'c';
    governance.cabinets = { c: { portfolios: null } };
    expect(readCampaignSummary(JSON.stringify(input)).events).toEqual([]);
  });
  it('does not turn old crisis activations into ongoing situations', () => {
    const summary = readCampaignSummary(JSON.stringify(saved({ information: { briefings: [briefing('alert', { eventType: 'crisis_activation' })] }, governance: { player: { controlledPersonId: 'p' }, persons: { p: { countryId: 'c' } }, proposals: {} } })));
    expect(summary.events).toHaveLength(1); expect(summary.situations).toEqual([]);
  });
  it('filters proposals belonging to another person/country and unsupported/future records', () => {
    const input = saved(); input.governance.proposals = Object.fromEntries([proposal('own'),proposal('other', { proposerPersonId: 'other' }),proposal('foreign', { countryId: 'foreign' }),proposal('future', { resolvedOn: '2027-01-01' }),proposal('unknown', { kind: 'unknown' }),proposal('draft', { status: 'draft' })].map(p => [p.id,p])) as typeof input.governance.proposals;
    expect(readCampaignSummary(JSON.stringify(input)).decisions.map(e => e.id)).toEqual(['own']);
  });
  it('limits recent records and preserves an unknown outcome date rather than inventing one', () => {
    const input = saved({ information: { briefings: Array.from({ length: 9 }, (_, i) => briefing(`${i}`, { createdOn: `2026-01-0${i + 1}` })) } });
    delete (input.governance.proposals.a as Partial<typeof input.governance.proposals.a>).resolvedOn;
    const summary = readCampaignSummary(JSON.stringify(input));
    expect(summary.events.map(e => e.id)).toEqual(['8','7','6','5']);
    expect(summary.decisions[0].date).toBeUndefined();
  });
  describe.each(['enacted', 'submitted'])('proposal dates for status %s', status => {
    const project = (overrides: Record<string, unknown>) => {
      const input = saved();
      input.governance.proposals.a = proposal('a', { status, ...overrides });
      const summary = readCampaignSummary(JSON.stringify(input));
      return [...summary.decisions, ...summary.situations];
    };
    describe.each(['createdOn', 'submittedOn', 'resolvedOn'])('%s, including dates not displayed', field => {
      it.each(['2026-02-02', '2026-02-30', '2026-99-99', 'not-a-date', '', null, 42])('excludes a proposal with a future or invalid date: %s', value => {
        const items = project({ [field]: value });
        expect(items.map(item => item.id)).not.toContain('a');
        expect(items.map(item => item.id)).toContain('b');
      });
      it('accepts a date exactly equal to the save date', () => {
        const item = project({ [field]: '2026-02-01' }).find(item => item.id === 'a');
        expect(item).toBeDefined();
        const displayedField = status === 'submitted' ? 'submittedOn' : 'resolvedOn';
        expect(item?.date).toBe(field === displayedField ? '2026-02-01' : status === 'submitted' ? '2026-01-02' : '2026-01-03');
      });
      it('accepts an absent date without replacing it with another date', () => {
        const item = project({ [field]: undefined }).find(item => item.id === 'a');
        expect(item).toBeDefined();
        const displayedField = status === 'submitted' ? 'submittedOn' : 'resolvedOn';
        expect(item?.date).toBe(field === displayedField ? undefined : status === 'submitted' ? '2026-01-02' : '2026-01-03');
      });
    });
    it('preserves a proposal with all three dates absent without inventing a display date', () => {
      const item = project({ createdOn: undefined, submittedOn: undefined, resolvedOn: undefined }).find(item => item.id === 'a');
      expect(item).toBeDefined();
      expect(item?.date).toBeUndefined();
    });
  });
  it.each([null, '', '{', '[]', '{}', '{"date":"2026-99-99"}'])('handles unreadable input: %s', input => {
    const summary = readCampaignSummary(input); expect(summary.error).toBeTruthy(); expect(summary.events).toEqual([]);
  });
});
