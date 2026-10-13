import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../ui/Buttons';
import { BackIcon } from '../ui/Icons';
import { colors, serif, space } from '../ui/theme';

/** Standard chrome for non-table screens: back button, serif title, scrollable body, pinned footer. */
export function Screen({ title, onBack, children, footer }: { title: string; onBack: () => void; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton label="Back" onPress={onBack}>
          <BackIcon />
        </IconButton>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.chrome },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md },
  title: { flex: 1, textAlign: 'center', fontFamily: serif, fontSize: 22, color: colors.text },
  spacer: { width: 44 },
  body: { padding: space.xl, paddingTop: space.md, gap: space.lg, maxWidth: 560, width: '100%', alignSelf: 'center' },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline, maxWidth: 560, width: '100%', alignSelf: 'center' },
});
