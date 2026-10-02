import type { SimulationInvariant } from '../invariants';
import { CRISIS_MODEL, CRISIS_TYPES, crisisRngKey, type CrisisEpisode, type CrisisSeverity } from './model';
import { isSimulationDate as dateValid } from '../date';
import { crisisSeverityRank, severityForPressure, tripwireFlags, tripwirePersistence, tripwireExceedance, crisisRecoveryPredicate, crisisTippingChance, crisisTripwireSpecification } from './derived';

const phases = new Set(['NORMAL', 'PRESSURE', 'ACTIVE', 'RECOVERING']);
const severities = new Set<CrisisSeverity>(['none', 'low', 'moderate', 'severe', 'critical']);
const quantity = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function validateEpisode(episode: CrisisEpisode, stateDate: string, countryId: string, regionIds: ReadonlySet<string>) {
  const errors: string[] = [], fail = (message: string) => errors.push(`${episode.id}: ${message}`);
  if (episode.countryId !== countryId || !CRISIS_TYPES.includes(episode.type)) fail('Invalid Country or crisis type.');
  if (episode.id !== `crisis:${countryId}:${episode.type}:${episode.episodeOrdinal}` || !quantity(episode.episodeOrdinal)) fail('Unstable episode ID or ordinal.');
  if (!phases.has(episode.state) || !severities.has(episode.severity) || !severities.has(episode.maximumSeverity)) fail('Invalid phase or severity.');
  if (!quantity(episode.currentPressure) || !quantity(episode.maximumPressure) || episode.maximumPressure < episode.currentPressure || !quantity(episode.dangerousEvaluations) || !quantity(episode.recoveryEvaluations)) fail('Invalid pressure or persistence counter.');
  if (episode.severity !== severityForPressure(episode.currentPressure) || episode.maximumSeverity !== severityForPressure(episode.maximumPressure) || crisisSeverityRank[episode.maximumSeverity] < crisisSeverityRank[episode.severity]) fail('Severity does not reconcile with current/maximum pressure.');
  for (const date of [episode.pressureStartedOn, episode.activatedOn, episode.recoveringOn, episode.endedOn, episode.lastEvaluatedOn]) if (date && (!dateValid(date) || date > stateDate)) fail(`Invalid or future date ${date}.`);
  if (episode.activatedOn && (!episode.pressureStartedOn || episode.activatedOn < episode.pressureStartedOn)) fail('Activation predates pressure.');
  if (episode.recoveringOn && (!episode.activatedOn || episode.recoveringOn < episode.activatedOn)) fail('Recovery predates activation.');
  if (episode.state === 'ACTIVE' && !episode.activatedOn) fail('ACTIVE episode lacks activation date.');
  if (episode.state === 'RECOVERING' && (!episode.activatedOn || !episode.recoveringOn)) fail('RECOVERING episode lacks activation/recovery dates.');
  if (episode.endedOn) fail('Current episode cannot have an end date.');
  if (episode.recoveryEvaluations > 0 && !crisisRecoveryPredicate(episode.currentTripwires)) fail('Recovery persistence contradicts the recovery predicate.');
  if (episode.activatedOn && !episode.activationSnapshot || episode.activationSnapshot && !episode.activatedOn) fail('Activation evidence is incomplete.');
  const lastEvaluatedOn = episode.lastEvaluatedOn;
  if ([episode.pressureStartedOn, episode.activatedOn, episode.recoveringOn].some(date => date && (!lastEvaluatedOn || date > lastEvaluatedOn))) fail('Episode chronology exceeds its last evaluation.');
  if (episode.regionIds?.some(id => !regionIds.has(id))) fail('Unknown Region ID.');
  const validateTripwires = (tripwires: CrisisEpisode['currentTripwires']) => {
    const ids = new Set<string>(); let reconciled = 0;
    for (const tripwire of tripwires) {
      if (ids.has(tripwire.id)) fail(`Duplicate tripwire ${tripwire.id}.`); ids.add(tripwire.id);
      if (tripwire.id !== `${episode.type}:${tripwire.indicator}` || tripwire.countryId !== countryId || tripwire.crisisType !== episode.type) fail(`Unstable tripwire identity ${tripwire.id}.`);
      if (![tripwire.currentValue, tripwire.dangerThreshold, tripwire.recoveryThreshold, tripwire.exceedanceBps, tripwire.persistenceMonths, tripwire.recoveryMonths, tripwire.severityContribution, tripwire.persistenceContribution, tripwire.deteriorationContribution, tripwire.pressureContribution].every(quantity)) fail(`Invalid quantity in ${tripwire.id}.`);
      if (tripwire.unit !== 'BASIS_POINTS' || !['above', 'below'].includes(tripwire.direction)) fail(`Invalid unit/direction in ${tripwire.id}.`);
      if (tripwire.direction === 'above' && tripwire.dangerThreshold <= tripwire.recoveryThreshold || tripwire.direction === 'below' && tripwire.dangerThreshold >= tripwire.recoveryThreshold) fail(`Missing hysteresis in ${tripwire.id}.`);
      const specification = crisisTripwireSpecification(episode.type, tripwire.indicator), provenance = tripwire.provenance;
      const allowedDetails = specification ? specification.ratioBasis
        ? (specification.ratioBasis === 'stress' ? ['ratio', 'zero_exposure', 'zero_denominator_cap'] : ['ratio']).map(basis => `${specification.detail} Ratio basis: ${basis}.`)
        : [specification.detail] : [];
      if (!specification || tripwire.sourceSystem !== specification.sourceSystem || tripwire.direction !== specification.direction
        || tripwire.dangerThreshold !== specification.thresholds[0] || tripwire.recoveryThreshold !== specification.thresholds[1]
        || !provenance || provenance.sourceSystem !== tripwire.sourceSystem || !allowedDetails.includes(provenance.detail)
        || (tripwire.sourceSystem === 'socioeconomy-0.10-v1' ? provenance.status !== 'derived' : !['sourced', 'modelled'].includes(provenance.status))) fail(`Tripwire source/provenance contradicts its model in ${tripwire.id}.`);
      const flags = tripwireFlags(tripwire.currentValue, tripwire.direction, tripwire.dangerThreshold, tripwire.recoveryThreshold);
      if (tripwire.dangerous !== flags.dangerous || tripwire.recovered !== flags.recovered || tripwire.persistenceContribution !== tripwirePersistence(flags.dangerous, tripwire.persistenceMonths)) fail(`Derived flags or persistence do not reconcile in ${tripwire.id}.`);
      if (tripwire.exceedanceBps !== tripwireExceedance(tripwire.currentValue, tripwire.direction, tripwire.dangerThreshold, tripwire.recoveryThreshold)
        || tripwire.severityContribution !== tripwire.exceedanceBps || tripwire.deteriorationContribution > tripwire.exceedanceBps
        || tripwire.recoveryMonths > 0 && !flags.recovered || flags.recovered && tripwire.recoveryMonths === 0
        || flags.dangerous && tripwire.persistenceMonths === 0) fail(`Derived exceedance/severity or recovery persistence does not reconcile in ${tripwire.id}.`);
      if (tripwire.pressureContribution !== tripwire.severityContribution + tripwire.persistenceContribution + tripwire.deteriorationContribution) fail(`Pressure components do not reconcile in ${tripwire.id}.`);
      reconciled += tripwire.pressureContribution;
    }
    return reconciled;
  };
  if (validateTripwires(episode.currentTripwires) !== episode.currentPressure) fail('Episode pressure does not reconcile with tripwires.');
  if (episode.activatedOn && episode.activationRngKey !== crisisRngKey(countryId, episode.type, episode.activatedOn, episode.episodeOrdinal)) fail('Activation RNG key is not deterministic.');
  if (episode.activationSnapshot) {
    const snapshot = episode.activationSnapshot;
    if (!dateValid(snapshot.date) || snapshot.date !== episode.activatedOn || snapshot.date > stateDate) fail('Activation snapshot date mismatch.');
    if (!quantity(snapshot.pressure) || snapshot.pressure > episode.maximumPressure || !severities.has(snapshot.severity) || snapshot.severity !== severityForPressure(snapshot.pressure)
      || !quantity(snapshot.tippingChanceBps) || snapshot.tippingChanceBps > 10_000 || !quantity(snapshot.tippingRollBps) || snapshot.tippingRollBps >= 10_000
      || !Array.isArray(snapshot.tripwires)) fail('Invalid activation snapshot metrics.');
    else if (validateTripwires(snapshot.tripwires) !== snapshot.pressure) fail('Activation pressure does not reconcile with snapshot tripwires.');
    if (snapshot.tippingChanceBps !== crisisTippingChance(snapshot.tripwires) || snapshot.tippingRollBps >= snapshot.tippingChanceBps) fail('Activation contradicts the deterministic tipping condition.');
  }
  return errors;
}

