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
  CompleteOnboardingRequest,
  CreateGoalRequest,
  DailyPlan,
  Goal,
  NutritionTarget,
  ProfileBasics,
  RmrEstimate,
  TdeeEstimate,
} from "@fitness-autopilot/contracts";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { completeOnboarding as completeOnboardingDomain } from "@fitness-autopilot/domain";
import { supabase, useLocalPlanner } from "../lib/supabase";
import {
  ensureLocalUser,
  getLocalStore,
  localGeneratePlan,
  localSaveGoal,
  localSaveOnboardingGoal,
  localSaveProfile,
  localSaveCalorieTarget,
  localSaveRmrEstimate,
  localSaveTdeeEstimate,
} from "../lib/local-planner";
import { mapCalorieTargetRow, mapGoalRow, mapProfileRow, mapRmrRow, mapTdeeRow } from "../lib/rmr-mappers";

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
  dailyPlan: DailyPlan | null;
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signUp: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
  completeOnboarding: (
    request: CompleteOnboardingRequest,
  ) => Promise<
    | { ok: true; rmr: RmrEstimate; tdee: TdeeEstimate; goal: Goal; calorieTarget: CalorieTarget }
    | { ok: false; error: string }
  >;
  saveGoal: (
    request: CreateGoalRequest,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  generateTodayPlan: () => Promise<{ ok: true } | { ok: false; error: string }>;
};

const SessionContext = createContext<SessionValue | null>(null);
const LOCAL_USER_KEY = "fa.local.user";

async function loadRemoteOnboardingState(userId: string): Promise<{
  profile: ProfileBasics | null;
  currentRmr: RmrEstimate | null;
  currentTdee: TdeeEstimate | null;
  currentCalorieTarget: CalorieTarget | null;
  goal: Goal | null;
}> {
  if (!supabase) {
    return { profile: null, currentRmr: null, currentTdee: null, currentCalorieTarget: null, goal: null };
  }
  const [profileRes, rmrRes, tdeeRes, calorieRes, goalRes] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("user_id, date_of_birth, biological_sex, height_cm, weight_kg")
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
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (useLocalPlanner) {
          const raw = await AsyncStorage.getItem(LOCAL_USER_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as SessionUser;
            const store = getLocalStore(parsed.id) ?? ensureLocalUser(parsed.email, "restored");
            if (!cancelled) {
              setUser({ id: store.userId, email: store.email });
              setProfile(store.profile);
              setCurrentRmr(store.currentRmr);
              setCurrentTdee(store.currentTdee);
              setCurrentCalorieTarget(store.currentCalorieTarget);
              setGoal(store.goal);
              setNutritionTarget(store.nutritionTarget);
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
              setGoal(loaded.goal);
            }
          }
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

  const value = useMemo<SessionValue>(
    () => ({
      loading,
      useLocalMode: useLocalPlanner,
      user,
      profile,
      currentRmr,
      currentTdee,
      currentCalorieTarget,
      goal,
      nutritionTarget,
      dailyPlan,
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
            setProfile(savedProfile);
            setCurrentRmr(savedRmr);
            setCurrentTdee(savedTdee);
            setCurrentCalorieTarget(savedCalorieTarget);
            setGoal(savedGoal);
            return {
              ok: true,
              rmr: savedRmr,
              tdee: savedTdee,
              goal: savedGoal,
              calorieTarget: savedCalorieTarget,
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
          };
          setProfile(payload.profile);
          setCurrentRmr(payload.rmr);
          setCurrentTdee(payload.tdee);
          setCurrentCalorieTarget(payload.calorieTarget);
          setGoal(payload.goal);
          return {
            ok: true,
            rmr: payload.rmr,
            tdee: payload.tdee,
            goal: payload.goal,
            calorieTarget: payload.calorieTarget,
          };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "Failed to save onboarding",
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
    }),
    [loading, user, profile, currentRmr, currentTdee, currentCalorieTarget, goal, nutritionTarget, dailyPlan],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}
