import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  CUISINE_OPTIONS,
  EXPERIENCE_OPTIONS,
  PROTEIN_OPTIONS,
  VARIETY_OPTIONS,
  type CuisineValue,
  type ExperienceValue,
  type ProteinValue,
  type VarietyLevel,
} from "@fitness-autopilot/contracts";
import {
  addOnboardingAllergy,
  addOnboardingDislike,
  addOnboardingRestriction,
  chooseOnboardingVariety,
  continueFromCuisine,
  continueFromExclusions,
  continueFromExperience,
  continueFromProteins,
  continueFromVariety,
  removeOnboardingAllergy,
  removeOnboardingDislike,
  removeOnboardingRestriction,
  toggleOnboardingCuisine,
  toggleOnboardingExperience,
  toggleOnboardingProtein,
  type OnboardingView,
} from "@fitness-autopilot/domain";

export function MealPreferenceSteps(props: {
  view: OnboardingView;
  onChange: (next: OnboardingView) => void;
  onComplete: (next: OnboardingView) => void;
  busy?: boolean;
  persistError?: string | null;
}) {
  const { view, onChange, onComplete, busy, persistError } = props;

  function finish() {
    const next = continueFromVariety(view);
    onChange(next);
    if (!next.error && next.mealPreferences) {
      onComplete(next);
    }
  }

  return (
    <>
      {view.step === "cuisine" ? (
        <>
          <Text style={styles.title}>What cuisines do you enjoy?</Text>
          <Text style={styles.help}>
            Pick as many as you like. Surprise me can sit alongside other cuisines.
          </Text>
          <ChipGroup>
            {CUISINE_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={view.draft.cuisines.includes(option.value)}
                onPress={() =>
                  onChange(toggleOnboardingCuisine(view, option.value as CuisineValue))
                }
              />
            ))}
          </ChipGroup>
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <Pressable style={styles.primary} onPress={() => onChange(continueFromCuisine(view))}>
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
        </>
      ) : null}

      {view.step === "proteins" ? (
        <>
          <Text style={styles.title}>What proteins do you enjoy?</Text>
          <Text style={styles.help}>
            These are likes, not rules. Skipping a protein does not mean you refuse it.
          </Text>
          <ChipGroup>
            {PROTEIN_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={view.draft.proteinPreferences.includes(option.value)}
                onPress={() =>
                  onChange(toggleOnboardingProtein(view, option.value as ProteinValue))
                }
              />
            ))}
          </ChipGroup>
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <Pressable style={styles.primary} onPress={() => onChange(continueFromProteins(view))}>
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
        </>
      ) : null}

      {view.step === "exclusions" ? (
        <>
          <Text style={styles.title}>Anything we should never include?</Text>
          <Text style={styles.help}>
            Allergies, restrictions, and dislikes stay separate. Skip any you do not need.
          </Text>
          <TagSection
            label="Allergy"
            placeholder="Peanuts"
            value={view.draft.allergyDraft}
            tags={view.draft.allergies}
            onChangeText={(value) =>
              onChange({ ...view, error: null, draft: { ...view.draft, allergyDraft: value } })
            }
            onAdd={() => onChange(addOnboardingAllergy(view))}
            onRemove={(tag) => onChange(removeOnboardingAllergy(view, tag))}
          />
          <TagSection
            label="Restriction"
            placeholder="Pork"
            value={view.draft.restrictionDraft}
            tags={view.draft.dietaryRestrictions}
            onChangeText={(value) =>
              onChange({
                ...view,
                error: null,
                draft: { ...view.draft, restrictionDraft: value },
              })
            }
            onAdd={() => onChange(addOnboardingRestriction(view))}
            onRemove={(tag) => onChange(removeOnboardingRestriction(view, tag))}
          />
          <TagSection
            label="Dislike"
            placeholder="Olives"
            value={view.draft.dislikeDraft}
            tags={view.draft.dislikes}
            onChangeText={(value) =>
              onChange({ ...view, error: null, draft: { ...view.draft, dislikeDraft: value } })
            }
            onAdd={() => onChange(addOnboardingDislike(view))}
            onRemove={(tag) => onChange(removeOnboardingDislike(view, tag))}
          />
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <Pressable style={styles.primary} onPress={() => onChange(continueFromExclusions(view))}>
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
        </>
      ) : null}

      {view.step === "experience" ? (
        <>
          <Text style={styles.title}>What kinds of meals sound good to you?</Text>
          <Text style={styles.help}>Soft preferences so later meals can stay flavorful.</Text>
          <ChipGroup>
            {EXPERIENCE_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={view.draft.experiencePreferences.includes(option.value)}
                onPress={() =>
                  onChange(toggleOnboardingExperience(view, option.value as ExperienceValue))
                }
              />
            ))}
          </ChipGroup>
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <Pressable style={styles.primary} onPress={() => onChange(continueFromExperience(view))}>
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
        </>
      ) : null}

      {view.step === "variety" ? (
        <>
          <Text style={styles.title}>How much variety do you want during the week?</Text>
          <Text style={styles.help}>This is intent only. We will not turn it into recipe counts yet.</Text>
          {VARIETY_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.option,
                view.draft.varietyLevel === option.value && styles.optionSelected,
              ]}
              onPress={() =>
                onChange(chooseOnboardingVariety(view, option.value as VarietyLevel))
              }
            >
              <Text style={styles.optionLabel}>{option.label}</Text>
              <Text style={styles.optionDetail}>{option.detail}</Text>
            </Pressable>
          ))}
          {persistError ? <Text style={styles.error}>{persistError}</Text> : null}
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <Pressable style={styles.primary} disabled={busy} onPress={finish}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Continue</Text>}
          </Pressable>
        </>
      ) : null}
    </>
  );
}