export const crisisInvariant: SimulationInvariant = {
  id: 'crisis-episodes',
  check: (state, context) => {
    const crisis = state.crisis, errors: string[] = [];
    if (!crisis || crisis.version !== CRISIS_MODEL.version || !crisis.countries || !quantity(crisis.evaluations)) return ['Malformed crisis state.'];
    if (!crisis.initializedOn) return Object.keys(crisis.countries).length || crisis.lastMonthlyDate ? ['Crisis state lacks initialization date.'] : [];
    if (!dateValid(crisis.initializedOn) || crisis.initializedOn! > state.date || crisis.lastMonthlyDate && (!dateValid(crisis.lastMonthlyDate) || crisis.lastMonthlyDate > state.date)) errors.push('Invalid crisis state dates.');
    const globalIds = new Set<string>();
    for (const countryId of context.countryIds) if (!crisis.countries[countryId]) errors.push(`Missing crisis state for Country ${countryId}.`);
    for (const [countryId, country] of Object.entries(crisis.countries)) {
      if (!context.countryIds.has(countryId)) errors.push(`Crisis state references unknown Country ${countryId}.`);
      if (country.history.length > CRISIS_MODEL.historyLimitPerCountry) errors.push(`Crisis history limit exceeded for ${countryId}.`);
      for (const type of CRISIS_TYPES) {
        const episode = country.currentByType[type];
        if (!episode) errors.push(`Missing ${type} monitor for ${countryId}.`);
        else {
          errors.push(...validateEpisode(episode, state.date, countryId, context.regionIds));
          if (globalIds.has(episode.id)) errors.push(`Duplicate crisis ID ${episode.id}.`); globalIds.add(episode.id);
        }
      }
      for (const old of country.history) {
        if (globalIds.has(old.id)) errors.push(`Duplicate crisis ID ${old.id}.`); globalIds.add(old.id);
        if (old.countryId !== countryId || !CRISIS_TYPES.includes(old.type) || !quantity(old.episodeOrdinal)
          || old.id !== `crisis:${countryId}:${old.type}:${old.episodeOrdinal}` || !dateValid(old.endedOn) || old.endedOn > state.date
          || !dateValid(old.pressureStartedOn) || old.endedOn < old.pressureStartedOn
          || old.episodeOrdinal >= country.currentByType[old.type]?.episodeOrdinal) errors.push(`Malformed crisis history ${old.id}.`);
        if (old.activatedOn && (!dateValid(old.activatedOn) || old.activatedOn < old.pressureStartedOn || old.activatedOn > old.endedOn)
          || old.recoveringOn && (!dateValid(old.recoveringOn) || !old.activatedOn || old.recoveringOn < old.activatedOn || old.recoveringOn > old.endedOn)) errors.push(`Incoherent crisis history chronology ${old.id}.`);
        if (!quantity(old.maximumPressure) || old.maximumSeverity !== severityForPressure(old.maximumPressure)) errors.push(`Malformed crisis history metrics ${old.id}.`);
      }
    }
    return errors;
  },
};
