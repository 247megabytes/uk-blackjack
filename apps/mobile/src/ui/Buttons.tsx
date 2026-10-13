import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from './theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  icon?: ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

export function Button({ label, onPress, variant = 'primary', disabled, icon, compact, style, accessibilityHint }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        variantStyles[variant],
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.row}>
        {icon}
        <Text style={[styles.label, compact && styles.labelCompact, { color: labelColour[variant] }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const labelColour: Record<Variant, string> = {
  primary: colors.ink,
  secondary: colors.text,
  danger: '#FFF6F2',
  ghost: colors.textMuted,
};

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.brass, borderColor: colors.brassBright },
  secondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.hairline },
  danger: { backgroundColor: colors.red, borderColor: colors.redSoft },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
});

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: 22,
    borderRadius: radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { minHeight: 46, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 17, fontWeight: '600' },
  labelCompact: { fontSize: 15 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  disabled: { opacity: 0.4 },
});

/** Round icon-only button for headers (min 44pt touch target). */
export function IconButton({ onPress, label, children }: { onPress: () => void; label: string; children: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [iconStyles.base, pressed && { opacity: 0.6 }]}
    >
      {children}
    </Pressable>
  );
}

const iconStyles = StyleSheet.create({
  base: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(25, 28, 27, 0.55)',
  },
});