function ChipGroup({ children }: { children: ReactNode }) {
  return <View style={styles.chipWrap}>{children}</View>;
}

function Chip(props: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.chip, props.selected && styles.chipSelected]}
      onPress={props.onPress}
    >
      <Text style={[styles.chipText, props.selected && styles.chipTextSelected]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

function TagSection(props: {
  label: string;
  placeholder: string;
  value: string;
  tags: string[];
  onChangeText: (value: string) => void;
  onAdd: () => void;
  onRemove: (tag: string) => void;
}) {
  return (
    <View style={styles.tagSection}>
      <Text style={styles.label}>{props.label}</Text>
      <View style={styles.tagRow}>
        <TextInput
          style={styles.input}
          value={props.value}
          placeholder={props.placeholder}
          onChangeText={props.onChangeText}
          onSubmitEditing={props.onAdd}
        />
        <Pressable style={styles.addButton} onPress={props.onAdd}>
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
      <ChipGroup>
        {props.tags.map((tag) => (
          <Pressable key={tag} style={styles.chipSelected} onPress={() => props.onRemove(tag)}>
            <Text style={styles.chipTextSelected}>{tag} ×</Text>
          </Pressable>
        ))}
      </ChipGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "800", color: "#0B1F17" },
  help: { color: "#3D5A4C", marginBottom: 8 },
  label: { fontWeight: "600", color: "#0B1F17" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#C9D9CF",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipSelected: {
    borderColor: "#1F6F4A",
    backgroundColor: "#E4F0E8",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipText: { fontWeight: "700", color: "#0B1F17" },
  chipTextSelected: { fontWeight: "700", color: "#1F6F4A" },
  input: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#C9D9CF",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tagSection: { gap: 8 },
  tagRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  addButton: {
    backgroundColor: "#1F6F4A",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  addButtonText: { color: "#fff", fontWeight: "700" },
  option: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#C9D9CF",
    borderRadius: 8,
    padding: 14,
  },
  optionSelected: { borderColor: "#1F6F4A", backgroundColor: "#E4F0E8" },
  optionLabel: { fontWeight: "700", color: "#0B1F17", fontSize: 16 },
  optionDetail: { color: "#3D5A4C", marginTop: 4 },
  primary: {
    marginTop: 8,
    backgroundColor: "#1F6F4A",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  error: { color: "#9B1C1C" },
});
