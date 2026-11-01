import type { SimulationState } from '../types';
import type { CampaignSummary } from './campaignSummary';
import { isSimulationDate } from '../simulation/date';
import type { InternationalAssessment } from '../simulation/international/runtime';

/** Public, persisted campaign events. Never reconstruct unrecorded facts, secret
 * troop locations, unobserved crises or a separate fictional news timeline. */
export interface SavedCampaignNewsItem {
  id: string;
  date: string;
  title: string;
  detail: string;
  sourceLabel: string;
  importance: number;
}
export interface SavedCampaignNews {
  national: SavedCampaignNewsItem[];
  international: SavedCampaignNewsItem[];
}

export function savedCampaignNews(
  state: SimulationState,
  playedCountryId: string | undefined,
  names: ReadonlyMap<string, string>,
  summary: CampaignSummary,
  accessibleInternationalAssessments: readonly InternationalAssessment[] = [],
): SavedCampaignNews {
  const national: SavedCampaignNewsItem[] = [], international: SavedCampaignNewsItem[] = [];
  if (!playedCountryId) return { national, international };
  const label = (id: string) => names.get(id) ?? id;
  const admissible = (date: string | undefined): date is string =>
    typeof date === 'string' && isSimulationDate(date) && date <= state.date;
  const add = (scope: 'national' | 'international', item: SavedCampaignNewsItem) => {
    if (admissible(item.date)) (scope === 'national' ? national : international).push(item);
  };
  const scopeFor = (...countries: string[]) =>
    countries.includes(playedCountryId) ? 'national' as const : 'international' as const;

  // War records preserve declarations and settled outcomes after hostilities.
  // "attacker_victory" in the existing endWar engine transfers the target Region;
  // it does NOT establish that a separate peace treaty was signed.
  for (const war of state.wars) {
    const scope = scopeFor(war.attackerCountryId, war.defenderCountryId);
    const sides = label(war.attackerCountryId) + ' / ' + label(war.defenderCountryId);
    const region = label(war.targetRegionId);
    add(scope, {
      id: 'war:start:' + war.id, date: war.startDate,
      title: 'Déclaration de guerre : ' + sides,
      detail: 'Objectif territorial enregistré : ' + region + '.',
      sourceLabel: 'Guerre enregistrée', importance: 90,
    });
    if (war.status === 'ended' && admissible(war.endDate)) {
      const outcome = war.outcome === 'attacker_victory'
        ? 'Victoire de ' + label(war.attackerCountryId) + '. Le règlement de cette guerre a transféré ' + region + ' à ce pays ; aucun traité distinct n’est présumé.'
        : war.outcome === 'defender_victory'
          ? 'Victoire de ' + label(war.defenderCountryId) + '.'
          : war.outcome === 'white_peace' ? 'Paix sans victoire territoriale enregistrée.' : 'Issue indisponible.';
      add(scope, {
        id: 'war:end:' + war.id, date: war.endDate,
        title: 'Fin de la guerre : ' + sides,
        detail: outcome,
        sourceLabel: 'Issue de guerre enregistrée', importance: 100,
      });
    }
  }

  // The active occupation ledger has a start date but no completed-occupation
  // history; do not pretend to reconstruct occupations that already ended.
  for (const occupation of Object.values(state.occupationByRegion)) {
    if (state.operations.regionControl[occupation.regionId] !== 'foreign_controlled') continue;
    const owner = state.regionOwnership[occupation.regionId];
    if (!owner || !admissible(occupation.startDate)) continue;
    add(scopeFor(owner, occupation.occupierCountryId), {
      id: 'occupation:' + occupation.warId + ':' + occupation.regionId,
      date: occupation.startDate,
      title: label(occupation.occupierCountryId) + ' occupe ' + label(occupation.regionId),
      detail: 'Occupation militaire toujours enregistrée à la date de la sauvegarde. La souveraineté de ' + label(owner) + ' n’est pas transférée par cette occupation.',
      sourceLabel: 'Occupation territoriale enregistrée', importance: 95,
    });
  }

  // Treaty events are recorded public diplomatic acts. There is no territorial
  // peace-treaty clause in the current treaty contracts; never invent one.
  const treatyActions: Record<string, string> = {
    signed: 'Signature', ratified: 'Ratification', entered_into_force: 'Entrée en vigueur',
    suspended: 'Suspension', withdrawn: 'Retrait', terminated: 'Fin', expired: 'Expiration',
    violation: 'Violation',
  };
  for (const treaty of Object.values(state.multilateral.treaties)) {
    for (const [index, event] of treaty.history.entries()) {
      const action = treatyActions[event.kind];
      if (!action || !admissible(event.date)) continue;
      add(scopeFor(...treaty.parties), {
        id: 'treaty:' + treaty.id + ':' + index,
        date: event.date, title: action + ' — ' + treaty.title,
        detail: event.detail || 'Événement diplomatique enregistré.', sourceLabel: 'Historique du traité',
        importance: event.kind === 'entered_into_force' || event.kind === 'violation' ? 85 : 70,
      });
    }
  }

  const actionKind: Record<string, string> = {
    condemnation: 'Condamnation diplomatique',
    import_restriction: 'Restrictions sur les importations',
    export_restriction: 'Restrictions sur les exportations',
  };
  for (const action of Object.values(state.international.actions)) {
    // Foreign condemnations alone are too minor to be international headlines.
    if (action.kind === 'condemnation' && action.actorCountryId !== playedCountryId && action.targetCountryId !== playedCountryId) continue;
    const scope = scopeFor(action.actorCountryId, action.targetCountryId);
    add(scope, {
      id: 'international:declared:' + action.id, date: action.declaredOn,
      title: (actionKind[action.kind] ?? 'Mesure diplomatique') + ' : ' + label(action.actorCountryId) + ' envers ' + label(action.targetCountryId),
      detail: 'Mesure déclarée. Entrée en application enregistrée : ' + action.effectiveOn + (action.categories.length ? ' · Secteurs : ' + action.categories.join(', ') : '') + '.',
      sourceLabel: 'Action internationale enregistrée', importance: action.kind === 'condemnation' ? 45 : 80,
    });
    if (action.status === 'lifted' && admissible(action.ceasesOn)) add(scope, {
      id: 'international:lifted:' + action.id, date: action.ceasesOn,
      title: 'Levée de mesure : ' + label(action.actorCountryId) + ' envers ' + label(action.targetCountryId),
      detail: 'Fin enregistrée de la mesure : ' + (actionKind[action.kind] ?? action.kind).toLowerCase() + '.',
      sourceLabel: 'Action internationale enregistrée', importance: 65,
    });
  }

  // These are not raw international.episodes: the caller only supplies
  // governmental assessments already filtered by role, access and save date.
  // They were shown in the original menu; retain them when adding event news.
  for (const assessment of accessibleInternationalAssessments) {
    if (!admissible(assessment.lastEvaluatedOn)) continue;
    if (assessment.phase === 'NORMAL' || assessment.severity === 'none') continue;
    const severity: Record<string, string> = {
      low: 'faible', moderate: 'modérée', severe: 'grave', critical: 'critique',
    };
    const phase: Record<string, string> = {
      PRESSURE: 'pression', ACTIVE: 'crise active', RECOVERING: 'retour progressif à la normale',
    };
    add('international', {
      id: 'diplomatic-assessment:' + assessment.pairKey + ':' + assessment.lastEvaluatedOn,
      date: assessment.lastEvaluatedOn,
      title: 'Tensions diplomatiques : ' + label(assessment.countryAId) + ' / ' + label(assessment.countryBId),
      detail: 'Évaluation accessible : ' + (phase[assessment.phase] ?? assessment.phase)
        + ' · gravité ' + (severity[assessment.severity] ?? assessment.severity)
        + (assessment.stale ? ' · rapport antérieur à la sauvegarde' : '') + '.',
      sourceLabel: 'Rapport international daté', importance: assessment.severity === 'critical' ? 88
        : assessment.severity === 'severe' ? 78 : assessment.severity === 'moderate' ? 62 : 40,
    });
  }

  // Only already access-filtered public/authorized briefings and policy results
  // are included. Hidden canonical crisis state is never turned into "news".
  for (const entry of [...summary.events, ...summary.decisions, ...summary.situations]) {
    if (!admissible(entry.date)) continue;
    add('national', {
      id: 'briefing:' + entry.id, date: entry.date, title: entry.title, detail: entry.detail,
      sourceLabel: 'Information accessible enregistrée', importance: 55,
    });
  }

  const finish = (items: SavedCampaignNewsItem[]) => {
    const unique = new Map(items.map(item => [item.id, item]));
    return [...unique.values()]
      .sort((a, b) => b.importance - a.importance || b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
      .slice(0, 12);
  };
  return { national: finish(national), international: finish(international) };
}
