import { useMemo, useState } from 'react';
import type { SimulationState } from '../types';
import { condemn, hasInternationalAuthority, imposeExportRestriction, imposeImportRestriction, liftSanction, publicInternationalActions } from '../simulation/international/runtime';
import { applyConcession } from '../simulation/diplomacy/integration';
import { TRADE_CATEGORIES, type TradeCategory } from '../simulation/trade/model';

const ACTION_KIND_LABELS: Record<string, string> = {
  condemnation: 'Condemnation',
  import_restriction: 'Import restriction',
  export_restriction: 'Export restriction',
};

export function DiplomacyPanel({ state, countryId, personId, onStateChange, countriesById }: {
  state: SimulationState;
  countryId: string;
  personId: string;
  onStateChange: (next: SimulationState) => void;
  countriesById?: ReadonlyMap<string, { commonName: string }>;
}) {
  const authority = hasInternationalAuthority(state, countryId, personId);
  const countryName = (id: string) => countriesById?.get(id)?.commonName ?? 'Another country';
  const actions = publicInternationalActions(state, countryId);
  const targets = useMemo(() => (countriesById
    ? [...countriesById.entries()].filter(([id]) => id !== countryId).sort((a, b) => a[1].commonName.localeCompare(b[1].commonName))
    : []), [countriesById, countryId]);

  const person = state.governance.persons[personId];
  const mandate = person?.office?.role === 'head_of_state' ? { basis: 'presidential_head_of_state' as const } : { basis: 'head_of_government' as const };

  const [target, setTarget] = useState('');
  const [actionKind, setActionKind] = useState<'condemnation' | 'restriction' | 'concession'>('condemnation');
  const [direction, setDirection] = useState<'import' | 'export'>('import');
  const [categories, setCategories] = useState<TradeCategory[]>([]);
  const [note, setNote] = useState('');
  const [concessionKind, setConcessionKind] = useState<'relation_adjustment' | 'tariff_reduction'>('relation_adjustment');
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('');

  const toggleCategory = (category: TradeCategory) => {
    setCategories(current => current.includes(category) ? current.filter(item => item !== category) : [...current, category]);
  };
  const command = (run: () => SimulationState) => {
    try { onStateChange(run()); setMessage('Decision recorded; it takes effect through the canonical international and trade systems.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const submit = () => {
    if (!target) { setMessage('Select a target Country first.'); return; }
    if (actionKind === 'condemnation') {
      command(() => condemn(state, countryId, target, personId, note));
    } else if (actionKind === 'restriction') {
      command(() => direction === 'import'
        ? imposeImportRestriction(state, countryId, target, personId, categories)
        : imposeExportRestriction(state, countryId, target, personId, categories));
    } else {
      command(() => applyConcession(state, {
        id: `concession:${state.date}:${countryId}:${target}:${concessionKind}`,
        fromCountryId: countryId, mandate, toCountryId: target, kind: concessionKind,
        value: Number(value), date: state.date, note,
      }, personId));
    }
  };

  return <section className="cockpit-section">
    <h2>Diplomacy</h2>
    <p>Condemnations, trade restrictions and concessions map onto the canonical international-action system. An intervention is a military operation, not a trade control.</p>

    <h3>Recorded international actions</h3>
    {actions.length
      ? actions.map(action => <p key={action.id}>{countryName(action.actorCountryId)} → {countryName(action.targetCountryId)}: {ACTION_KIND_LABELS[action.kind] ?? action.kind}{action.categories.length ? ` (${action.categories.join(', ')})` : ''} · declared {action.declaredOn} · effective {action.effectiveOn} · {action.status}{action.liftDeclaredOn ? ` · lift ${action.liftDeclaredOn}` : ''}</p>)
      : <p>No recorded international actions involving your Country.</p>}

    {authority ? <>
      <h3>Commands</h3>
      <label>Action<select value={actionKind} onChange={e => setActionKind(e.target.value as typeof actionKind)}>
        <option value="condemnation">Condemn a Country</option>
        <option value="restriction">Impose a trade restriction</option>
        <option value="concession">Offer a concession</option>
      </select></label>
      <label>Target Country<select value={target} onChange={e => setTarget(e.target.value)}><option value="">—</option>{targets.map(([id, country]) => <option key={id} value={id}>{country.commonName}</option>)}</select></label>
      {actionKind === 'condemnation' && <label>Reason<input value={note} onChange={e => setNote(e.target.value)} placeholder="A represented reason is required" /></label>}
      {actionKind === 'restriction' && <>
        <label>Direction<select value={direction} onChange={e => setDirection(e.target.value as typeof direction)}><option value="import">Import restriction (blocks the target's goods entering your Country)</option><option value="export">Export restriction (blocks your goods leaving to the target)</option></select></label>
        <div className="category-picker">{TRADE_CATEGORIES.map(category => <label key={category} className="category-toggle"><input type="checkbox" checked={categories.includes(category)} onChange={() => toggleCategory(category)} />{category}</label>)}</div>
      </>}
      {actionKind === 'concession' && <>
        <label>Concession kind<select value={concessionKind} onChange={e => setConcessionKind(e.target.value as typeof concessionKind)}><option value="relation_adjustment">Relation adjustment (signed score)</option><option value="tariff_reduction">Lower your ordinary customs rate for the target's goods</option></select></label>
        <label>{concessionKind === 'relation_adjustment' ? 'Score change (-100…100)' : 'Tariff reduction (bps)'}<input type="number" value={value} onChange={e => setValue(e.target.value)} /></label>
      </>}
      <button onClick={submit} disabled={!target || (actionKind === 'restriction' && categories.length === 0)}>Record decision</button>
      {actions.filter(action => action.actorCountryId === countryId && action.status === 'active' && action.kind !== 'condemnation').map(action => (
        <button key={action.id} onClick={() => command(() => liftSanction(state, action.id, personId))}>Lift {ACTION_KIND_LABELS[action.kind]} on {countryName(action.targetCountryId)}</button>
      ))}
    </> : <p>This person lacks resolved executive diplomatic authority (head of government/state with government-information access). Country selection and party leadership grant none.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
