import { Platform } from 'react-native';

export const colors = {
  chrome: '#191C1B',
  surface: '#232826',
  surfaceRaised: '#2C3230',
  hairline: 'rgba(236, 232, 222, 0.12)',
  baize: '#1E4636',
  baizeDeep: '#14302A',
  baizeLine: 'rgba(200, 160, 74, 0.28)',
  ivory: '#F5EFE1',
  ivoryShade: '#E6DECB',
  ink: '#1B1D1E',
  brass: '#C8A04A',
  brassBright: '#E2BE68',
  brassDeep: '#8E6E2C',
  red: '#C4262E',
  redSoft: '#E0575D',
  text: '#ECE8DE',
  textMuted: '#A3ACA6',
  textFaint: '#6F7873',
  win: '#7FC29B',
} as const;

export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' });

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { card: 8, button: 14, pill: 999, sheet: 22 } as const;

export const type = {
  display: { fontFamily: serif, fontSize: 40, lineHeight: 46, color: colors.text, letterSpacing: 0.2 },
  title: { fontFamily: serif, fontSize: 26, lineHeight: 32, color: colors.text },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  small: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
} as const;

export const cardSizes = {
  hand: { width: 64, height: 92 },
  table: { width: 78, height: 112 },
  mini: { width: 20, height: 29 },
  tray: { width: 36, height: 52 },
  showcase: { width: 70, height: 100 },
} as const;

export type CardSize = keyof typeof cardSizes;
