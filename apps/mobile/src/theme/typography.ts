import { type TextStyle } from 'react-native';
import { poppins, notoThai } from './fonts';

export type Script = 'latin' | 'thai';
type Weight = 'regular' | 'medium' | 'semibold' | 'bold';
const family = (s: Script, w: Weight) => (s === 'thai' ? notoThai : poppins)[w];

export const typeScale = {
  vendorNameThai: { fontSize: 44, lineHeight: 52, letterSpacing: 0,   weight: 'bold' },
  h1:             { fontSize: 28, lineHeight: 34, letterSpacing: -0.2, weight: 'semibold' },
  title:          { fontSize: 20, lineHeight: 26, letterSpacing: 0,   weight: 'semibold' },
  body:           { fontSize: 16, lineHeight: 24, letterSpacing: 0,   weight: 'regular' },
  label:          { fontSize: 13, lineHeight: 16, letterSpacing: 0.2, weight: 'medium' },
  caption:        { fontSize: 12, lineHeight: 16, letterSpacing: 0.2, weight: 'regular' },
} satisfies Record<string, { fontSize: number; lineHeight: number; letterSpacing: number; weight: Weight }>;
export type TypeVariant = keyof typeof typeScale;

export function typography(variant: TypeVariant, script: Script = 'latin'): TextStyle {
  const v = typeScale[variant];
  return {
    fontFamily: family(script, v.weight),
    fontSize: v.fontSize,
    lineHeight: v.lineHeight,
    letterSpacing: script === 'thai' ? 0 : v.letterSpacing, // Latin tracking breaks Thai clusters
  };
}
