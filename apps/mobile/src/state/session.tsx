import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  CalorieTarget,
  CandidateRankingRequest,
  CandidateRankingResult,
  CompleteOnboardingRequest,
  CreateGoalRequest,
  CulinaryDiscoveryRequest,
  CulinaryDiscoveryResult,
  DailyPlan,
  Goal,
  CookingPreferences,
  CookingPreferencesInput,
  MealPreferences,
  MealPreferencesInput,
  NutritionTarget,
  ProfileBasics,
  RecipeCandidate,
  RecipeGenerationRequest,
  RmrEstimate,
  TdeeEstimate,
  WeeklyMealStrategy,
  WeeklyStrategyRequest,
  WeeklyStrategyStats,
  RankedWeeklyStrategy,
  RankedWeeklyStrategyQualityStats,
  RankedWeeklyStrategyRequest,
  CulinaryDiscoveryCandidate,
  RecipeResolutionFailure,
  ResolveRecipesResponse,
  WeeklyRecipeResolutionResult,
  ResolvedRecipe,
  WeeklyRecipeNutritionResult,
  ResolveRecipeNutritionResponse,
  RankedCulinaryCandidate,
  ComposeMealsResponse,
  WeeklyMealConceptResult,
  ConsumerWeeklyPlan,
  ConsumerPlanGenerationStage,
} from "@fitness-autopilot/contracts";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  completeOnboarding as completeOnboardingDomain,
  composeMealConcepts as composeMealConceptsDomain,
  MockMealCompositionProvider,
} from "@fitness-autopilot/domain";
import { supabase, useLocalPlanner } from "../lib/supabase";
import {
  CONSUMER_PLAN_STORAGE_KEY,
  createEmptyConsumerPlan,
} from "../lib/consumer-plan-view";
import { generateConsumerWeeklyPlan } from "../lib/consumer-plan-generate";
import {
  ensureLocalUser,
  getLocalStore,
  hydrateLocalStore,
  serializeLocalStore,
  localGeneratePlan,
  localSaveGoal,
  localSaveCookingPreferences,
  localSaveMealPreferences,
  localSaveOnboardingGoal,
  localSaveProfile,
  localSaveCalorieTarget,
  localSaveNutritionTarget,
  localSaveRmrEstimate,
  localSaveTdeeEstimate,
  type LocalStore,
} from "../lib/local-planner";
import {
  mapCalorieTargetRow,
  mapCookingPreferencesRow,
  mapGoalRow,
  mapMealPreferencesRow,
  mapNutritionTargetRow,
  mapProfileRow,
  mapRmrRow,
  mapTdeeRow,
} from "../lib/rmr-mappers";
import {
  invokeGenerateRecipe,
  type RecipeGenerationMeta,
} from "../lib/recipe-preview";
import {
  invokeGenerateWeeklyStrategy,
  type WeeklyStrategyGenerationMeta,
} from "../lib/weekly-strategy-preview";
import {
  invokeGenerateRankedWeeklyStrategy,
} from "../lib/ranked-weekly-strategy-preview";
import {
  invokeCulinaryDiscovery,
  type CulinaryDiscoveryGenerationMeta,
} from "../lib/culinary-discovery-preview";
import {
  rankCulinaryCandidatesLocally,
  type CandidateRankingGenerationMeta,
} from "../lib/candidate-ranking-preview";
import { invokeResolveRecipes } from "../lib/recipe-resolution-preview";
import { invokeResolveRecipeNutrition } from "../lib/food-resolution-preview";
import { invokeComposeMeals, isLegacyComposeMealsRecipesRequiredError } from "../lib/meal-composition-preview";

type SessionUser = { id: string; email: string };

