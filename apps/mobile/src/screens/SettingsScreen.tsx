import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useSettings } from '../state/settings';
import { Button } from '../ui/Buttons';
import { colors, space, type as t } from '../ui/theme';
import { Screen } from './Screen';
import { PACING_LABELS, Segmented } from './SetupScreen';

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { settings, stats, update, resetStats } = useSettings();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <Screen title="Settings" onBack={onBack}>
      <View style={styles.block}>
        <Text style={t.heading}>Game speed</Text>
        <Text style={t.small}>How long the bots take over each move.</Text>
        <Segmented value={settings.pacing} options={['relaxed', 'normal', 'fast'] as const} labels={PACING_LABELS} onChange={(pacing) => update({ pacing })} />
      </View>

      <View style={styles.block}>
        <Toggle label="Highlight playable cards" detail="Lift cards you can play and dim the rest." value={settings.highlightPlayable} onChange={(highlightPlayable) => update({ highlightPlayable })} />
        <View style={styles.divider} />
        <Toggle label="Haptics" detail="Vibration feedback for attacks, blocks and wins." value={settings.haptics} onChange={(haptics) => update({ haptics })} />
      </View>

      <View style={styles.block}>
        <Text style={t.heading}>Your record</Text>
        <Text style={styles.body}>
          {stats.played === 0 ? 'No games finished yet.' : `${stats.won} won of ${stats.played} played. Best streak: ${stats.bestStreak}.`}
        </Text>
        {stats.played > 0 ? (
          confirmReset ? (
            <View style={styles.row}>
              <Button label="Reset record" variant="danger" compact onPress={() => { resetStats(); setConfirmReset(false); }} style={styles.flex} />
              <Button label="Cancel" variant="secondary" compact onPress={() => setConfirmReset(false)} style={styles.flex} />
            </View>
          ) : (
            <Button label="Reset record" variant="secondary" compact onPress={() => setConfirmReset(true)} />
          )
        ) : null}
      </View>

      <Text style={styles.footnote}>Rules: uk-classic-v1. Everything is stored on this device only.</Text>
    </Screen>
  );
}

function Toggle({ label, detail, value, onChange }: { label: string; detail: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <View style={styles.flex}>
        <Text style={t.body}>{label}</Text>
        <Text style={t.small}>{detail}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: colors.surfaceRaised, true: colors.brassDeep }}
        thumbColor={value ? colors.brassBright : colors.textMuted}
        ios_backgroundColor={colors.surfaceRaised}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md, padding: space.lg, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  row: { flexDirection: 'row', gap: space.md },
  flex: { flex: 1 },
  footnote: { color: colors.textFaint, fontSize: 12, textAlign: 'center' },
});
