import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { onboardingGoalLabel, type OnboardingGoalType } from "@fitness-autopilot/contracts";
import {
  calorieTargetGoalLabel,
  calorieTargetPaceLabel,
  formatLbPerWeek,
  formatMacroGrams,
  formatNutritionCalories,
  formatRmrKcalPerDay,
  formatTargetCaloriesPerDay,
  formatTdeeKcalPerDay,
  MACRO_CARB_EXPLANATION,
  MACRO_FAT_EXPLANATION,
  MACRO_PROTEIN_EXPLANATION,
  RMR_EXPLANATION,
  rmrHomeSourceLabel,
  TDEE_EXPLANATION,
  tdeeHomeSourceLabel,
} from "@fitness-autopilot/domain";
import { useSession } from "../src/state/session";

export default function TodayScreen() {
  const { currentRmr, currentTdee, currentCalorieTarget, nutritionTarget, goal, signOut } = useSession();
  const goalType =
    goal &&
    (goal.goalType === "muscle_gain" ||
      goal.goalType === "fat_loss" ||
      goal.goalType === "recomposition")
      ? (goal.goalType as OnboardingGoalType)
      : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Today</Text>
      <Text style={styles.help}>What should I do now? Eat to your daily nutrition target.</Text>

      {nutritionTarget ? (
        <View style={styles.nutritionBox}>
          <Text style={styles.rmrLabel}>Daily Nutrition Target</Text>
          <Text style={styles.rmrValue}>{formatNutritionCalories(nutritionTarget.targetCalories)}</Text>
          <Text style={styles.rmrSource}>
            Protein {formatMacroGrams(nutritionTarget.proteinG)} · Fat{" "}
            {formatMacroGrams(nutritionTarget.fatG ?? nutritionTarget.fatMinG)} · Carbs{" "}
            {formatMacroGrams(nutritionTarget.carbohydrateG)}
          </Text>
          <Text style={styles.rmrMeta}>
            Protein: {MACRO_PROTEIN_EXPLANATION}. Fat: {MACRO_FAT_EXPLANATION}. Carbohydrates:{" "}
            {MACRO_CARB_EXPLANATION}.
          </Text>
        </View>
      ) : null}

      {currentCalorieTarget ? (
        <View style={styles.targetBox}>
          <Text style={styles.rmrLabel}>Daily calorie target</Text>
          <Text style={styles.rmrValue}>
            {formatTargetCaloriesPerDay(currentCalorieTarget.targetCalories)}
          </Text>
          <Text style={styles.rmrSource}>
            {calorieTargetPaceLabel(currentCalorieTarget.pace)} ·{" "}
            {formatLbPerWeek(currentCalorieTarget.targetLbPerWeek)}
          </Text>
          <Text style={styles.rmrMeta}>
            {calorieTargetGoalLabel(
              currentCalorieTarget.inputSnapshot.goalType,
            )}{" "}
            from {formatTargetCaloriesPerDay(currentCalorieTarget.tdeeKcal)} maintenance.
          </Text>
        </View>
      ) : null}

      {goalType ? (
        <View style={styles.goalBox}>
          <Text style={styles.goalLabel}>Goal</Text>
          <Text style={styles.goalValue}>{onboardingGoalLabel(goalType)}</Text>
        </View>
      ) : null}

      {currentRmr ? (
        <View style={styles.rmrBox}>
          <Text style={styles.rmrLabel}>Resting Metabolic Rate</Text>
          <Text style={styles.rmrValue}>{formatRmrKcalPerDay(currentRmr.rmrKcal)}</Text>
          <Text style={styles.rmrSource}>{rmrHomeSourceLabel(currentRmr.source)}</Text>
          <Text style={styles.rmrMeta}>{RMR_EXPLANATION}</Text>
        </View>
      ) : (
        <View style={styles.rmrBox}>
          <Text style={styles.rmrLabel}>Resting Metabolic Rate</Text>
          <Text style={styles.rmrMeta}>No RMR yet. Complete onboarding to establish one.</Text>
        </View>
      )}

      {currentTdee ? (
        <View style={styles.tdeeBox}>
          <Text style={styles.rmrLabel}>Total Daily Energy Expenditure</Text>
          <Text style={styles.rmrValue}>{formatTdeeKcalPerDay(currentTdee.tdeeKcal)}</Text>
          <Text style={styles.rmrSource}>{tdeeHomeSourceLabel(currentTdee.source)}</Text>
          <Text style={styles.rmrMeta}>{TDEE_EXPLANATION}</Text>
        </View>
      ) : (
        <View style={styles.tdeeBox}>
          <Text style={styles.rmrLabel}>Total Daily Energy Expenditure</Text>
          <Text style={styles.rmrMeta}>No TDEE yet. Complete onboarding to establish one.</Text>
        </View>
      )}

      <Pressable
        style={styles.secondary}
        onPress={async () => {
          await signOut();
          router.replace("/auth");
        }}
      >
        <Text style={styles.secondaryText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 14 },
  title: { fontSize: 28, fontWeight: "800", color: "#0B1F17" },
  help: { color: "#3D5A4C", marginTop: -8 },
  goalBox: {
    backgroundColor: "#E4F0E8",
    borderRadius: 10,
    padding: 16,
    gap: 4,
  },
  goalLabel: { color: "#3D5A4C", fontWeight: "600" },
  goalValue: { color: "#0B1F17", fontSize: 22, fontWeight: "800" },
  rmrBox: {
    backgroundColor: "#0B1F17",
    borderRadius: 10,
    padding: 16,
    gap: 6,
  },
  tdeeBox: {
    backgroundColor: "#1F6F4A",
    borderRadius: 10,
    padding: 16,
    gap: 6,
  },
  targetBox: {
    backgroundColor: "#145C3B",
    borderRadius: 10,
    padding: 16,
    gap: 6,
  },
  nutritionBox: {
    backgroundColor: "#0F3D2A",
    borderRadius: 10,
    padding: 16,
    gap: 6,
  },
  rmrLabel: { color: "#A8C4B4", fontWeight: "600" },
  rmrValue: { color: "#fff", fontSize: 28, fontWeight: "800" },
  rmrSource: { color: "#E4F0E8", fontWeight: "600" },
  rmrMeta: { color: "#A8C4B4", marginTop: 6, fontSize: 13 },
  secondary: { paddingVertical: 10, alignItems: "center" },
  secondaryText: { color: "#1F6F4A", fontWeight: "600" },
});
