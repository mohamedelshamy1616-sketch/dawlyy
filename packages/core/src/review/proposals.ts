import { NutritionDocument, type NutritionTargets } from '../types';
import { ReviewError, type NutritionChange, type Proposal, type ProposalCode, type WeekReview, type WeekReviewInput } from './types';
import { percent, round } from './math';
import { weightEvidence } from './summary';

function shiftTargets(targets: NutritionTargets, deltaKcal: number): NutritionTargets {
  const kcal = Math.max(1200, round(targets.kcal + deltaKcal, 5));
  const actualDelta = kcal - targets.kcal;
  return { ...targets, kcal, carbsG: Math.max(0, Math.round(targets.carbsG + actualDelta / 4)) };
}

export function propose(input: WeekReviewInput, summary: WeekReview['summary'], periodEvidence: { spanDays: number; kgPerWeek: number | null }): Proposal[] {
  if (input.nutrition === null || input.redFlags.length > 0) return [];
  const workoutPercent = percent(input.workouts.done, input.workouts.planned);
  const mealPercent = input.meals.nutritionAssigned ? percent(input.meals.daysLogged, input.meals.daysInPeriod) : null;
  const rolling = input.rollingWeights === undefined
    ? { ...periodEvidence, summary: summary.weight }
    : weightEvidence(input.rollingWeights);
  const flatWithAdherence = rolling.summary.trend === 'flat' && rolling.spanDays >= 14
    && workoutPercent !== null && workoutPercent >= 80 && mealPercent !== null && mealPercent >= 80;
  let code: ProposalCode;
  let requestedDelta: number;
  // Table order is deliberate: the first applicable rule is the only proposal.
  if (input.client.goal === 'lose' && flatWithAdherence) {
    code = 'lower_kcal_flat'; requestedDelta = -100;
  } else if (input.client.goal === 'gain' && flatWithAdherence) {
    code = 'raise_kcal_flat'; requestedDelta = 100;
  } else if (input.client.goal === 'lose' && periodEvidence.kgPerWeek !== null && periodEvidence.kgPerWeek <= -1 + 1e-10) {
    code = 'slow_loss_too_fast'; requestedDelta = 100;
  } else return [];
  const evidence = code === 'slow_loss_too_fast' ? periodEvidence : rolling;
  const targets = shiftTargets(input.nutrition.targets, requestedDelta);
  const deltaKcal = targets.kcal - input.nutrition.targets.kcal;
  if (deltaKcal === 0 || (requestedDelta < 0 && deltaKcal > 0)) return [];
  return [{ code, params: {
    spanDays: evidence.spanDays, kgPerWeek: round(evidence.kgPerWeek!),
    ...(workoutPercent === null ? {} : { workoutPercent: round(workoutPercent, 1) }),
    ...(mealPercent === null ? {} : { mealPercent: round(mealPercent, 1) }), deltaKcal,
  }, change: { kind: 'nutrition_targets', fromVersionId: input.nutrition.versionId, deltaKcal, targets } }];
}

/** Create a validated draft document; never mutate or publish the source plan. */
export function applyNutritionChange(document: NutritionDocument, change: NutritionChange, currentVersionId: string): NutritionDocument {
  const parsed = NutritionDocument.parse(document);
  if (currentVersionId !== change.fromVersionId) throw new ReviewError('proposal_version_mismatch');
  return NutritionDocument.parse({
    ...parsed, targets: shiftTargets(parsed.targets, change.deltaKcal),
    ...(parsed.dayTypes ? { dayTypes: {
      training: shiftTargets(parsed.dayTypes.training, change.deltaKcal),
      rest: shiftTargets(parsed.dayTypes.rest, change.deltaKcal),
    } } : {}),
  });
}
