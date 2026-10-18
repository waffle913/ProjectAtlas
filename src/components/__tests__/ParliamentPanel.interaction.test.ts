// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { SimulationState } from '../../types';
import { ParliamentPanel } from '../ParliamentPanel';

// React 19's act() asserts this flag in the act environment so state updates flush synchronously.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COUNTRY = 'country.a';
const PERSON = 'person.a';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function person(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PERSON, status: 'active', countryId: COUNTRY, displayName: 'Leader', createdOn: '2026-01-01', isPartyLeader: false,
    ...overrides,
  };
}

function proposal(id: string, status: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, kind: 'fiscal_reform', status, countryId: COUNTRY, effectiveDate: '2026-02-01', ...extra };
}

/** An eligible opposition party leader with no executive office and one submitted proposal. */
function oppositionLeaderState(): SimulationState {
  return {
    governance: {
      persons: { [PERSON]: person({ isPartyLeader: true, partyId: 'party.a' }) },
      player: { controlledPersonId: PERSON },
      cabinets: {},
      proposals: { 'prop.1': proposal('prop.1', 'submitted'), 'prop.2': proposal('prop.2', 'submitted') },
    },
    date: '2026-01-01',
  } as unknown as SimulationState;
}

function nonLeaderState(): SimulationState {
  return {
    governance: {
      persons: { [PERSON]: person({ office: { countryId: COUNTRY, role: 'legislator', authorityProfile: { capabilities: [] } } }) },
      player: { controlledPersonId: PERSON },
      cabinets: {},
      proposals: {},
    },
    date: '2026-01-01',
  } as unknown as SimulationState;
}

/** A real mounted component whose onStateChange feeds the returned state back in, mirroring the app. */
function harness(initial: SimulationState) {
  const calls: SimulationState[] = [];
  let state = initial;
  const onStateChange = (next: SimulationState) => { state = next; calls.push(next); };
  const el = document.createElement('div');
  document.body.appendChild(el);
  container = el;
  root = createRoot(el);
  const render = () => act(() => { root!.render(createElement(ParliamentPanel, { state, countryId: COUNTRY, personId: PERSON, onStateChange })); });
  render();
  return { render, calls };
}

function buttons(): HTMLButtonElement[] { return [...(container?.querySelectorAll('button') ?? [])] as HTMLButtonElement[]; }
function buttonByText(text: string): HTMLButtonElement {
  const button = buttons().find(el => el.textContent === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}
function change(select: HTMLSelectElement, value: string) {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function click(el: HTMLElement) { act(() => { el.click(); }); }

afterEach(() => {
  const currentRoot = root;
  if (currentRoot) act(() => { currentRoot.unmount(); });
  root = undefined;
  container?.remove();
  container = undefined;
});

describe('ParliamentPanel interactions', () => {
  it('issues and replaces a dated whip instruction through the actual command path', () => {
    const h = harness(oppositionLeaderState());
    const selects = [...(container?.querySelectorAll('select') ?? [])] as HTMLSelectElement[];
    expect(selects).toHaveLength(2);
    const [proposalSelect, instructionSelect] = selects;

    // The submitted proposals are selectable, and every instruction is offered.
    expect([...proposalSelect.options].map(option => option.value)).toEqual(['', 'prop.1', 'prop.2']);
    expect(proposalSelect.value).toBe('prop.1');
    expect([...instructionSelect.options].map(option => option.value)).toEqual(['yes', 'no', 'abstain', 'free']);

    // The leader explicitly selects a submitted proposal, then issues YES.
    change(proposalSelect, 'prop.2');
    change(instructionSelect, 'yes');
    click(buttonByText('Issue / change whip instruction'));
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].governance.proposals['prop.2'].whipInstructions).toHaveLength(1);
    expect(h.calls[0].governance.proposals['prop.2'].whipInstructions![0]).toMatchObject({
      proposalId: 'prop.2', byPersonId: PERSON, partyId: 'party.a', instruction: 'yes', on: '2026-01-01',
    });

    // The panel reflects the recorded instruction once the returned state re-renders.
    h.render();
    expect(container?.textContent).toContain('YES — vote in favour');
    expect(container?.textContent).toContain('issued 2026-01-01');

    // Changing the instruction replaces the previous entry rather than stacking it.
    change(instructionSelect, 'no');
    click(buttonByText('Issue / change whip instruction'));
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1].governance.proposals['prop.2'].whipInstructions).toHaveLength(1);
    expect(h.calls[1].governance.proposals['prop.2'].whipInstructions![0].instruction).toBe('no');
  });

  it('refuses the whip to a person who is not a party leader and shows no control', () => {
    harness(nonLeaderState());
    expect(container?.textContent).toContain('require active leadership of a registered party');
    expect(buttons().some(button => button.textContent === 'Issue / change whip instruction')).toBe(false);
  });

  it('offers no instruction when only resolved, withdrawn or draft proposals exist', () => {
    harness({
      governance: {
        persons: { [PERSON]: person({ isPartyLeader: true, partyId: 'party.a' }) },
        player: { controlledPersonId: PERSON },
        cabinets: {},
        proposals: {
          'prop.draft': proposal('prop.draft', 'draft'),
          'prop.enacted': proposal('prop.enacted', 'enacted'),
          'prop.withdrawn': proposal('prop.withdrawn', 'withdrawn'),
        },
      },
      date: '2026-01-01',
    } as unknown as SimulationState);
    expect(container?.textContent).toContain('No submitted proposals are pending');
    expect(buttons().some(button => button.textContent === 'Issue / change whip instruction')).toBe(false);
  });

  it('lists only submitted proposals in the whip selector', () => {
    harness({
      governance: {
        persons: { [PERSON]: person({ isPartyLeader: true, partyId: 'party.a' }) },
        player: { controlledPersonId: PERSON },
        cabinets: {},
        proposals: {
          'prop.1': proposal('prop.1', 'submitted'),
          'prop.enacted': proposal('prop.enacted', 'enacted', { whipInstructions: [{ proposalId: 'prop.enacted', byPersonId: PERSON, partyId: 'party.a', instruction: 'yes', on: '2026-01-01' }] }),
        },
      },
      date: '2026-01-01',
    } as unknown as SimulationState);
    const [proposalSelect] = [...(container?.querySelectorAll('select') ?? [])] as HTMLSelectElement[];
    expect([...proposalSelect.options].map(option => option.value)).toEqual(['', 'prop.1']);
  });

  it('surfaces engine command refusals in the status message', () => {
    harness({
      governance: {
        persons: { [PERSON]: person({ office: { countryId: COUNTRY, role: 'head_of_government', authorityProfile: { capabilities: [] } } }) },
        player: { controlledPersonId: PERSON },
        cabinets: {},
        proposals: {},
      },
      constitution: { countries: {} },
      date: '2026-01-01',
    } as unknown as SimulationState);
    click(buttonByText('Dissolve parliament (snap election)'));
    expect(container?.querySelector('[role="status"]')?.textContent).toContain('does not grant the executive the power to dissolve parliament');
  });

  it('does not expose confidential estimates or internal distribution data in the whip view', () => {
    harness(oppositionLeaderState());
    const text = container?.textContent ?? '';
    expect(text).not.toContain('confidence');
    expect(text).not.toContain('Government Information');
    expect(text).not.toContain('agreementMeanBps');
    expect(text).not.toContain('seatAllocation');
    expect(text).not.toContain('yesBps');
  });
});