type SessionValue = {
  loading: boolean;
  useLocalMode: boolean;
  user: SessionUser | null;
  profile: ProfileBasics | null;
  currentRmr: RmrEstimate | null;
  currentTdee: TdeeEstimate | null;
  currentCalorieTarget: CalorieTarget | null;
  goal: Goal | null;
  nutritionTarget: NutritionTarget | null;
  mealPreferences: MealPreferences | null;
  cookingPreferences: CookingPreferences | null;
  dailyPlan: DailyPlan | null;
  weeklyPlan: ConsumerWeeklyPlan | null;
  generateWeeklyPlan: () => Promise<
    | { ok: true; plan: ConsumerWeeklyPlan }
    | { ok: false; error: string; plan: ConsumerWeeklyPlan }
  >;
  clearWeeklyPlan: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signUp: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
  completeOnboarding: (
    request: CompleteOnboardingRequest,
  ) => Promise<
    | {
        ok: true;
        rmr: RmrEstimate;
        tdee: TdeeEstimate;
        goal: Goal;
        calorieTarget: CalorieTarget;
        nutritionTarget: NutritionTarget;
        mealPreferences: MealPreferences;
        cookingPreferences: CookingPreferences;
      }
    | { ok: false; error: string }
  >;
  saveMealPreferences: (
    request: MealPreferencesInput,
  ) => Promise<
    | { ok: true; mealPreferences: MealPreferences }
    | { ok: false; error: string }
  >;
  saveCookingPreferences: (
    request: CookingPreferencesInput,
  ) => Promise<
    | { ok: true; cookingPreferences: CookingPreferences }
    | { ok: false; error: string }
  >;
  saveGoal: (
    request: CreateGoalRequest,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  generateTodayPlan: () => Promise<{ ok: true } | { ok: false; error: string }>;
  generateRecipe: (
    request: RecipeGenerationRequest,
  ) => Promise<
    | { ok: true; recipe: RecipeCandidate; meta?: RecipeGenerationMeta }
    | { ok: false; error: string; code?: string; diagnostics?: string }
  >;
  generateWeeklyStrategy: (
    request: WeeklyStrategyRequest,
  ) => Promise<
    | {
        ok: true;
        strategy: WeeklyMealStrategy;
        stats: WeeklyStrategyStats;
        meta?: WeeklyStrategyGenerationMeta;
      }
    | { ok: false; error: string; code?: string; diagnostics?: string }
  >;
  generateRankedWeeklyStrategy: (
    request: RankedWeeklyStrategyRequest,
  ) => Promise<
    | {
        ok: true;
        strategy: RankedWeeklyStrategy;
        stats: RankedWeeklyStrategyQualityStats;
        meta?: WeeklyStrategyGenerationMeta;
      }
    | { ok: false; error: string; code?: string; diagnostics?: string }
  >;
  discoverCulinaryCandidates: (
    request: CulinaryDiscoveryRequest,
  ) => Promise<
    | {
        ok: true;
        result: CulinaryDiscoveryResult;
        meta?: CulinaryDiscoveryGenerationMeta;
      }
    | { ok: false; error: string; code?: string; diagnostics?: string }
  >;
  rankCulinaryCandidates: (
    request: CandidateRankingRequest,
  ) => Promise<
    | {
        ok: true;
        result: CandidateRankingResult;
        meta?: CandidateRankingGenerationMeta;
      }
    | { ok: false; error: string; code?: string; diagnostics?: string }
  >;
  resolveWeeklyRecipes: (input: {
    candidates: CulinaryDiscoveryCandidate[];
    uniqueCandidateIds?: string[];
    concurrency?: number;
  }) => Promise<
    | {
        ok: true;
        result: WeeklyRecipeResolutionResult;
        failures?: RecipeResolutionFailure[];
        meta?: NonNullable<ResolveRecipesResponse["meta"]>;
      }
    | {
        ok: false;
        error: string;
        code?: string;
        diagnostics?: string;
        result?: WeeklyRecipeResolutionResult;
        failures?: RecipeResolutionFailure[];
        meta?: NonNullable<ResolveRecipesResponse["meta"]>;
      }
  >;
  resolveRecipeNutrition: (input: {
    recipes: ResolvedRecipe[];
    uniqueCandidateIds?: string[];
    concurrency?: number;
    enableSemanticDisambiguation?: boolean;
  }) => Promise<
    | {
        ok: true;
        result: WeeklyRecipeNutritionResult;
        meta?: NonNullable<ResolveRecipeNutritionResponse["meta"]>;
      }
    | {
        ok: false;
        error: string;
        code?: string;
        diagnostics?: string;
        meta?: NonNullable<ResolveRecipeNutritionResponse["meta"]>;
      }
  >;
  composeMealConcepts: (input: {
    rankedCandidates: RankedCulinaryCandidate[];
    uniqueCandidateIds?: string[];
    concurrency?: number;
    targetCalories?: number;
    allergies?: string[];
    dietaryRestrictions?: string[];
    dislikes?: string[];
  }) => Promise<
    | {
        ok: true;
        concepts: WeeklyMealConceptResult;
        meta?: NonNullable<ComposeMealsResponse["meta"]>;
      }
    | {
        ok: false;
        error: string;
        code?: string;
        diagnostics?: string;
        meta?: NonNullable<ComposeMealsResponse["meta"]>;
      }
  >;
};

const SessionContext = createContext<SessionValue | null>(null);
const LOCAL_USER_KEY = "fa.local.user";
const LOCAL_STORE_KEY = "fa.local.store";

async function persistLocalStoreSnapshot(userId: string) {
  try {
    const snapshot = serializeLocalStore(userId);
    if (!snapshot) return;
    await AsyncStorage.setItem(`${LOCAL_STORE_KEY}.${userId}`, JSON.stringify(snapshot));
  } catch {
    // Best-effort for local/demo persistence.
  }
}

async function composeMealConceptsLocally(input: {
  rankedCandidates: RankedCulinaryCandidate[];
  uniqueCandidateIds?: string[];
  concurrency?: number;
  targetCalories?: number;
  allergies?: string[];
  dietaryRestrictions?: string[];
  dislikes?: string[];
}): Promise<
  | {
      ok: true;
      concepts: WeeklyMealConceptResult;
      meta: NonNullable<ComposeMealsResponse["meta"]>;
    }
  | { ok: false; error: string; code?: string }
> {
  const provider = new MockMealCompositionProvider();
  const { result, failures } = await composeMealConceptsDomain({
    rankedCandidates: input.rankedCandidates,
    uniqueCandidateIds: input.uniqueCandidateIds,
    concurrency: input.concurrency,
    targetCalories: input.targetCalories,
    allergies: input.allergies ?? [],
    dietaryRestrictions: input.dietaryRestrictions ?? [],
    dislikes: input.dislikes ?? [],
    provider,
    providerMeta: { provider: "mock", model: "local-fixture" },
    slotCount: input.rankedCandidates.length,
  });
  if (failures.length > 0 && result.conceptCount === 0) {
    return {
      ok: false,
      error: failures[0]?.message ?? "Meal composition failed.",
      code: failures[0]?.code,
    };
  }
  return {
    ok: true,
    concepts: result,
    meta: {
      requestId: `local_mc_${Date.now()}`,
      promptVersion: "meal-composition-v2",
      policyVersion: "meal-composition-v1",
      stage: "concepts",
      provider: "mock",
      model: "local-fixture",
    },
  };
}

async function loadRemoteOnboardingState(userId: string): Promise<{
  profile: ProfileBasics | null;
  currentRmr: RmrEstimate | null;
  currentTdee: TdeeEstimate | null;
  currentCalorieTarget: CalorieTarget | null;
  currentNutritionTarget: NutritionTarget | null;
  mealPreferences: MealPreferences | null;
  cookingPreferences: CookingPreferences | null;
  goal: Goal | null;
}> {
  if (!supabase) {
    return {
      profile: null,
      currentRmr: null,
      currentTdee: null,
      currentCalorieTarget: null,
      currentNutritionTarget: null,
      mealPreferences: null,
      cookingPreferences: null,
      goal: null,
    };
  }
  const [profileRes, rmrRes, tdeeRes, calorieRes, nutritionRes, goalRes] = await Promise.all([
    supabase
      .from("user_profiles")
      .select(
        "user_id, date_of_birth, biological_sex, height_cm, weight_kg, cuisine_preferences, protein_preferences, allergies, dietary_restrictions, disliked_foods, experience_preferences, variety_level, meal_preferences_completed_at, prep_frequency, max_prep_session_minutes, cooking_style, max_finish_minutes, use_dinner_prep_for_next_lunch, cooking_preferences_completed_at, created_at, updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("rmr_estimates")
      .select("*")
      .eq("user_id", userId)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("tdee_estimates")
      .select("*")
      .eq("user_id", userId)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("calorie_targets")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("nutrition_targets")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("goals")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    profile: profileRes.data ? mapProfileRow(profileRes.data) : null,
    currentRmr: rmrRes.data ? mapRmrRow(rmrRes.data) : null,
    currentTdee: tdeeRes.data ? mapTdeeRow(tdeeRes.data) : null,
    currentCalorieTarget: calorieRes.data ? mapCalorieTargetRow(calorieRes.data) : null,
    currentNutritionTarget: nutritionRes.data ? mapNutritionTargetRow(nutritionRes.data) : null,
    mealPreferences: profileRes.data ? mapMealPreferencesRow(profileRes.data) : null,
    cookingPreferences: profileRes.data ? mapCookingPreferencesRow(profileRes.data) : null,
    goal: goalRes.data ? mapGoalRow(goalRes.data) : null,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<ProfileBasics | null>(null);
  const [currentRmr, setCurrentRmr] = useState<RmrEstimate | null>(null);
  const [currentTdee, setCurrentTdee] = useState<TdeeEstimate | null>(null);
  const [currentCalorieTarget, setCurrentCalorieTarget] = useState<CalorieTarget | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [nutritionTarget, setNutritionTarget] = useState<NutritionTarget | null>(null);
  const [mealPreferences, setMealPreferences] = useState<MealPreferences | null>(null);
  const [cookingPreferences, setCookingPreferences] = useState<CookingPreferences | null>(null);
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null);
  const [weeklyPlan, setWeeklyPlan] = useState<ConsumerWeeklyPlan | null>(null);

  async function persistWeeklyPlan(plan: ConsumerWeeklyPlan | null) {
    setWeeklyPlan(plan);
    try {
      if (!plan) {
        await AsyncStorage.removeItem(CONSUMER_PLAN_STORAGE_KEY);
        return;
      }
      await AsyncStorage.setItem(CONSUMER_PLAN_STORAGE_KEY, JSON.stringify(plan));
    } catch {
      // Persistence is best-effort; in-memory state still drives the UI.
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (useLocalPlanner) {
          const raw = await AsyncStorage.getItem(LOCAL_USER_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as SessionUser;
            let store = getLocalStore(parsed.id);
            if (!store) {
              try {
                const storeRaw = await AsyncStorage.getItem(`${LOCAL_STORE_KEY}.${parsed.id}`);
                if (storeRaw) {
                  store = hydrateLocalStore(JSON.parse(storeRaw) as LocalStore);
                }
              } catch {
                store = null;
              }
            }
            store = store ?? ensureLocalUser(parsed.email, "restored");
            if (!cancelled) {
              setUser({ id: store.userId, email: store.email });
              setProfile(store.profile);
              setCurrentRmr(store.currentRmr);
              setCurrentTdee(store.currentTdee);
              setCurrentCalorieTarget(store.currentCalorieTarget);
              setGoal(store.goal);
              setNutritionTarget(store.nutritionTarget);
              setMealPreferences(store.mealPreferences);
              setCookingPreferences(store.cookingPreferences);
              setDailyPlan(store.dailyPlan);
            }
          }
        } else if (supabase) {
          const { data } = await supabase.auth.getSession();
          if (data.session?.user && !cancelled) {
            setUser({
              id: data.session.user.id,
              email: data.session.user.email ?? "",
            });
            const loaded = await loadRemoteOnboardingState(data.session.user.id);
            if (!cancelled) {
              setProfile(loaded.profile);
              setCurrentRmr(loaded.currentRmr);
              setCurrentTdee(loaded.currentTdee);
              setCurrentCalorieTarget(loaded.currentCalorieTarget);
              setNutritionTarget(loaded.currentNutritionTarget);
              setMealPreferences(loaded.mealPreferences);
              setCookingPreferences(loaded.cookingPreferences);
              setGoal(loaded.goal);
            }
          }
        }
        try {
          const planRaw = await AsyncStorage.getItem(CONSUMER_PLAN_STORAGE_KEY);
          if (planRaw && !cancelled) {
            setWeeklyPlan(JSON.parse(planRaw) as ConsumerWeeklyPlan);
          }
        } catch {
          // Ignore corrupt cache.
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SessionValue>(() => {
    const api: Omit<SessionValue, "generateWeeklyPlan"> = {
      loading,
      useLocalMode: useLocalPlanner,
      user,
      profile,
      currentRmr,
      currentTdee,
      currentCalorieTarget,
      goal,
      nutritionTarget,
      mealPreferences,
      cookingPreferences,
      dailyPlan,
      weeklyPlan,
      async clearWeeklyPlan() {
        await persistWeeklyPlan(null);
      },
      async signIn(email, password) {
        if (useLocalPlanner) {
          try {
            const store = ensureLocalUser(email, password);
            const next = { id: store.userId, email: store.email };
            try {
              await AsyncStorage.setItem(LOCAL_USER_KEY, JSON.stringify(next));
            } catch {
              // Web environments may lack AsyncStorage; in-memory session still works.
            }
            setUser(next);
            setProfile(store.profile);
            setCurrentRmr(store.currentRmr);
            setCurrentTdee(store.currentTdee);
            setCurrentCalorieTarget(store.currentCalorieTarget);
            setGoal(store.goal);
            setNutritionTarget(store.nutritionTarget);
            setMealPreferences(store.mealPreferences);
            setCookingPreferences(store.cookingPreferences);
            setDailyPlan(store.dailyPlan);
            return { ok: true };
          } catch (e) {
            return {
              ok: false,
              error: e instanceof Error ? e.message : "Local sign-in failed",
            };
          }
        }
        if (!supabase) {
          return { ok: false, error: "Supabase is not configured." };
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          return { ok: false, error: error.message };
        }
        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          return { ok: false, error: "Sign-in succeeded but user is missing." };
        }
        setUser({ id: data.user.id, email: data.user.email ?? email });
        const loaded = await loadRemoteOnboardingState(data.user.id);
        setProfile(loaded.profile);
        setCurrentRmr(loaded.currentRmr);
        setCurrentTdee(loaded.currentTdee);
        setCurrentCalorieTarget(loaded.currentCalorieTarget);
        setNutritionTarget(loaded.currentNutritionTarget);
        setMealPreferences(loaded.mealPreferences);
        setCookingPreferences(loaded.cookingPreferences);
        setGoal(loaded.goal);
        return { ok: true };
      },
      async signUp(email, password) {
        if (useLocalPlanner) {
          const store = ensureLocalUser(email, password);
          const next = { id: store.userId, email: store.email };
          await AsyncStorage.setItem(LOCAL_USER_KEY, JSON.stringify(next));
          setUser(next);
          setProfile(store.profile);
          setCurrentRmr(store.currentRmr);
          setCurrentTdee(store.currentTdee);
          setCurrentCalorieTarget(store.currentCalorieTarget);
          setGoal(store.goal);
          setNutritionTarget(store.nutritionTarget);
          setMealPreferences(store.mealPreferences);
          setCookingPreferences(store.cookingPreferences);
          setDailyPlan(store.dailyPlan);
          return { ok: true };
        }
        if (!supabase) {
          return { ok: false, error: "Supabase is not configured." };
        }
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          return { ok: false, error: error.message };
        }
        const signedIn = await supabase.auth.signInWithPassword({ email, password });
        if (signedIn.error) {
          return { ok: false, error: signedIn.error.message };
        }
        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          return { ok: false, error: "Sign-up succeeded but user is missing." };
        }
        setUser({ id: data.user.id, email: data.user.email ?? email });
        return { ok: true };
      },
      async signOut() {
        if (useLocalPlanner) {
          await AsyncStorage.removeItem(LOCAL_USER_KEY);
        } else if (supabase) {
          await supabase.auth.signOut();
        }
        setUser(null);
        setProfile(null);
        setCurrentRmr(null);
        setCurrentTdee(null);
        setCurrentCalorieTarget(null);
        setGoal(null);
        setNutritionTarget(null);
        setMealPreferences(null);
        setCookingPreferences(null);
        setDailyPlan(null);
      },
      async completeOnboarding(request) {
        try {
          if (useLocalPlanner) {
            if (!user) {
              return { ok: false, error: "Not signed in" };
            }
            const asOf = new Date();
            const completed = completeOnboardingDomain({
              ...request,
              asOf,
            });
            if (!completed.ok) {
              return { ok: false, error: completed.error.message };
            }
            const savedProfile = localSaveProfile(user.id, {
              userId: user.id,
              dateOfBirth: completed.value.profile.dateOfBirth,
              biologicalSex: completed.value.profile.biologicalSex,
              heightCm: completed.value.profile.heightCm,
              weightKg: completed.value.profile.weightKg,
            });
            const savedRmr = localSaveRmrEstimate(user.id, completed.value.rmr);
            const savedTdee = localSaveTdeeEstimate(user.id, completed.value.tdee);
            const savedGoal = localSaveOnboardingGoal(user.id, completed.value.goalType, asOf);
            const savedCalorieTarget = localSaveCalorieTarget(user.id, completed.value.calorieTarget, {
              goalId: savedGoal.id,
              tdeeEstimateId: savedTdee.id,
            });
            const savedNutritionTarget = localSaveNutritionTarget(user.id, completed.value.nutritionTarget, {
              goalId: savedGoal.id,
              calorieTargetId: savedCalorieTarget.id,
              tdeeKcal: savedCalorieTarget.tdeeKcal,
              targetLbPerWeek: savedCalorieTarget.targetLbPerWeek,
            });
            const savedMealPreferences = localSaveMealPreferences(
              user.id,
              completed.value.mealPreferences,
              asOf,
            );
            const savedCookingPreferences = localSaveCookingPreferences(
              user.id,
              completed.value.cookingPreferences,
              asOf,
            );
            setProfile(savedProfile);
            setCurrentRmr(savedRmr);
            setCurrentTdee(savedTdee);
            setCurrentCalorieTarget(savedCalorieTarget);
            setNutritionTarget(savedNutritionTarget);
            setMealPreferences(savedMealPreferences);
            setCookingPreferences(savedCookingPreferences);
            setGoal(savedGoal);
            await persistLocalStoreSnapshot(user.id);
            return {
              ok: true,
              rmr: savedRmr,
              tdee: savedTdee,
              goal: savedGoal,
              calorieTarget: savedCalorieTarget,
              nutritionTarget: savedNutritionTarget,
              mealPreferences: savedMealPreferences,
              cookingPreferences: savedCookingPreferences,
            };
          }
          if (!supabase || !user) {
            return { ok: false, error: "Supabase is not configured." };
          }
          const { data, error } = await supabase.functions.invoke("complete-rmr-onboarding", {
            body: request,
          });
          if (error) {
            return { ok: false, error: error.message };
          }
          const payload = data as {
            profile: ProfileBasics;
            rmr: RmrEstimate;
            tdee: TdeeEstimate;
            goal: Goal;
            calorieTarget: CalorieTarget;
            nutritionTarget: NutritionTarget;
            mealPreferences: MealPreferences;
            cookingPreferences: CookingPreferences;
          };
          setProfile(payload.profile);
          setCurrentRmr(payload.rmr);
          setCurrentTdee(payload.tdee);
          setCurrentCalorieTarget(payload.calorieTarget);
          setNutritionTarget(payload.nutritionTarget);
          setMealPreferences(payload.mealPreferences);
          setCookingPreferences(payload.cookingPreferences);
          setGoal(payload.goal);
          return {
            ok: true,
            rmr: payload.rmr,
            tdee: payload.tdee,
            goal: payload.goal,
            calorieTarget: payload.calorieTarget,
            nutritionTarget: payload.nutritionTarget,
            mealPreferences: payload.mealPreferences,
            cookingPreferences: payload.cookingPreferences,
          };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "Failed to save onboarding",
          };
        }
      },
      async saveCookingPreferences(request) {
        try {
          if (useLocalPlanner) {
            if (!user) {
              return { ok: false, error: "Not signed in" };
            }
            const saved = localSaveCookingPreferences(user.id, request);
            setCookingPreferences(saved);
            await persistLocalStoreSnapshot(user.id);
            return { ok: true, cookingPreferences: saved };
          }
          if (!supabase || !user) {
            return { ok: false, error: "Supabase is not configured." };
          }
          const { data, error } = await supabase.functions.invoke("upsert-cooking-preferences", {
            body: request,
          });
          if (error) {
            return { ok: false, error: error.message };
          }
          const payload = data as { cookingPreferences: CookingPreferences };
          setCookingPreferences(payload.cookingPreferences);
          return { ok: true, cookingPreferences: payload.cookingPreferences };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "Failed to save cooking preferences",
          };
        }
      },
      async saveMealPreferences(request) {
        try {
          if (useLocalPlanner) {
            if (!user) {
              return { ok: false, error: "Not signed in" };
            }
            const saved = localSaveMealPreferences(user.id, request);
            setMealPreferences(saved);
            await persistLocalStoreSnapshot(user.id);
            return { ok: true, mealPreferences: saved };
          }
          if (!supabase || !user) {
            return { ok: false, error: "Supabase is not configured." };
          }
          const { data, error } = await supabase.functions.invoke("upsert-meal-preferences", {
            body: request,
          });
          if (error) {
            return { ok: false, error: error.message };
          }
          const payload = data as { mealPreferences: MealPreferences };
          setMealPreferences(payload.mealPreferences);
          return { ok: true, mealPreferences: payload.mealPreferences };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "Failed to save meal preferences",
          };
        }
      },
      async saveGoal(request) {
        try {
          if (useLocalPlanner) {
            if (!user) {
              return { ok: false, error: "Not signed in" };
            }
            const saved = localSaveGoal(user.id, request);
            setGoal(saved);
            setNutritionTarget(null);
            setDailyPlan(null);
            return { ok: true };
          }
          if (!supabase) {
            return { ok: false, error: "Supabase is not configured." };
          }
          const { data, error } = await supabase.functions.invoke("create-goal", {
            body: request,
          });
          if (error) {
            return { ok: false, error: error.message };
          }
          setGoal(data as Goal);
          setNutritionTarget(null);
          setDailyPlan(null);
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : "Failed to save goal" };
        }
      },
      async generateTodayPlan() {
        try {
          if (useLocalPlanner) {
            if (!user) {
              return { ok: false, error: "Not signed in" };
            }
            const generated = localGeneratePlan(user.id);
            setNutritionTarget(generated.nutritionTarget);
            setDailyPlan(generated.dailyPlan);
            return { ok: true };
          }
          if (!supabase) {
            return { ok: false, error: "Supabase is not configured." };
          }
          const { data, error } = await supabase.functions.invoke("generate-daily-plan", {
            body: {},
          });
          if (error) {
            return { ok: false, error: error.message };
          }
          const payload = data as {
            nutritionTarget: NutritionTarget;
            dailyPlan: DailyPlan;
          };
          setNutritionTarget(payload.nutritionTarget);
          setDailyPlan(payload.dailyPlan);
          return { ok: true };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "Failed to generate plan",
          };
        }
      },
      async generateRecipe(request) {
        try {
          if (useLocalPlanner) {
            return {
              ok: false,
              error:
                "Recipe generation requires Supabase remote mode with server-side GEMINI_API_KEY. Local planner mode cannot call Gemini.",
              code: "LLM_CONFIGURATION_ERROR",
            };
          }
          if (!supabase) {
            return {
              ok: false,
              error: "Supabase is not configured.",
              code: "LLM_CONFIGURATION_ERROR",
            };
          }
          if (!user) {
            return { ok: false, error: "Not signed in" };
          }
          const client = supabase;
          const result = await invokeGenerateRecipe(
            async (functionName, options) => {
              const invoked = await client.functions.invoke(functionName, options);
              return {
                data: invoked.data,
                error: invoked.error
                  ? {
                      message: invoked.error.message,
                      // FunctionsHttpError.context holds the Response body for non-2xx.
                      context:
                        "context" in invoked.error
                          ? (invoked.error as { context?: unknown }).context
                          : undefined,
                    }
                  : null,
              };
            },
            request,
          );
          if (!result.ok) {
            return {
              ok: false,
              error: result.error.message,
              code: result.error.code,
              diagnostics: result.error.diagnostics,
            };
          }
          return {
            ok: true,
            recipe: result.recipe,
            meta: result.meta,
          };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "Failed to generate recipe",
          };
        }
      },
      async generateWeeklyStrategy(request) {
        try {
          if (useLocalPlanner) {
            return {
              ok: false,
              error:
                "Weekly strategy generation requires Supabase remote mode with server-side GEMINI_API_KEY. Local planner mode cannot call Gemini.",
              code: "LLM_CONFIGURATION_ERROR",
            };
          }
          if (!supabase) {
            return {
              ok: false,
              error: "Supabase is not configured.",
              code: "LLM_CONFIGURATION_ERROR",
            };
          }
          if (!user) {
            return { ok: false, error: "Not signed in" };
          }
          const client = supabase;
          const result = await invokeGenerateWeeklyStrategy(
            async (functionName, options) => {
              const invoked = await client.functions.invoke(functionName, options);
              return {
                data: invoked.data,
                error: invoked.error
                  ? {
                      message: invoked.error.message,
                      context:
                        "context" in invoked.error
                          ? (invoked.error as { context?: unknown }).context
                          : undefined,
                    }
                  : null,
              };
            },
            request,
          );
          if (!result.ok) {
            return {
              ok: false,
              error: result.error.message,
              code: result.error.code,
              diagnostics: result.error.diagnostics,
            };
          }
          return {
            ok: true,
            strategy: result.strategy,
            stats: result.stats,
            meta: result.meta,
          };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "Failed to generate weekly strategy",
          };
        }
      },
      async generateRankedWeeklyStrategy(request) {
        try {
          if (useLocalPlanner) {
            return {
              ok: false,
              error:
                "Weekly strategy generation requires Supabase remote mode with server-side GEMINI_API_KEY. Local planner mode cannot call Gemini.",
              code: "LLM_CONFIGURATION_ERROR",
            };
          }
          if (!supabase) {
            return {
              ok: false,
              error: "Supabase is not configured.",
              code: "LLM_CONFIGURATION_ERROR",
            };
          }
          if (!user) {
            return { ok: false, error: "Not signed in" };
          }
          const client = supabase;
          const result = await invokeGenerateRankedWeeklyStrategy(
            async (functionName, options) => {
              const invoked = await client.functions.invoke(functionName, options);
              return {
                data: invoked.data,
                error: invoked.error
                  ? {
                      message: invoked.error.message,
                      context:
                        "context" in invoked.error
                          ? (invoked.error as { context?: unknown }).context
                          : undefined,
                    }
                  : null,
              };
            },
            request,
          );
          if (!result.ok) {
            return {
              ok: false,
              error: result.error.message,
              code: result.error.code,
              diagnostics: result.error.diagnostics,
            };
          }
          return {
            ok: true,
            strategy: result.strategy,
            stats: result.stats,
            meta: result.meta,
          };
        } catch (e) {
          return {
            ok: false,
            error:
              e instanceof Error ? e.message : "Failed to generate ranked weekly strategy",
          };
        }
      },
      async discoverCulinaryCandidates(request) {
        try {
          if (useLocalPlanner) {
            return {
              ok: false,
              error:
                "Culinary discovery requires Supabase remote mode with server-side GEMINI_API_KEY. Local planner mode cannot call Gemini.",
              code: "LLM_CONFIGURATION_ERROR",
            };
          }
          if (!supabase) {
            return {
              ok: false,
              error: "Supabase is not configured.",
              code: "LLM_CONFIGURATION_ERROR",
            };
          }
          if (!user) {
            return { ok: false, error: "Not signed in" };
          }
          const client = supabase;
          const result = await invokeCulinaryDiscovery(
            async (functionName, options) => {
              const invoked = await client.functions.invoke(functionName, options);
              return {
                data: invoked.data,
                error: invoked.error
                  ? {
                      message: invoked.error.message,
                      context:
                        "context" in invoked.error
                          ? (invoked.error as { context?: unknown }).context
                          : undefined,
                    }
                  : null,
              };
            },
            request,
          );
          if (!result.ok) {
            return {
              ok: false,
              error: result.error.message,
              code: result.error.code,
              diagnostics: result.error.diagnostics,
            };
          }
          return {
            ok: true,
            result: result.result,
            meta: result.meta,
          };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "Failed to discover culinary candidates",
          };
        }
      },
      async rankCulinaryCandidates(request) {
        try {
          // Ranking is deterministic domain logic (no Gemini, no secrets).
          // Always run in-process so the preview does not depend on a hosted
          // Edge Function / CORS preflight. Discover-then-rank still uses
          // culinary-discovery remotely when Gemini is required.
          const ranked = rankCulinaryCandidatesLocally(request);
          if (!ranked.ok) {
            return {
              ok: false,
              error: ranked.error.message,
              code: ranked.error.code,
              diagnostics: ranked.error.diagnostics,
            };
          }
          return {
            ok: true,
            result: ranked.result,
            meta: ranked.meta,
          };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "Failed to rank culinary candidates",
          };
        }
      },
      async resolveWeeklyRecipes(input) {
        try {
          if (useLocalPlanner) {
            return {
              ok: false,
              error:
                "Recipe resolution requires Supabase remote mode with server-side GEMINI_API_KEY. Local planner mode cannot call Gemini.",
              code: "LLM_CONFIGURATION_ERROR",
            };
          }
          if (!supabase) {
            return {
              ok: false,
              error: "Supabase is not configured.",
              code: "LLM_CONFIGURATION_ERROR",
            };
          }
          if (!user) {
            return { ok: false, error: "Not signed in" };
          }
          const client = supabase;
          const result = await invokeResolveRecipes(
            async (functionName, options) => {
              const invoked = await client.functions.invoke(functionName, options);
              return {
                data: invoked.data,
                error: invoked.error
                  ? {
                      message: invoked.error.message,
                      context:
                        "context" in invoked.error
                          ? (invoked.error as { context?: unknown }).context
                          : undefined,
                    }
                  : null,
              };
            },
            input,
          );
          if (!result.ok) {
            return {
              ok: false,
              error: result.error.message,
              code: result.error.code,
              diagnostics: result.error.diagnostics,
              result: result.result,
              failures: result.failures,
              meta: result.meta,
            };
          }
          return {
            ok: true,
            result: result.result,
            failures: result.failures,
            meta: result.meta,
          };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "Failed to resolve recipes",
          };
        }
      },
      async resolveRecipeNutrition(input) {
        try {
          if (useLocalPlanner) {
            return {
              ok: false,
              error:
                "Food resolution requires Supabase remote mode with server-side USDA_API_KEY.",
              code: "FOOD_PROVIDER_CONFIGURATION_ERROR",
            };
          }
          if (!supabase) {
            return {
              ok: false,
              error: "Supabase is not configured.",
              code: "FOOD_PROVIDER_CONFIGURATION_ERROR",
            };
          }
          if (!user) {
            return { ok: false, error: "Not signed in" };
          }
          const client = supabase;
          const result = await invokeResolveRecipeNutrition(
            async (functionName, options) => {
              const invoked = await client.functions.invoke(functionName, {
                body: options.body,
              });
              return {
                data: invoked.data,
                error: invoked.error
                  ? {
                      message: invoked.error.message,
                      context:
                        "context" in invoked.error
                          ? (invoked.error as { context?: unknown }).context
                          : undefined,
                    }
                  : null,
              };
            },
            input,
          );
          if (!result.ok) {
            return {
              ok: false,
              error: result.error.message,
              code: result.error.code,
              diagnostics: result.error.diagnostics,
              meta: result.meta,
            };
          }
          return {
            ok: true,
            result: result.result,
            meta: result.meta,
          };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "Failed to resolve recipe nutrition",
          };
        }
      },
      async composeMealConcepts(input) {
        try {
          if (useLocalPlanner) {
            return composeMealConceptsLocally(input);
          }
          if (!supabase) {
            return {
              ok: false,
              error: "Supabase is not configured.",
              code: "LLM_CONFIGURATION_ERROR",
            };
          }
          if (!user) {
            return { ok: false, error: "Not signed in" };
          }
          const client = supabase;
          const result = await invokeComposeMeals(
            async (functionName, options) => {
              const invoked = await client.functions.invoke(functionName, {
                body: options.body,
              });
              return {
                data: invoked.data,
                error: invoked.error
                  ? {
                      message: invoked.error.message,
                      context:
                        "context" in invoked.error
                          ? (invoked.error as { context?: unknown }).context
                          : undefined,
                    }
                  : null,
              };
            },
            input,
          );
          if (!result.ok) {
            if (isLegacyComposeMealsRecipesRequiredError(result.error)) {
              return composeMealConceptsLocally(input);
            }
            return {
              ok: false,
              error: result.error.message,
              code: result.error.code,
              diagnostics: result.error.diagnostics,
              meta: result.meta,
            };
          }
          return {
            ok: true,
            concepts: result.concepts!,
            meta: result.meta,
          };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "Failed to compose meals",
          };
        }
      },
    };

    return {
      ...api,
      async generateWeeklyPlan() {
        const generating: ConsumerWeeklyPlan = {
          ...createEmptyConsumerPlan(),
          status: "generating",
          generationStage: "understanding_preferences",
        };
        await persistWeeklyPlan(generating);
        const result = await generateConsumerWeeklyPlan(
          {
            useLocalMode: useLocalPlanner,
            nutritionTarget,
            mealPreferences,
            cookingPreferences,
            discoverCulinaryCandidates: api.discoverCulinaryCandidates,
            rankCulinaryCandidates: api.rankCulinaryCandidates,
            composeMealConcepts: api.composeMealConcepts,
            generateRankedWeeklyStrategy: api.generateRankedWeeklyStrategy,
            resolveWeeklyRecipes: api.resolveWeeklyRecipes,
            resolveRecipeNutrition: api.resolveRecipeNutrition,
            resolveSelectedCompleteMeals: async (input) => {
              try {
                if (useLocalPlanner) {
                  return {
                    ok: false,
                    error: "Selected resolution uses local domain path in local planner mode.",
                  };
                }
                if (!supabase || !user) {
                  return { ok: false, error: "Not signed in" };
                }
                const client = supabase;
                const result = await invokeComposeMeals(
                  async (functionName, options) => {
                    const invoked = await client.functions.invoke(functionName, {
                      body: options.body,
                    });
                    return {
                      data: invoked.data,
                      error: invoked.error
                        ? {
                            message: invoked.error.message,
                            context:
                              "context" in invoked.error
                                ? (invoked.error as { context?: unknown }).context
                                : undefined,
                          }
                        : null,
                    };
                  },
                  {
                    stage: "selected_resolution",
                    mealConcepts: input.mealConcepts,
                    selectedCandidateIds: input.selectedCandidateIds,
                    recipes: input.recipes,
                    targetCalories: input.targetCalories,
                    resolveAddedComponents: true,
                  },
                );
                if (!result.ok) {
                  return {
                    ok: false,
                    error: result.error.message,
                    code: result.error.code,
                  };
                }
                if (!result.composition) {
                  return { ok: false, error: "Selected resolution returned no complete meals." };
                }
                return { ok: true, result: result.composition };
              } catch (e) {
                return {
                  ok: false,
                  error:
                    e instanceof Error ? e.message : "Failed to resolve selected complete meals",
                };
              }
            },
          },
          async (stage: ConsumerPlanGenerationStage) => {
            await persistWeeklyPlan({
              ...generating,
              status: "generating",
              generationStage: stage,
            });
          },
        );
        await persistWeeklyPlan(result.plan);
        return result;
      },
    };
  }, [loading, user, profile, currentRmr, currentTdee, currentCalorieTarget, goal, nutritionTarget, mealPreferences, cookingPreferences, dailyPlan, weeklyPlan]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}
