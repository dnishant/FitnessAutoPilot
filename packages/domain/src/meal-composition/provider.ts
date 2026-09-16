import type {
  MealCompositionProposal,
  MealCompositionRequest,
} from "@fitness-autopilot/contracts";

/**
 * Provider-independent meal composition port.
 * Implementations decide culinary additions only — never authoritative nutrition.
 */
export interface MealCompositionProvider {
  compose(request: MealCompositionRequest): Promise<MealCompositionProposal>;
}
