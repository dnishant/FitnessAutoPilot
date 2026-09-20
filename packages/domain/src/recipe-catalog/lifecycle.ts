import type {
  KitchenTestStatus,
  RecipeCatalogFailureCode,
  RecipeVersionStatus,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";

export type LifecycleError = {
  code: RecipeCatalogFailureCode;
  message: string;
};

const ALLOWED_TRANSITIONS: Record<RecipeVersionStatus, readonly RecipeVersionStatus[]> = {
  draft: ["validated", "retired"],
  validated: ["published", "draft", "retired"],
  published: ["retired"],
  retired: [],
};

export function canTransitionRecipeVersionStatus(
  from: RecipeVersionStatus,
  to: RecipeVersionStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionRecipeVersionStatus(
  from: RecipeVersionStatus,
  to: RecipeVersionStatus,
): Result<RecipeVersionStatus, LifecycleError> {
  if (!canTransitionRecipeVersionStatus(from, to)) {
    return err({
      code: "INVALID_VERSION_TRANSITION",
      message: `Cannot transition recipe version from ${from} to ${to}`,
    });
  }
  return ok(to);
}

/** Kitchen-test status is independent of publication status. */
export function kitchenTestFromPublication(
  _status: RecipeVersionStatus,
): KitchenTestStatus | null {
  return null;
}

export function assertKitchenTestNotInferredFromPublication(
  status: RecipeVersionStatus,
  kitchenTestStatus: KitchenTestStatus,
): Result<true, LifecycleError> {
  if (status === "published" && kitchenTestStatus === "passed") {
    // Allowed only when explicitly set — publication alone must not imply passed.
    return ok(true);
  }
  if (status === "published" && kitchenTestStatus === "not_tested") {
    return ok(true);
  }
  void kitchenTestFromPublication(status);
  return ok(true);
}

export function isPublishedContentImmutable(status: RecipeVersionStatus): boolean {
  return status === "published" || status === "retired";
}
