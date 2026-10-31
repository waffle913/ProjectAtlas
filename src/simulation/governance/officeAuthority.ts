import type { SimulationState } from '../../types';
import type { AuthorityCapability, PoliticalOfficeRole } from './model';
import {
  GOVERNMENT_AGENDA_CAPABILITIES, HEAD_OF_STATE_FUNCTIONS, LEGISLATOR_CAPABILITIES, sourcedExecutiveSystem, withheldExecutiveCapabilities,
} from './officeEvidence';

/**
 * Institutional authority of a *function*, independent of who holds it.
 *
 * A political office is three separate things: the function (head of state, head of government,
 * legislator, minister), the person occupying it, and the competences the institutions actually
 * represent for that function. An election, a succession or a government formation changes the
 * holder; it never invents and never silently removes the competences of the function. This module
 * resolves the third element from the institutional state in force — the sourced executive system of
 * the political registry plus the constitutional rules already represented by the constitution
 * subsystem (`government.responsibility`, `parliament.power`, `headOfState.selectionMethod`) — so
 * there is no second, competing authority system.
 *
 * What is modelled and what is not is stated per resolution: a rule derived from a sourced system or
 * from the constitution in force is `resolved`; a distribution the represented rules do not fully
 * determine (the semi-presidential split, and a Country with no institutional record at all) is
 * `modelled`, carries an explicit limitation, and never claims to be an observed constitutional rule.
 * A competence the represented rules withhold is reported in `withheldCapabilities`, never invented.
 */
export type ExecutiveArrangement = 'presidential' | 'parliamentary' | 'semi_presidential' | 'generic';

export type OfficeAuthorityBasis =
  | 'constitutional_responsibility'
  | 'sourced_executive_system'
  | 'modelled_semi_presidential_split'
  | 'modelled_generic_office_scope'
  | 'office_role';

export type OfficeAuthorityStatus = 'resolved' | 'modelled' | 'not_executive';

export interface OfficeAuthority {
  role: PoliticalOfficeRole;
  countryId: string;
  status: OfficeAuthorityStatus;
  basis: OfficeAuthorityBasis;
  arrangement: ExecutiveArrangement | 'not_executive';
  capabilities: AuthorityCapability[];
  withheldCapabilities: AuthorityCapability[];
  limitations: string[];
}

export interface ExecutiveArrangementResolution {
  arrangement: ExecutiveArrangement;
  basis: Extract<OfficeAuthorityBasis, 'constitutional_responsibility' | 'sourced_executive_system' | 'modelled_semi_presidential_split' | 'modelled_generic_office_scope'>;
  limitation: string;
}

const agenda = (): AuthorityCapability[] => [...GOVERNMENT_AGENDA_CAPABILITIES];
const stateFunctions = (): AuthorityCapability[] => [...HEAD_OF_STATE_FUNCTIONS];

/** The executive arrangement the represented rules establish for a Country, most decisive rule
 *  first. The constitution in force wins over the static classification, so an amendment that makes
 *  the government answerable to the chamber (or removes that responsibility) is honoured without a
 *  second system of authority. */
