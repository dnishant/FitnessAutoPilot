import type {
  MealCompositionProposal,
  MealCompositionRequest,
} from "../../contracts/index.ts";

/**
 * Provider-independent meal composition port.
 * Implementations decide culinary additions only — never authoritative nutrition.
 */
export interface MealCompositionProvider {
  compose(request: MealCompositionRequest): Promise<MealCompositionProposal>;
}
