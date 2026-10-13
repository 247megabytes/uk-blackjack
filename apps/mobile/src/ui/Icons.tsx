import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from './theme';

interface IconProps {
  size?: number;
  colour?: string;
}

/** Circular arrow showing play direction; mirrored for anticlockwise. */
export function DirectionIcon({ size = 22, colour = colors.brass, clockwise }: IconProps & { clockwise: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={clockwise ? undefined : { transform: [{ scaleX: -1 }] }}>
      <Path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke={colour} strokeWidth={2.2} />
      <Path d="M19.5 3.5v4.6h-4.6" fill="none" stroke={colour} strokeWidth={2.2} />
    </Svg>
  );
}

export function BellIcon({ size = 18, colour = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6Z" fill={colour} />
      <Circle cx={12} cy={19.5} r={2} fill={colour} />
    </Svg>
  );
}

export function CloseIcon({ size = 20, colour = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" stroke={colour} strokeWidth={2.2} />
    </Svg>
  );
}

export function BackIcon({ size = 22, colour = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M15 5l-7 7 7 7" fill="none" stroke={colour} strokeWidth={2.2} />
    </Svg>
  );
}
