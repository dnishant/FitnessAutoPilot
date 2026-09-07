import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  CreateGoalRequest,
  DailyPlan,
  Goal,
  NutritionTarget,
  UserProfile,
} from "@fitness-autopilot/contracts";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, useLocalPlanner } from "../lib/supabase";
import {
  ensureLocalUser,
  getLocalStore,
  localGeneratePlan,
  localSaveGoal,
  localSaveProfile,
} from "../lib/local-planner";

type SessionUser = { id: string; email: string };

type SessionValue = {
  loading: boolean;
  useLocalMode: boolean;
  user: SessionUser | null;
  profile: UserProfile | null;
  goal: Goal | null;
  nutritionTarget: NutritionTarget | null;
  dailyPlan: DailyPlan | null;
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signUp: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
  saveProfile: (
    profile: UserProfile,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  saveGoal: (
    request: CreateGoalRequest,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  generateTodayPlan: () => Promise<{ ok: true } | { ok: false; error: string }>;
};

const SessionContext = createContext<SessionValue | null>(null);
const LOCAL_USER_KEY = "fa.local.user";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
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
        return { ok: true };
      },
      async signUp(email, password) {
        if (useLocalPlanner) {
          const store = ensureLocalUser(email, password);
          const next = { id: store.userId, email: store.email };
          await AsyncStorage.setItem(LOCAL_USER_KEY, JSON.stringify(next));
          setUser(next);
          setProfile(store.profile);
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
        setGoal(null);
        setNutritionTarget(null);
        setDailyPlan(null);
      },
      async saveProfile(nextProfile) {
        try {
          if (useLocalPlanner) {
            if (!user) {
              return { ok: false, error: "Not signed in" };
            }
            const saved = localSaveProfile(user.id, nextProfile);
            setProfile(saved);
            return { ok: true };
          }
          if (!supabase || !user) {
            return { ok: false, error: "Supabase is not configured." };
          }
          const { error } = await supabase.functions.invoke("upsert-profile", {
            body: nextProfile,
          });
          if (error) {
            return { ok: false, error: error.message };
          }
          setProfile(nextProfile);
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : "Failed to save profile" };
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
    [loading, user, profile, goal, nutritionTarget, dailyPlan],
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
