import type { ComponentDefinition } from "../../contracts/index.ts";
import { COMPONENT_RECIPE_PROMPT_VERSION } from "../../contracts/index.ts";
import {
  buildComponentRecipePrompt,
  stripCompositionNutrition,
  type ComponentRecipeProvider,
  type ComponentRecipeRequest,
  validateComponentDefinition,
} from "../../domain/index.ts";
import type { GeminiContentClient } from "./client.ts";
import { extractJsonObjectFromModelText } from "./culinary-discovery-provider.ts";
import { classifyGeminiProviderError, withGeminiRetries } from "./retry.ts";

export class GeminiComponentRecipeProvider implements ComponentRecipeProvider {
  constructor(
    private readonly options: {
      model: string;
      client: GeminiContentClient;
      maxAttempts?: number;
      sleep?: (ms: number) => Promise<void>;
    },
  ) {}

  async resolve(request: ComponentRecipeRequest): Promise<ComponentDefinition> {
    if (request.component.definitionKind === "atomic_food") {
      return {
        kind: "atomic_food",
        name: request.component.name,
        preparation: null,
        measurementState: "cooked",
      };
    }

    const prompt = buildComponentRecipePrompt({
      name: request.component.name,
      role: request.component.role,
      reason: request.component.reason,
      cuisineFamily: request.cuisineFamily ?? request.candidate.cuisineFamily,
      mealName: request.mealName,
      definitionKind: request.component.definitionKind,
    });

    const result = await withGeminiRetries(
      async () =>
        this.options.client.generateContent({
          model: this.options.model,
          contents: prompt.userPrompt,
          systemInstruction: prompt.systemInstruction,
          responseMimeType: "application/json",
        }),
      {
        maxAttempts: this.options.maxAttempts ?? 3,
        sleep: this.options.sleep,
        shouldRetry: (error) => classifyGeminiProviderError(error).isRateLimited,
      },
    );

    const extracted = extractJsonObjectFromModelText(result.text ?? "");
    if (!extracted) {
      throw new Error("Gemini component recipe returned non-JSON output.");
    }
    const parsed = JSON.parse(extracted) as ComponentDefinition;
    const stripped = stripCompositionNutrition(parsed) as ComponentDefinition;
    const validated = validateComponentDefinition(stripped, request.component);
    if (!validated.ok) {
      throw new Error(validated.error.message);
    }
    void COMPONENT_RECIPE_PROMPT_VERSION;
    return validated.value;
  }
}
