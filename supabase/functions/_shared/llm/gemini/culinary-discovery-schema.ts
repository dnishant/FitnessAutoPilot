import { z } from "zod";
import {
  DiscoveryConfidenceSchema,
  FitnessAdaptabilitySchema,
  MealPrepAdaptabilitySchema,
} from "../../contracts/index.ts";
import { zodToGeminiJsonSchema } from "./json-schema.ts";

/**
 * Schema sent to Gemini for grounded culinary discovery.
 * Optional fields are optional-only (not nullable) to avoid Gemini anyOf+null rejection.
 * author / regionalStyle / primaryProtein / estimatedFinishMinutesAfterPrep may be omitted.
 */
export const GeminiCulinaryDiscoveryCandidatePayloadSchema = z.object({
  candidateId: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  source: z.object({
    name: z.string().min(1).max(160),
    url: z.string().min(1).max(2000),
    author: z.string().min(1).max(160).optional(),
  }),
  cuisineFamily: z.string().min(1).max(80),
  regionalStyle: z.string().min(1).max(120).optional(),
  primaryProtein: z.string().min(1).max(80).optional(),
  dishFormat: z.string().min(1).max(80),
  flavorFamilies: z.array(z.string().min(1).max(80)).min(1).max(12),
  cookingTechniques: z.array(z.string().min(1).max(80)).min(1).max(12),
  textureTags: z.array(z.string().min(1).max(80)).max(12).optional(),
  experienceTags: z.array(z.string().min(1).max(80)).max(12).optional(),
  whyItIsInteresting: z.string().min(1).max(600),
  fitnessAdaptability: FitnessAdaptabilitySchema,
  fitnessAdaptabilityReason: z.string().min(1).max(400),
  mealPrepAdaptability: MealPrepAdaptabilitySchema,
  estimatedFinishMinutesAfterPrep: z.number().int().nonnegative().max(180).optional(),
  noveltyReason: z.string().min(1).max(400),
  discoveryConfidence: DiscoveryConfidenceSchema,
});

export const GeminiCulinaryDiscoveryPayloadSchema = z.object({
  candidates: z.array(GeminiCulinaryDiscoveryCandidatePayloadSchema).min(1).max(40),
});

export type GeminiCulinaryDiscoveryPayload = z.infer<
  typeof GeminiCulinaryDiscoveryPayloadSchema
>;

export function geminiCulinaryDiscoveryResponseJsonSchema(): Record<string, unknown> {
  return zodToGeminiJsonSchema(GeminiCulinaryDiscoveryPayloadSchema);
}
