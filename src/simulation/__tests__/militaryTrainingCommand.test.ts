import { describe, it, expect } from 'vitest';
import {
  validateCommandMandate, canCommandMilitary, validateTrainingProgram, planTraining,
  validateReconstitutionRequirement, planReconstitution, TRAINING_COMMAND_OWNERS,
  type CommandMandate, type TrainingProgram, type ReconstitutionRequirement,
} from '../military/trainingCommand';

const mandate = (over: Partial<CommandMandate> = {}): CommandMandate => ({ basis: 'head_of_government', ...over } as CommandMandate);
const program = (over: Partial<TrainingProgram> = {}): TrainingProgram => ({
  id: 't1', countryId: 'country-a', persons: 100, monthsRequired: 3, instructorCapacity: 25,
  date: '2026-02-01', note: 'train a cohort',
  ...over,
});
const reconstitution = (over: Partial<ReconstitutionRequirement> = {}): ReconstitutionRequirement => ({
  id: 'r1', countryId: 'country-a', lostPersonnel: 60, recruitmentPerMonth: 10,
  date: '2026-02-01', note: 'reconstitute losses',
  ...over,
});

describe('training, availability and command (0.31.7)', () => {
  it('names canonical owners and grants command only to the real offices', () => {
    expect(TRAINING_COMMAND_OWNERS.command).toBe('governance.capabilities');
    expect(TRAINING_COMMAND_OWNERS.training).toBe('military.trainees');
    expect(canCommandMilitary(mandate())).toBe(true);
    expect(canCommandMilitary(mandate({ basis: 'head_of_state' }))).toBe(true);
    expect(canCommandMilitary(mandate({ basis: 'unresolved' }))).toBe(false);
    expect(() => validateCommandMandate(mandate({ basis: 'minister' as never }))).toThrow(/Unknown command mandate basis/);
  });

  it('plans training bounded by instructor capacity and cohort duration; never instant', () => {
    expect(planTraining(program())).toEqual({ status: 'computed', monthsToComplete: 12 }); // ceil(100/25)=4 batches * 3 months
    expect(planTraining(program({ persons: 25 })).monthsToComplete).toBe(3);
    expect(planTraining(program({ instructorCapacity: null })).status).toBe('unavailable');
    expect(planTraining(program({ instructorCapacity: 0 })).status).toBe('known_zero');
  });

  it('plans reconstitution bounded by recruitment rate; never instant or fabricated', () => {
    expect(planReconstitution(reconstitution())).toEqual({ status: 'computed', monthsToComplete: 6 });
    expect(planReconstitution(reconstitution({ recruitmentPerMonth: null })).status).toBe('unavailable');
    expect(planReconstitution(reconstitution({ recruitmentPerMonth: 0 })).status).toBe('known_zero');
  });

  it('fails closed on overflow and malformed inputs', () => {
    expect(() => planTraining(program({ monthsRequired: Number.MAX_SAFE_INTEGER, persons: 100, instructorCapacity: 1 }))).toThrow(/overflow/);
    expect(() => validateTrainingProgram(program({ monthsRequired: 0 }))).toThrow(/positive whole number/);
    expect(() => validateReconstitutionRequirement(reconstitution({ lostPersonnel: 0 }))).toThrow(/positive whole number/);
  });
});