export function executiveArrangement(state: SimulationState, countryId: string): ExecutiveArrangementResolution {
  const responsibility = state.constitution?.countries?.[countryId]?.government?.responsibility;
  if (responsibility === 'government_censurable' || responsibility === 'leader_censurable') return {
    arrangement: 'parliamentary', basis: 'constitutional_responsibility',
    limitation: 'The constitution in force makes the government answerable to the chamber, so the head of government carries the government agenda and the head of state carries none.',
  };
  const system = sourcedExecutiveSystem(countryId);
  if (system === 'presidential') return {
    arrangement: 'presidential', basis: 'sourced_executive_system',
    limitation: 'The political registry establishes a presidential system: the head of state carries the government agenda. The head-of-government office also carries it, because the engine appoints that person as the government's head and does not model how much of the executive a cabinet chief really holds; that residual overlap is a documented modelling gap, not a sourced claim.',
  };
  if (system === 'parliamentary' || system === 'monarchy_parliamentary') return {
    arrangement: 'parliamentary', basis: 'sourced_executive_system',
    limitation: 'The political registry establishes a parliamentary system: the head of government carries the government agenda, and the head of state is ceremonial (no governing capability is invented for it).',
  };
  if (system === 'semi_presidential') return {
    arrangement: 'semi_presidential', basis: 'modelled_semi_presidential_split',
    limitation: 'A sourced semi-presidential system is represented. The distribution modelled here gives the government agenda to the head of government (the government answers to a chamber with censure power in the represented parliament) and the state functions — government information and military command — to the head of state. This is a modelled split, not a claim about a specific constitution; a cohabitation or a sourced text that distributes the powers differently is not asserted.',
  };
  return {
    arrangement: 'generic', basis: 'modelled_generic_office_scope',
    limitation: 'No sourced executive system and no decisive constitutional rule are represented for this Country. The generic modelled office scope applies: the head of government carries the government agenda and the head of state carries the state functions. Nothing here is a sourced institutional claim; admissible institutional data can resolve it later (see docs/executive-authority-capabilities.md).',
  };
}

/** The competences of an office function in a Country, resolved from the institutional state. */
export function officeAuthority(state: SimulationState, countryId: string, role: PoliticalOfficeRole): OfficeAuthority {
  if (role === 'minister') return {
    role, countryId, status: 'not_executive', basis: 'office_role', arrangement: 'not_executive',
    capabilities: [], withheldCapabilities: withheldExecutiveCapabilities(role, []),
    limitations: ['A minister holds a portfolio and suggests policy; it carries no legislative, budget, military or construction capability.'],
  };
  if (role === 'legislator') return {
    role, countryId, status: 'not_executive', basis: 'office_role', arrangement: 'not_executive',
    capabilities: [...LEGISLATOR_CAPABILITIES], withheldCapabilities: [],
    limitations: ['A parliamentary mandate carries the suffrage; the chamber decides through the modelled seat/party estimate, independently of the executive.'],
  };
  const resolution = executiveArrangement(state, countryId);
  // The head of government is the government's head in every represented arrangement, so it carries
  // the government agenda (never the whole capability set, never the parliamentary suffrage). What
  // changes between arrangements is the head of state: the executive itself in a presidential system,
  // a state-function holder in a shared arrangement, and ceremonial in a parliamentary one.
  const capabilities = role === 'head_of_government' ? agenda()
    : resolution.arrangement === 'presidential' ? agenda()
      : resolution.arrangement === 'parliamentary' ? []
        : stateFunctions();
  const roleLimitation = role === 'head_of_government'
    ? 'The head of government carries the government agenda of this Country. It carries neither the parliamentary suffrage nor the state functions the represented arrangement vests in the head of state where that office holds them exclusively.'
    : capabilities.length === 0
      ? 'This head of state is ceremonial in the represented arrangement: it carries no governing capability, and no state function is invented for it.'
      : resolution.arrangement === 'presidential'
        ? 'The head of state is the executive in this presidential arrangement and carries the government agenda.'
        : 'The head of state carries the state functions represented for this arrangement (government information and military command); the government agenda belongs to the head of government.';
  return {
    role, countryId,
    status: resolution.basis === 'constitutional_responsibility' || resolution.basis === 'sourced_executive_system' ? 'resolved' : 'modelled',
    basis: resolution.basis, arrangement: resolution.arrangement,
    capabilities, withheldCapabilities: withheldExecutiveCapabilities(role, capabilities),
    limitations: [roleLimitation, resolution.limitation],
  };
}

/** The competences already established for an office function of this Country, or `undefined` when
 *  nobody currently holds it. A replacement holder inherits these, so an election, a succession or a
 *  formation never silently widens or invents the function's powers. */
export function establishedOfficeCapabilities(state: SimulationState, countryId: string, role: PoliticalOfficeRole): AuthorityCapability[] | undefined {
  const holder = Object.values(state.governance.persons)
    .filter(person => person.office?.countryId === countryId && person.office.role === role)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  return holder ? [...holder.office!.authorityProfile.capabilities] : undefined;
}
