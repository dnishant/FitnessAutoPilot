import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../src/state/session";

export default function TodayScreen() {
  const { dailyPlan, nutritionTarget, signOut } = useSession();

  if (!dailyPlan) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Today</Text>
        <Text style={styles.help}>No plan yet. Generate a deterministic day first.</Text>
        <Pressable style={styles.primary} onPress={() => router.push("/generate")}>
          <Text style={styles.primaryText}>Generate plan</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Today</Text>
      <Text style={styles.date}>{dailyPlan.planDate}</Text>

      <View style={styles.targetBox}>
        <Text style={styles.targetLabel}>Target</Text>
        <Text style={styles.targetValue}>
          {nutritionTarget?.targetCalories ?? dailyPlan.plannedCalories} kcal
        </Text>
        <Text style={styles.targetValue}>
          {nutritionTarget?.proteinG ?? dailyPlan.plannedProteinG} g protein
        </Text>
        <Text style={styles.targetMeta}>
          Planned: {dailyPlan.plannedCalories} kcal · {dailyPlan.plannedProteinG} g protein
        </Text>
      </View>

      {dailyPlan.meals.map((meal) => (
        <View key={`${meal.mealType}-${meal.recipeId}`} style={styles.meal}>
          <Text style={styles.mealType}>{meal.mealType}</Text>
          <Text style={styles.mealName}>{meal.recipeName}</Text>
          <Text style={styles.mealMacros}>
            {meal.plannedCalories} kcal · {meal.plannedProteinG} g protein ·{" "}
            {meal.plannedCarbsG} g carbs · {meal.plannedFatG} g fat
          </Text>
          {meal.ingredientSnapshot.map((ing) => (
            <Text key={ing.recipeIngredientId} style={styles.ingredient}>
              {ing.quantityG} g {ing.foodName}
            </Text>
          ))}
        </View>
      ))}

      <Pressable style={styles.secondary} onPress={() => router.push("/generate")}>
        <Text style={styles.secondaryText}>Regenerate day</Text>
      </Pressable>
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
  date: { color: "#3D5A4C", marginTop: -8 },
  help: { color: "#3D5A4C" },
  targetBox: {
    backgroundColor: "#0B1F17",
    borderRadius: 10,
    padding: 16,
    gap: 4,
  },
  targetLabel: { color: "#A8C4B4", fontWeight: "600" },
  targetValue: { color: "#fff", fontSize: 22, fontWeight: "800" },
  targetMeta: { color: "#A8C4B4", marginTop: 6, fontSize: 12 },
  meal: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#C9D9CF",
    gap: 4,
  },
  mealType: { textTransform: "uppercase", fontSize: 12, fontWeight: "700", color: "#1F6F4A" },
  mealName: { fontSize: 18, fontWeight: "700", color: "#0B1F17" },
  mealMacros: { color: "#3D5A4C", marginBottom: 4 },
  ingredient: { color: "#0B1F17", paddingLeft: 4 },
  primary: {
    backgroundColor: "#1F6F4A",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  secondary: { paddingVertical: 10, alignItems: "center" },
  secondaryText: { color: "#1F6F4A", fontWeight: "600" },
});
