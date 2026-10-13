import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AVATAR_COLOURS, BOT_NAMES, initials, MAX_BOTS, MIN_BOTS, type PacingName } from '../game';
import { useSettings } from '../state/settings';
import { Button } from '../ui/Buttons';
import { colors, radius, space, type as t } from '../ui/theme';
import { Screen } from './Screen';

interface Props {
  onBack: () => void;
  onStart: () => void;
}

export const PACING_LABELS: Record<PacingName, string> = { relaxed: 'Relaxed', normal: 'Normal', fast: 'Fast' };

export function SetupScreen({ onBack, onStart }: Props) {
  const { settings, update } = useSettings();
  const count = settings.botCount;

  return (
    <Screen title="Play solo" onBack={onBack} footer={<Button label={`Deal ${count + 1} hands`} onPress={onStart} />}>
      <View style={styles.block}>
        <Text style={t.heading}>Opponents</Text>
        <View style={styles.stepper}>
          <StepButton label="Fewer opponents" symbol="−" disabled={count <= MIN_BOTS} onPress={() => update({ botCount: count - 1 })} />
          <Text style={styles.count} accessibilityLiveRegion="polite" accessibilityLabel={`${count} opponents`}>
            {count}
          </Text>
          <StepButton label="More opponents" symbol="+" disabled={count >= MAX_BOTS} onPress={() => update({ botCount: count + 1 })} />
        </View>
        <View style={styles.avatars}>
          {BOT_NAMES.slice(0, count).map((name, i) => (
            <View key={name} style={styles.avatarCol}>
              <View style={[styles.avatar, { backgroundColor: AVATAR_COLOURS[i % AVATAR_COLOURS.length] }]}>
                <Text style={styles.initials}>{initials(name)}</Text>
              </View>
              <Text style={styles.avatarName}>{name}</Text>
            </View>
          ))}
        </View>
        <Text style={t.small}>Easy bots for now — they play fair, see only their own cards, and sometimes forget to say Last Card.</Text>
      </View>

      <View style={styles.block}>
        <Text style={t.heading}>Your name</Text>
        <TextInput
          value={settings.playerName}
          onChangeText={(playerName) => update({ playerName: playerName.slice(0, 16) })}
          placeholder="You"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          maxLength={16}
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel="Your name"
        />
      </View>

      <View style={styles.block}>
        <Text style={t.heading}>Game speed</Text>
        <Segmented<PacingName> value={settings.pacing} options={['relaxed', 'normal', 'fast']} labels={PACING_LABELS} onChange={(pacing) => update({ pacing })} />
      </View>
    </Screen>
  );
}

function StepButton({ label, symbol, disabled, onPress }: { label: string; symbol: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.step, disabled && { opacity: 0.35 }, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.stepText}>{symbol}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ value, options, labels, onChange }: { value: T; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o === value;
        return (
          <Pressable
            key={o}
            onPress={() => onChange(o)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextOn]}>{labels[o]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md, padding: space.lg, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl },
  step: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: colors.brass, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.brass, fontSize: 28, lineHeight: 32, fontWeight: '500' },
  count: { color: colors.text, fontSize: 44, fontWeight: '700', minWidth: 48, textAlign: 'center' },
  avatars: { flexDirection: 'row', justifyContent: 'center', gap: space.md, flexWrap: 'wrap' },
  avatarCol: { alignItems: 'center', width: 54 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.ink, fontWeight: '700' },
  avatarName: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: space.lg, backgroundColor: colors.surfaceRaised, color: colors.text, fontSize: 17, borderWidth: 1, borderColor: colors.hairline },
  segmented: { flexDirection: 'row', backgroundColor: colors.surfaceRaised, borderRadius: radius.button, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.brass },
  segmentText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  segmentTextOn: { color: colors.ink },
});
