import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from './theme';

/** Full-bleed baize background: a lit centre falling off into a darker rim. */
export function Felt({ id = 'felt' }: { id?: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={id} cx="50%" cy="42%" r="75%">
            <Stop offset="0%" stopColor={colors.baize} />
            <Stop offset="70%" stopColor={colors.baizeDeep} />
            <Stop offset="100%" stopColor={colors.chrome} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
