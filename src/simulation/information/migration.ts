import type { SimulationState } from '../../types';
import { INFORMATION_VERSION, referencedGovernmentReportIds, retainCountryBriefings } from './model';

/** Explicit information-subversion migration; canonical political history is untouched. */
export function upgradeInformationV1(state: SimulationState): SimulationState {
  const version: string = state.information.version;
  if (version === INFORMATION_VERSION) return state;
  if (version !== 'information-0.15-v1') throw new Error(`Unsupported government information version: ${version}.`);
  if (!state.information.initializedOn || !Array.isArray(state.information.briefings)
    || !state.information.latestGovernmentReports || !state.information.governmentReportsById) throw new Error('Malformed government information state.');
  const briefings = retainCountryBriefings(state.information.briefings.filter(item =>
    item.eventType !== 'crisis_activation' && item.fact.kind !== 'crisis_activation',
  ));
  const references = referencedGovernmentReportIds({ ...state.information, briefings });
  return {
    ...state,
    information: {
      ...state.information,
      version: INFORMATION_VERSION,
      // V1 estimates copied Reality and did not identify the analyzed proposal content.
      proposalEstimates: [],
      briefings,
      governmentReportsById: Object.fromEntries(Object.entries(state.information.governmentReportsById).filter(([id]) => references.has(id))),
    },
  };
}
