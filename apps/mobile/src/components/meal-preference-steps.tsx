import type { ReactNode } from "react";
import {
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
import {
  ChoiceChip,
  PrimaryButton,
  SelectionCard,
} from "./ui/primitives";
import { colors, radii, spacing, typography } from "../theme/tokens";

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
              <ChoiceChip
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
          <PrimaryButton label="Continue" onPress={() => onChange(continueFromCuisine(view))} />
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
              <ChoiceChip
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
          <PrimaryButton label="Continue" onPress={() => onChange(continueFromProteins(view))} />
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
          <PrimaryButton
            label="Continue"
            onPress={() => onChange(continueFromExclusions(view))}
          />
        </>
      ) : null}

      {view.step === "experience" ? (
        <>
          <Text style={styles.title}>What kinds of meals sound good to you?</Text>
          <Text style={styles.help}>Soft preferences so later meals can stay flavorful.</Text>
          <ChipGroup>
            {EXPERIENCE_OPTIONS.map((option) => (
              <ChoiceChip
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
          <PrimaryButton
            label="Continue"
            onPress={() => onChange(continueFromExperience(view))}
          />
        </>
      ) : null}

      {view.step === "variety" ? (
        <>
          <Text style={styles.title}>How different should your four meals feel?</Text>
          <Text style={styles.help}>
            You always get four meals for six days. This only changes how distinct those four meals are from each other.
          </Text>
          {VARIETY_OPTIONS.map((option) => (
            <SelectionCard
              key={option.value}
              title={option.label}
              detail={option.detail}
              selected={view.draft.varietyLevel === option.value}
              onPress={() =>
                onChange(chooseOnboardingVariety(view, option.value as VarietyLevel))
              }
            />
          ))}
          {persistError ? <Text style={styles.error}>{persistError}</Text> : null}
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <PrimaryButton label="Continue" disabled={busy} loading={busy} onPress={finish} />
        </>
      ) : null}
    </>
  );
}

function ChipGroup({ children }: { children: ReactNode }) {
  return <View style={styles.chipWrap}>{children}</View>;
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
          placeholderTextColor={colors.textMuted}
          onChangeText={props.onChangeText}
          onSubmitEditing={props.onAdd}
        />
        <PrimaryButton label="Add" onPress={props.onAdd} style={styles.addButton} />
      </View>
      <ChipGroup>
        {props.tags.map((tag) => (
          <ChoiceChip
            key={tag}
            label={`${tag} ×`}
            selected
            tone="caution"
            onPress={() => props.onRemove(tag)}
          />
        ))}
      </ChipGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.heading,
    color: colors.text,
  },
  help: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text,
    ...typography.body,
  },
  tagSection: {
    gap: spacing.sm,
  },
  tagRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  addButton: {
    paddingHorizontal: spacing.lg,
    minHeight: 44,
  },
  error: {
    ...typography.body,
    color: colors.error,
  },
});
